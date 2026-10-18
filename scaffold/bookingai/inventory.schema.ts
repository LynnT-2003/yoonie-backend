import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { HoldStatus, SlotKind, SlotStatus } from '../common/enums';
import { BUSINESS_DATE, ObjectIdType } from '../common/types';

/**
 * One document = one sellable unit of capacity:
 *   ROOM_NIGHT : resourceKey = roomType code,  startsAt = night 00:00 branch tz, capacity = keys of that type
 *   DINING     : resourceKey = restaurantId,   startsAt = seating slot,           capacity = seats
 *   SERVICE    : resourceKey = serviceId,      startsAt = departure / session,    capacity = pax / vehicles / sessions
 * Every booking path does ONE conditional $inc on ONE document per unit. That is the whole concurrency story.
 */
@Schema({ timestamps: true, collection: 'inventory_slots' })
export class InventorySlot {
  @Prop({ required: true }) slotKey!: string;
  @Prop({ type: ObjectIdType, ref: 'Branch', required: true }) branchId!: Types.ObjectId;
  @Prop({ type: String, enum: Object.values(SlotKind), required: true }) kind!: SlotKind;
  @Prop({ required: true }) resourceKey!: string;
  @Prop({ type: ObjectIdType }) resourceId?: Types.ObjectId;
  @Prop({ required: true, match: BUSINESS_DATE }) businessDate!: string;
  @Prop({ type: Date, required: true }) startsAt!: Date;
  @Prop({ type: Date }) endsAt?: Date;
  @Prop({ required: true, min: 0 }) capacity!: number;
  /** soft reservations from open checkouts. released by the sweeper */
  @Prop({ default: 0, min: 0 }) held!: number;
  @Prop({ default: 0, min: 0 }) booked!: number;
  /** snapshot of tour economics so consolidation queries never join services */
  @Prop({ type: Number, min: 1 }) minViablePax?: number;
  @Prop({ type: Number, min: 0 }) fixedCostThb?: number;
  @Prop({ type: String, enum: Object.values(SlotStatus), default: SlotStatus.OPEN }) status!: SlotStatus;
}
export type InventorySlotDocument = HydratedDocument<InventorySlot>;
export const InventorySlotSchema = SchemaFactory.createForClass(InventorySlot);

export const buildSlotKey = (branchId: Types.ObjectId | string, kind: SlotKind, resourceKey: string, startsAt: Date): string =>
  `${branchId}:${kind}:${resourceKey}:${startsAt.toISOString()}`;

InventorySlotSchema.index({ slotKey: 1 }, { unique: true });
// availability search for a date range, per kind + resource (room type availability across 14 nights = 14 index hits)
InventorySlotSchema.index({ branchId: 1, kind: 1, resourceKey: 1, businessDate: 1 });
// ops views: everything departing on a day, ordered by time (tour consolidation scan)
InventorySlotSchema.index({ branchId: 1, kind: 1, businessDate: 1, startsAt: 1 });

InventorySlotSchema.virtual('available').get(function (this: InventorySlotDocument) {
  return Math.max(0, this.capacity - this.held - this.booked);
});
InventorySlotSchema.virtual('fillRate').get(function (this: InventorySlotDocument) {
  return this.capacity ? this.booked / this.capacity : 0;
});
InventorySlotSchema.pre('validate', async function (this: InventorySlotDocument) {
  if (this.held + this.booked > this.capacity) throw new Error(`slot ${this.slotKey} overbooked`);
});

@Schema({ _id: false })
export class HoldLine {
  @Prop({ required: true }) slotKey!: string;
  @Prop({ required: true, min: 1 }) qty!: number;
}
export const HoldLineSchema = SchemaFactory.createForClass(HoldLine);

/** a checkout's claim on N slots. counters live on slots, this doc only remembers what to give back */
@Schema({ timestamps: true, collection: 'inventory_holds' })
export class InventoryHold {
  @Prop({ type: ObjectIdType, ref: 'Branch', required: true }) branchId!: Types.ObjectId;
  @Prop({ required: true }) cartId!: string;
  @Prop({ type: ObjectIdType, ref: 'Order' }) orderId?: Types.ObjectId;
  @Prop({ type: [HoldLineSchema], default: [] }) lines!: HoldLine[];
  @Prop({ type: String, enum: Object.values(HoldStatus), default: HoldStatus.ACTIVE }) status!: HoldStatus;
  @Prop({ type: Date, required: true }) expiresAt!: Date;
  /** set when the hold reaches a terminal state, TTL index garbage collects it later */
  @Prop({ type: Date }) purgeAt?: Date;
}
export type InventoryHoldDocument = HydratedDocument<InventoryHold>;
export const InventoryHoldSchema = SchemaFactory.createForClass(InventoryHold);
InventoryHoldSchema.index({ status: 1, expiresAt: 1 });                       // sweeper
InventoryHoldSchema.index({ cartId: 1 });
InventoryHoldSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });          // TTL only on terminal holds
