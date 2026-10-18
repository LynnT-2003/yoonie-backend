import { Injectable, Logger } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { ClientSession, Connection, Types } from "mongoose";
import { InventoryRepo } from "./inventory.repo";
import { InventoryHoldDocument } from "./entity/inventory-hold.entity";
import { HoldStatus } from "../common/enums/inventory.enum";

export class SlotUnavailableError extends Error {
  constructor(public readonly slotKey: string) {
    super(`Slot unavailable: ${slotKey}`);
  }
}

export interface HoldRequestLine {
  slotKey: string;
  qty: number;
}

@Injectable()
export class InventoryService {
  private readonly log = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepo: InventoryRepo,
    @InjectConnection()
    private readonly conn: Connection,
  ) {}

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

        return await this.inventoryRepo.createHold(
          {
            branchId,
            cartId,
            lines: ordered,
            status: HoldStatus.ACTIVE,
            expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
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
