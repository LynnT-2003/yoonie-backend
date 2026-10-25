import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Order, OrderDocument, OrderLine } from "../order/entity/order.entity";
import { Service, ServiceDocument } from "../service/entity/service.entity";
import {
  InventorySlot,
  InventorySlotDocument,
} from "../inventory/entity/inventory-slot.entity";
import { User, UserDocument, vipTierFor } from "../user/entity/user.entity";
import { Branch, BranchDocument } from "../branch/entity/branch.entity";
import { LineKind, LineStatus, OrderStatus } from "../common/enums/order.enum";
import { ServiceKind } from "../common/enums/service.enum";
import { SlotKind } from "../common/enums/inventory.enum";
import {
  addDays,
  toBranchBusinessDate,
  zonedAt,
} from "../common/helpers/time.helper";
import { buildOrderCharges } from "../order/helpers/order-charges.helper";
import type {
  GuestStatus,
  GuestView,
  GuestsBoard,
  ServiceBoardItem,
  ServiceDayView,
  ServiceSlotView,
  ServicesBoard,
  SlotBooking,
} from "./ops-board.types";

const LIVE = [OrderStatus.CONFIRMED, OrderStatus.COMPLETED];
const DEAD = [LineStatus.CANCELLED, LineStatus.NO_SHOW];
const WEEK = 7;

type LeanOrder = Order & { _id: Types.ObjectId };
type LeanSlot = InventorySlot & { _id: Types.ObjectId };
type LeanService = Service & { _id: Types.ObjectId };

const isLive = (l: OrderLine) => !DEAD.includes(l.status);

const hhmmIn = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(d));

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

@Injectable()
export class OpsBoardService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Service.name)
    private readonly serviceModel: Model<ServiceDocument>,
    @InjectModel(InventorySlot.name)
    private readonly slotModel: Model<InventorySlotDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
  ) {}

  private async branchContext(branchId: string, date?: string) {
    const branchOid = new Types.ObjectId(branchId);
    const branch = await this.branchModel.findById(branchOid).lean().exec();
    const timezone = branch?.timezone || "Asia/Bangkok";
    return {
      branchOid,
      timezone,
      date: date || toBranchBusinessDate(new Date(), timezone),
    };
  }

  /**
   * Every service's capacity against demand: today's departures/treatments/pickups slot by slot,
   * plus a week of availability. A departure that's configured but unbooked still shows, so empty
   * capacity is visible instead of silently missing.
   */
  async servicesBoard(branchId: string, date?: string): Promise<ServicesBoard> {
    const ctx = await this.branchContext(branchId, date);
    const days = Array.from({ length: WEEK }, (_, i) => addDays(ctx.date, i));

    const [services, slots] = await Promise.all([
      this.serviceModel
        .find({ branchId: ctx.branchOid, isActive: { $ne: false } })
        .sort({ kind: 1, name: 1 })
        .lean()
        .exec() as Promise<LeanService[]>,
      this.slotModel
        .find({
          branchId: ctx.branchOid,
          kind: SlotKind.SERVICE,
          businessDate: { $gte: days[0], $lte: days[days.length - 1] },
        })
        .lean()
        .exec() as Promise<LeanSlot[]>,
    ]);

    const todaysKeys = slots
      .filter((s) => s.businessDate === ctx.date)
      .map((s) => s.slotKey);
    const orders = todaysKeys.length
      ? ((await this.orderModel
          .find({
            branchId: ctx.branchOid,
            status: { $in: LIVE },
            "items.slotRefs.slotKey": { $in: todaysKeys },
          })
          .lean()
          .exec()) as LeanOrder[])
      : [];

    const bookingsBySlot = new Map<string, SlotBooking[]>();
    for (const o of orders) {
      const room = o.items.find((it) => it.stay?.assignedRoomNumber)?.stay
        ?.assignedRoomNumber;
      for (const line of o.items) {
        if (line.kind !== LineKind.SERVICE || !isLive(line)) continue;
        for (const ref of line.slotRefs ?? []) {
          const list = bookingsBySlot.get(ref.slotKey) ?? [];
          list.push({
            orderId: String(o._id),
            orderNumber: o.orderNumber,
            lineId: line.lineId,
            guestName: o.guestSnapshot?.fullName || "Guest",
            roomNumber: room,
            pax: line.service?.pax ?? ref.qty,
            amountThb: line.totalThb,
            paymentStatus: o.payment?.status || "UNPAID",
            flightNumber: line.service?.flight?.number,
            flightTime: line.service?.flight
              ? hhmmIn(
                  line.service.flight.estimatedAt ??
                    line.service.flight.scheduledAt,
                  ctx.timezone,
                )
              : undefined,
          });
          bookingsBySlot.set(ref.slotKey, list);
        }
      }
    }

    const items = services.map((svc) =>
      this.serviceItem(svc, slots, bookingsBySlot, days, ctx),
    );

    const scheduled = items.filter((i) => i.unit !== "pickup");
    const offered = scheduled.reduce((n, i) => n + (i.today.offered ?? 0), 0);
    const sold = scheduled.reduce((n, i) => n + i.today.sold, 0);
    const revenue = items.reduce((n, i) => n + i.today.revenueThb, 0);
    const fixed = items.reduce((n, i) => n + i.today.fixedCostThb, 0);
    const losing = items.flatMap((i) => i.slots).filter((s) => s.belowMinimum);
    const transfers = items.filter((i) => i.unit === "pickup");

    return {
      date: ctx.date,
      timezone: ctx.timezone,
      days,
      summary: {
        revenueThb: revenue,
        fixedCostThb: fixed,
        marginThb: revenue - fixed,
        seatsOffered: offered,
        seatsSold: sold,
        utilization: ratio(sold, offered),
        unsoldSeats: Math.max(0, offered - sold),
        belowMinimum: losing.length,
        projectedLossThb: losing.reduce(
          (n, s) => n + Math.max(0, -s.marginThb),
          0,
        ),
        pickups: transfers.reduce((n, i) => n + i.today.sold, 0),
        fleetSize: transfers.reduce((n, i) => n + i.capacityPerSlot, 0),
      },
      services: items,
    };
  }

  private serviceItem(
    svc: LeanService,
    allSlots: LeanSlot[],
    bookingsBySlot: Map<string, SlotBooking[]>,
    days: string[],
    ctx: { date: string; timezone: string },
  ): ServiceBoardItem {
    const isTransfer = svc.kind === ServiceKind.AIRPORT_TRANSFER;
    const isTour = svc.kind === ServiceKind.SCHEDULED_TOUR;
    const unit: ServiceBoardItem["unit"] = isTransfer
      ? "pickup"
      : isTour
        ? "seat"
        : "treatment";
    const capacityPerSlot = isTransfer
      ? (svc.transfer?.vehicles?.filter((v) => v.isActive !== false).length ??
        0)
      : isTour
        ? (svc.tour?.capacity ?? 0)
        : Math.min(
            svc.wellness?.treatmentRooms ?? 0,
            svc.wellness?.therapists ?? 0,
          );
    const times = svc.tour?.departureTimes ?? svc.wellness?.startTimes ?? [];
    const mine = allSlots.filter((s) => s.resourceKey === String(svc._id));

    /** configured departures merged with any slot that actually exists, so ad-hoc slots show too */
    const slotsFor = (day: string) => {
      const existing = mine.filter((s) => s.businessDate === day);
      const byStart = new Map(existing.map((s) => [+new Date(s.startsAt), s]));
      if (!isTransfer) {
        for (const t of times) {
          const at = zonedAt(day, t);
          if (!byStart.has(+at)) {
            byStart.set(+at, {
              startsAt: at,
              capacity: capacityPerSlot,
              booked: 0,
              held: 0,
              minViablePax: svc.tour?.minViablePax,
              fixedCostThb: svc.tour?.fixedCostThb,
            } as LeanSlot);
          }
        }
      }
      return [...byStart.values()].sort(
        (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
      );
    };

    const dayView = (day: string): ServiceDayView => {
      const ds = slotsFor(day);
      const sold = ds.reduce((n, s) => n + s.booked, 0);
      if (isTransfer)
        return { date: day, offered: null, sold, utilization: null };
      const offered = ds.reduce((n, s) => n + s.capacity, 0);
      return { date: day, offered, sold, utilization: ratio(sold, offered) };
    };

    const slots: ServiceSlotView[] = slotsFor(ctx.date).map((s) => {
      const bookings = s.slotKey ? (bookingsBySlot.get(s.slotKey) ?? []) : [];
      const revenue = bookings.reduce((n, b) => n + b.amountThb, 0);
      // a departure nobody booked doesn't run, so it costs nothing
      const fixed = s.booked > 0 ? (s.fixedCostThb ?? 0) : 0;
      return {
        startsAt: s.startsAt,
        time: hhmmIn(s.startsAt, ctx.timezone),
        capacity: s.capacity,
        booked: s.booked,
        held: s.held,
        available: Math.max(0, s.capacity - s.booked - s.held),
        fillRate: ratio(s.booked, s.capacity),
        minViablePax: s.minViablePax,
        belowMinimum: Boolean(
          s.minViablePax && s.booked > 0 && s.booked < s.minViablePax,
        ),
        fixedCostThb: fixed,
        revenueThb: revenue,
        marginThb: revenue - fixed,
        bookings,
      };
    });

    const today = dayView(ctx.date);
    const revenueThb = slots.reduce((n, s) => n + s.revenueThb, 0);
    const fixedCostThb = slots.reduce((n, s) => n + s.fixedCostThb, 0);

    return {
      serviceId: String(svc._id),
      kind: svc.kind,
      name: svc.name,
      priceThb: svc.basePriceThb,
      pricingModel: svc.pricingModel,
      unit,
      capacityPerSlot,
      slots,
      today: {
        ...today,
        revenueThb,
        fixedCostThb,
        marginThb: revenueThb - fixedCostThb,
      },
      week: days.map(dayView),
    };
  }

  /** Who is here, who is coming in the next week, what they booked and what they owe. */
  async guestsBoard(branchId: string, date?: string): Promise<GuestsBoard> {
    const ctx = await this.branchContext(branchId, date);
    const horizon = addDays(ctx.date, WEEK);

    const orders = (await this.orderModel
      .find({
        branchId: ctx.branchOid,
        status: { $in: LIVE },
        items: {
          $elemMatch: {
            kind: LineKind.STAY,
            status: { $nin: DEAD },
            "stay.checkInDate": { $lte: horizon },
            "stay.checkOutDate": { $gte: ctx.date },
          },
        },
      })
      .lean()
      .exec()) as LeanOrder[];

    const users = await this.userModel
      .find({
        _id: {
          $in: [...new Set(orders.map((o) => String(o.guestId)))].map(
            (id) => new Types.ObjectId(id),
          ),
        },
      })
      .lean()
      .exec();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const rank: Record<GuestStatus, number> = {
      ARRIVING: 0,
      IN_HOUSE: 1,
      DEPARTING: 2,
      UPCOMING: 3,
    };
    const statusOf = (cin: string, cout: string): GuestStatus =>
      cin === ctx.date
        ? "ARRIVING"
        : cout === ctx.date
          ? "DEPARTING"
          : cin < ctx.date
            ? "IN_HOUSE"
            : "UPCOMING";

    const byGuest = new Map<string, GuestView>();
    for (const o of orders) {
      const gid = String(o.guestId);
      const u = userById.get(gid);
      let g = byGuest.get(gid);
      if (!g) {
        g = {
          guestId: gid,
          name: u?.displayName || o.guestSnapshot.fullName,
          email: o.guestSnapshot.email ?? u?.email ?? undefined,
          phone: o.guestSnapshot.phoneE164 ?? u?.phoneE164 ?? undefined,
          lineUserId: o.guestSnapshot.lineUserId ?? u?.lineUserId ?? undefined,
          language: o.guestSnapshot.preferredLanguage || "en",
          nationality: u?.nationalityCode ?? undefined,
          vipScore: u?.vipScore ?? 0,
          vipTier: vipTierFor(u?.vipScore ?? 0),
          stayCount: u?.stats?.stayCount ?? 0,
          lifetimeSpendThb: u?.stats?.lifetimeSpendThb ?? 0,
          isReturning: (u?.stats?.stayCount ?? 0) > 0,
          status: "UPCOMING",
          nextDate: horizon,
          stays: [],
          services: [],
          folios: [],
          dueThb: 0,
        };
        byGuest.set(gid, g);
      }

      for (const line of o.items) {
        if (!isLive(line)) continue;
        if (line.kind === LineKind.STAY && line.stay) {
          const s = line.stay;
          if (s.checkOutDate < ctx.date || s.checkInDate > horizon) continue;
          g.stays.push({
            orderId: String(o._id),
            orderNumber: o.orderNumber,
            roomNumber: s.assignedRoomNumber,
            roomType: s.roomType,
            checkInDate: s.checkInDate,
            checkOutDate: s.checkOutDate,
            nights: s.nights,
            pax: s.adults + (s.children || 0),
          });
          const st = statusOf(s.checkInDate, s.checkOutDate);
          if (rank[st] < rank[g.status]) g.status = st;
          const relevant = s.checkInDate > ctx.date ? s.checkInDate : ctx.date;
          if (relevant < g.nextDate) g.nextDate = relevant;
        } else if (line.kind === LineKind.SERVICE && line.service) {
          g.services.push({
            orderId: String(o._id),
            lineId: line.lineId,
            name: line.service.serviceName,
            kind: line.service.serviceKind,
            date: line.businessDate,
            time: hhmmIn(line.startsAt, ctx.timezone),
            pax: line.service.pax,
            amountThb: line.totalThb,
            flightNumber: line.service.flight?.number,
          });
        }
      }
      const charges = buildOrderCharges(o, ctx.timezone);
      g.folios.push({
        orderId: String(o._id),
        orderNumber: o.orderNumber,
        charges,
      });
      g.dueThb += charges.dueThb;
    }

    const guests = [...byGuest.values()]
      .filter((g) => g.stays.length)
      .map((g) => ({
        ...g,
        services: g.services.sort((a, b) =>
          `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
        ),
      }))
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          a.nextDate.localeCompare(b.nextDate) ||
          a.name.localeCompare(b.name),
      );

    const here = guests.filter(
      (g) => g.status === "IN_HOUSE" || g.status === "ARRIVING",
    );
    return {
      date: ctx.date,
      timezone: ctx.timezone,
      summary: {
        inHouse: here.length,
        arriving: guests.filter((g) => g.status === "ARRIVING").length,
        departing: guests.filter((g) => g.status === "DEPARTING").length,
        upcoming: guests.filter((g) => g.status === "UPCOMING").length,
        vipInHouse: here.filter((g) => g.vipTier !== "NONE").length,
        returning: guests.filter((g) => g.isReturning).length,
        outstandingThb: guests.reduce((n, g) => n + g.dueThb, 0),
      },
      guests,
    };
  }
}
