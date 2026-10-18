import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { HoldStatus, SlotStatus } from '../common/enums';
import {
  InventoryHold, InventoryHoldDocument, InventorySlot, InventorySlotDocument,
} from '../schemas';

export class SlotUnavailableError extends Error {
  constructor(public readonly slotKey: string) { super(`slot unavailable: ${slotKey}`); }
}
export interface HoldRequestLine { slotKey: string; qty: number }

/**
 * Requires a replica set (transactions). Every capacity mutation is a single-document conditional $inc,
 * so contention is per slot (per room type per night), never per collection.
 */
@Injectable()
export class InventoryService {
  private readonly log = new Logger(InventoryService.name);

  constructor(
    @InjectModel(InventorySlot.name) private readonly slots: Model<InventorySlotDocument>,
    @InjectModel(InventoryHold.name) private readonly holds: Model<InventoryHoldDocument>,
    @InjectConnection() private readonly conn: Connection,
  ) {}

  /** all-or-nothing hold across N slots (a 3 night stay + a cruise + a transfer = 5 slots, one transaction) */
  async hold(branchId: Types.ObjectId, cartId: string, lines: HoldRequestLine[], ttlMinutes: number): Promise<InventoryHoldDocument> {
    // deterministic lock order: two carts touching overlapping slots can't deadlock each other
    const ordered = [...lines].sort((a, b) => a.slotKey.localeCompare(b.slotKey));
    return this.conn.transaction(async (session: ClientSession) => {
      for (const l of ordered) {
        const res = await this.slots.updateOne(
          {
            slotKey: l.slotKey,
            status: SlotStatus.OPEN,
            // the guard IS the double booking prevention. evaluated atomically with the $inc
            $expr: { $lte: [{ $add: ['$held', '$booked', l.qty] }, '$capacity'] },
          },
          { $inc: { held: l.qty } },
          { session },
        );
        if (res.modifiedCount !== 1) throw new SlotUnavailableError(l.slotKey);
      }
      const [doc] = await this.holds.create(
        [{ branchId, cartId, lines: ordered, status: HoldStatus.ACTIVE, expiresAt: new Date(Date.now() + ttlMinutes * 60_000) }],
        { session },
      );
      return doc;
    });
  }

  /** payment succeeded: held -> booked. claim the hold first so a double webhook can't convert twice */
  async confirm(holdId: Types.ObjectId, orderId: Types.ObjectId): Promise<void> {
    await this.conn.transaction(async (session) => {
      const hold = await this.holds.findOneAndUpdate(
        { _id: holdId, status: HoldStatus.ACTIVE, expiresAt: { $gt: new Date() } },
        { $set: { status: HoldStatus.CONVERTED, orderId, purgeAt: new Date(Date.now() + 7 * 864e5) } },
        { session, new: false },
      );
      if (!hold) throw new Error('hold expired, released or already converted');
      for (const l of hold.lines) {
        const res = await this.slots.updateOne(
          { slotKey: l.slotKey, held: { $gte: l.qty } },
          { $inc: { held: -l.qty, booked: l.qty } },
          { session },
        );
        if (res.modifiedCount !== 1) throw new Error(`counter drift on ${l.slotKey}`);
      }
    });
  }

  /** abandoned checkout */
  async release(holdId: Types.ObjectId, as: HoldStatus.RELEASED | HoldStatus.EXPIRED = HoldStatus.RELEASED): Promise<boolean> {
    return this.conn.transaction(async (session) => {
      const hold = await this.holds.findOneAndUpdate(
        { _id: holdId, status: HoldStatus.ACTIVE },
        { $set: { status: as, purgeAt: new Date(Date.now() + 864e5) } },
        { session, new: false },
      );
      if (!hold) return false;
      for (const l of hold.lines) {
        await this.slots.updateOne({ slotKey: l.slotKey, held: { $gte: l.qty } }, { $inc: { held: -l.qty } }, { session });
      }
      return true;
    });
  }

  /**
   * cron every minute. NOTE: a TTL index alone is not enough. deleting an expired hold does not give
   * the seats back, because the counters live on the slots. the sweeper gives them back, TTL only cleans up afterwards.
   */
  async sweepExpired(batch = 200): Promise<number> {
    const stale = await this.holds
      .find({ status: HoldStatus.ACTIVE, expiresAt: { $lte: new Date() } }, { _id: 1 })
      .limit(batch)
      .lean();
    let n = 0;
    for (const h of stale) if (await this.release(h._id, HoldStatus.EXPIRED)) n++;
    if (n) this.log.log(`released ${n} expired holds`);
    return n;
  }

  /** partial cancellation of one line: give back exactly what that line consumed */
  async returnBooked(lines: HoldRequestLine[], session?: ClientSession): Promise<void> {
    for (const l of lines) {
      const res = await this.slots.updateOne({ slotKey: l.slotKey, booked: { $gte: l.qty } }, { $inc: { booked: -l.qty } }, { session });
      if (res.modifiedCount !== 1) throw new Error(`counter drift on ${l.slotKey}`);
    }
  }

  /** availability for a stay = min over nights of (capacity - held - booked). 1 indexed query, N docs */
  async roomTypeAvailability(branchId: Types.ObjectId, roomType: string, checkIn: string, checkOut: string): Promise<number> {
    const rows = await this.slots
      .find({ branchId, kind: 'ROOM_NIGHT', resourceKey: roomType, businessDate: { $gte: checkIn, $lt: checkOut }, status: SlotStatus.OPEN })
      .select('capacity held booked')
      .lean();
    if (!rows.length) return 0;
    return Math.min(...rows.map((r) => r.capacity - r.held - r.booked));
  }
}
