import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { ClientSession, Connection, Model, Types } from "mongoose";
import * as crypto from "crypto";
import { InventoryRepo } from "./inventory.repo";
import { InventoryHoldDocument } from "./entity/inventory-hold.entity";
import {
  InventorySlot,
  InventorySlotDocument,
  buildSlotKey,
} from "./entity/inventory-slot.entity";
import { Room, RoomDocument } from "../room/entity/room.entity";
import { Service, ServiceDocument } from "../service/entity/service.entity";
import { ServiceKind } from "../common/enums/service.enum";
import {
  HoldStatus,
  SlotKind,
  SlotStatus,
} from "../common/enums/inventory.enum";
import {
  eachNight,
  toBusinessDate,
  zonedAt,
} from "../common/helpers/time.helper";

export class SlotUnavailableError extends Error {
  constructor(public readonly slotKey: string) {
    super(`Slot unavailable: ${slotKey}`);
  }
}

export interface HoldRequestLine {
  slotKey: string;
  qty: number;
}

export interface HoldServiceRequest {
  serviceId: string;
  startsAt: Date;
  pax: number;
}

export interface HoldStayRequest {
  roomType: string;
  checkInDate: string;
  checkOutDate: string;
  qty?: number;
}

@Injectable()
export class InventoryService {
  private readonly log = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepo: InventoryRepo,
    @InjectConnection()
    private readonly conn: Connection,
    @InjectModel(InventorySlot.name)
    private readonly slotModel: Model<InventorySlotDocument>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Service.name)
    private readonly serviceModel: Model<ServiceDocument>,
  ) {}

  /**
   * Capacity slot a service booking consumes, mirroring the seed:
   * transfers share an hourly slot sized by the fleet, tours one slot per departure,
   * spa one slot per start time sized by treatment rooms and therapists.
   */
  async ensureServiceSlot(
    branchId: Types.ObjectId,
    serviceId: string,
    startsAt: Date,
    pax: number,
  ): Promise<HoldRequestLine> {
    const svc = await this.serviceModel.findById(serviceId).lean().exec();
    if (
      !svc ||
      svc.isActive === false ||
      String(svc.branchId) !== String(branchId)
    ) {
      throw new NotFoundException(`Service ${serviceId} not found`);
    }

    let slotStart = new Date(startsAt);
    let endsAt: Date | undefined;
    let capacity = 1;
    let qty = 1;
    let extra: Partial<InventorySlot> = {};
    if (svc.kind === ServiceKind.AIRPORT_TRANSFER) {
      slotStart = new Date(
        Math.floor(slotStart.getTime() / 3_600_000) * 3_600_000,
      );
      endsAt = new Date(slotStart.getTime() + 3_600_000);
      capacity = Math.max(
        1,
        svc.transfer?.vehicles?.filter((v) => v.isActive !== false).length ?? 1,
      );
    } else if (svc.kind === ServiceKind.SCHEDULED_TOUR && svc.tour) {
      endsAt = new Date(slotStart.getTime() + svc.tour.durationMin * 60_000);
      capacity = svc.tour.capacity;
      qty = pax;
      extra = {
        minViablePax: svc.tour.minViablePax,
        fixedCostThb: svc.tour.fixedCostThb,
      };
    } else if (svc.kind === ServiceKind.SPA_TREATMENT && svc.wellness) {
      endsAt = new Date(
        slotStart.getTime() + svc.wellness.durationMin * 60_000,
      );
      capacity = Math.min(svc.wellness.treatmentRooms, svc.wellness.therapists);
      qty = pax;
    }

    const slotKey = buildSlotKey(
      branchId,
      SlotKind.SERVICE,
      String(svc._id),
      slotStart,
    );
    await this.slotModel.updateOne(
      { slotKey },
      {
        $setOnInsert: {
          slotKey,
          branchId,
          kind: SlotKind.SERVICE,
          resourceKey: String(svc._id),
          resourceId: svc._id,
          businessDate: toBusinessDate(slotStart),
          startsAt: slotStart,
          endsAt,
          capacity,
          held: 0,
          booked: 0,
          status: SlotStatus.OPEN,
          ...extra,
        },
      },
      { upsert: true },
    );
    return { slotKey, qty };
  }

  /**
   * Room-night slots are only materialised by the seed for nights that already had bookings.
   * Upsert the missing nights for a stay so availability and holds work for any future date.
   * Capacity is the number of active rooms of that type; existing slots are never touched.
   */
  async ensureRoomNightSlots(
    branchId: Types.ObjectId,
    roomType: string,
    checkIn: string,
    checkOut: string,
  ): Promise<string[]> {
    const nights = eachNight(checkIn, checkOut);
    if (!nights.length) return [];

    const capacity = await this.roomModel.countDocuments({
      branchId,
      roomType,
      isActive: { $ne: false },
    });

    const slots = nights.map((night) => {
      const startsAt = zonedAt(night, "00:00");
      return {
        slotKey: buildSlotKey(
          branchId,
          SlotKind.ROOM_NIGHT,
          roomType,
          startsAt,
        ),
        businessDate: night,
        startsAt,
      };
    });

    await this.slotModel.bulkWrite(
      slots.map((slot) => ({
        updateOne: {
          filter: { slotKey: slot.slotKey },
          update: {
            $setOnInsert: {
              ...slot,
              branchId,
              kind: SlotKind.ROOM_NIGHT,
              resourceKey: roomType,
              capacity,
              held: 0,
              booked: 0,
              status: SlotStatus.OPEN,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return slots.map((s) => s.slotKey);
  }

  /**
   * Moves a confirmed service booking to the slot for a new start time. The new slot is booked
   * first so a full slot fails the move without ever releasing the guest's current place.
   */
  async moveServiceBooking(
    branchId: Types.ObjectId,
    serviceId: string,
    from: HoldRequestLine | undefined,
    startsAt: Date,
    pax: number,
  ): Promise<HoldRequestLine> {
    const to = await this.ensureServiceSlot(branchId, serviceId, startsAt, pax);
    if (from?.slotKey === to.slotKey) return to;
    if ((await this.inventoryRepo.incrementBooked(to.slotKey, to.qty)) !== 1) {
      throw new SlotUnavailableError(to.slotKey);
    }
    if (from) await this.inventoryRepo.returnBooked(from.slotKey, from.qty);
    return to;
  }

  /** Hold every night of each stay and the capacity of each service, so clients never build slot keys. */
  async holdItems(
    branchId: Types.ObjectId,
    cartId: string,
    stays: HoldStayRequest[],
    services: HoldServiceRequest[],
    ttlMinutes: number,
  ): Promise<InventoryHoldDocument> {
    const lines: HoldRequestLine[] = [];
    for (const s of services) {
      lines.push(
        await this.ensureServiceSlot(branchId, s.serviceId, s.startsAt, s.pax),
      );
    }
    for (const stay of stays) {
      const keys = await this.ensureRoomNightSlots(
        branchId,
        stay.roomType,
        stay.checkInDate,
        stay.checkOutDate,
      );
      for (const slotKey of keys) {
        lines.push({ slotKey, qty: stay.qty ?? 1 });
      }
    }
    return this.hold(branchId, cartId, lines, ttlMinutes);
  }

  private async runInTx<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.conn.transaction(async (session) => {
        return fn(session);
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (
        errorMsg.includes(
          "Transaction numbers are only allowed on a replica set member or mongos",
        )
      ) {
        this.log.warn(
          "MongoDB transactions require a replica set. Running in single-operation mode without session.",
        );
        return fn(undefined);
      }
      throw err;
    }
  }

  async hold(
    branchId: Types.ObjectId,
    cartId: string,
    lines: HoldRequestLine[],
    ttlMinutes: number,
  ): Promise<InventoryHoldDocument> {
    const ordered = [...lines].sort((a, b) =>
      a.slotKey.localeCompare(b.slotKey),
    );

    return this.runInTx(async (session) => {
      const heldSlots: string[] = [];
      try {
        for (const l of ordered) {
          const modified = await this.inventoryRepo.incrementHold(
            l.slotKey,
            l.qty,
            session,
          );
          if (modified !== 1) {
            throw new SlotUnavailableError(l.slotKey);
          }
          heldSlots.push(l.slotKey);
        }

        const holdToken = `ht_${crypto.randomUUID().replace(/-/g, "")}`;

        return await this.inventoryRepo.createHold(
          {
            branchId,
            cartId,
            lines: ordered,
            status: HoldStatus.ACTIVE,
            expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
            holdToken,
          },
          session,
        );
      } catch (err) {
        if (!session && heldSlots.length > 0) {
          for (const key of heldSlots) {
            const line = ordered.find((o) => o.slotKey === key);
            if (line) {
              await this.inventoryRepo.decrementHold(key, line.qty);
            }
          }
        }
        throw err;
      }
    });
  }

  async confirm(
    holdId: Types.ObjectId,
    orderId: Types.ObjectId,
  ): Promise<void> {
    await this.runInTx(async (session) => {
      const hold = await this.inventoryRepo.claimHoldForConfirmation(
        holdId,
        orderId,
        session,
      );
      if (!hold) {
        throw new Error("Hold expired, released, or already converted");
      }

      for (const l of hold.lines) {
        const modified = await this.inventoryRepo.convertHoldToBooked(
          l.slotKey,
          l.qty,
          session,
        );
        if (modified !== 1) {
          throw new Error(`Counter drift on ${l.slotKey}`);
        }
      }
    });
  }

  async release(
    holdId: Types.ObjectId,
    as: HoldStatus.RELEASED | HoldStatus.EXPIRED = HoldStatus.RELEASED,
  ): Promise<boolean> {
    return this.runInTx(async (session) => {
      const hold = await this.inventoryRepo.releaseHold(holdId, as, session);
      if (!hold) return false;

      for (const l of hold.lines) {
        await this.inventoryRepo.decrementHold(l.slotKey, l.qty, session);
      }
      return true;
    });
  }

  async releaseWithToken(
    holdId: Types.ObjectId,
    holdToken?: string,
  ): Promise<boolean> {
    const hold = await this.inventoryRepo.findHoldById(holdId);
    if (!hold) {
      throw new NotFoundException(`Hold ${holdId.toString()} not found`);
    }

    if (!holdToken || hold.holdToken !== holdToken) {
      throw new ForbiddenException("Invalid or missing hold token");
    }

    return this.release(holdId, HoldStatus.RELEASED);
  }

  async sweepExpired(batch = 200): Promise<number> {
    const stale = await this.inventoryRepo.findExpiredHolds(batch);
    let n = 0;
    for (const h of stale) {
      if (await this.release(h._id, HoldStatus.EXPIRED)) {
        n++;
      }
    }
    if (n) {
      this.log.log(`Released ${n} expired inventory holds`);
    }
    return n;
  }

  async returnBooked(
    lines: HoldRequestLine[],
    session?: ClientSession,
  ): Promise<void> {
    for (const l of lines) {
      const modified = await this.inventoryRepo.returnBooked(
        l.slotKey,
        l.qty,
        session,
      );
      if (modified !== 1) {
        throw new Error(`Counter drift on ${l.slotKey}`);
      }
    }
  }

  async roomTypeAvailability(
    branchId: Types.ObjectId,
    roomType: string,
    checkIn: string,
    checkOut: string,
  ): Promise<number> {
    await this.ensureRoomNightSlots(branchId, roomType, checkIn, checkOut);
    const rows = await this.inventoryRepo.findSlotsForAvailability(
      branchId,
      "ROOM_NIGHT",
      roomType,
      checkIn,
      checkOut,
    );
    if (!rows.length) return 0;
    return Math.min(...rows.map((r) => r.capacity - r.held - r.booked));
  }
}
