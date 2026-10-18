import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { SlotKind, SlotStatus } from "../../common/enums/inventory.enum";
import { BUSINESS_DATE } from "../../common/helpers/regex.helper";

/**
 * InventorySlot Document Schema Example:
 * -------------------------------------------------------------
 * {
 *   "_id": ObjectId("665a1b2c3d4e5f6a7b8c9d4d"),
 *   "slotKey": "665a1b2c3d4e5f6a7b8c9d0e:ROOM_NIGHT:STANDARD_KING:2026-10-20T00:00:00.000Z",
 *   "branchId": ObjectId("665a1b2c3d4e5f6a7b8c9d0e"),
 *   "kind": "ROOM_NIGHT",
 *   "resourceKey": "STANDARD_KING",
 *   "businessDate": "2026-10-20",
 *   "startsAt": ISODate("2026-10-20T00:00:00.000Z"),
 *   "endsAt": ISODate("2026-10-21T00:00:00.000Z"),
 *   "capacity": 24,
 *   "held": 2,
 *   "booked": 14,
 *   "status": "OPEN",
 *   "createdAt": ISODate("2026-10-18T00:00:00.000Z"),
 *   "updatedAt": ISODate("2026-10-18T14:30:00.000Z")
 * }
 * -------------------------------------------------------------
 * One document = one sellable unit of capacity:
 *   ROOM_NIGHT : resourceKey = roomType code,  startsAt = night 00:00 branch tz, capacity = keys of that type
 *   DINING     : resourceKey = restaurantId,   startsAt = seating slot,           capacity = seats
 *   SERVICE    : resourceKey = serviceId,      startsAt = departure / session,    capacity = pax / vehicles / sessions
 * Every booking path does ONE conditional $inc on ONE document per unit. That is the whole concurrency story.
 */
@Schema({ timestamps: true, collection: "inventory_slots" })
export class InventorySlot {
  @Prop({ required: true })
  slotKey!: string;

  @Prop({ type: Types.ObjectId, ref: "Branch", required: true })
  branchId!: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(SlotKind), required: true })
  kind!: SlotKind;

  @Prop({ required: true })
  resourceKey!: string;

  @Prop({ type: Types.ObjectId })
  resourceId?: Types.ObjectId;

  @Prop({ required: true, match: BUSINESS_DATE })
  businessDate!: string;

  @Prop({ type: Date, required: true })
  startsAt!: Date;

  @Prop({ type: Date })
  endsAt?: Date;

  @Prop({ required: true, min: 0 })
  capacity!: number;

  /** soft reservations from open checkouts. released by the sweeper */
  @Prop({ default: 0, min: 0 })
  held!: number;

  @Prop({ default: 0, min: 0 })
  booked!: number;

  /** snapshot of tour economics so consolidation queries never join services */
  @Prop({ type: Number, min: 1 })
  minViablePax?: number;

  @Prop({ type: Number, min: 0 })
  fixedCostThb?: number;

  @Prop({
    type: String,
    enum: Object.values(SlotStatus),
    default: SlotStatus.OPEN,
  })
  status!: SlotStatus;
}

export type InventorySlotDocument = HydratedDocument<InventorySlot>;
export const InventorySlotSchema = SchemaFactory.createForClass(InventorySlot);

export const buildSlotKey = (
  branchId: Types.ObjectId | string,
  kind: SlotKind,
  resourceKey: string,
  startsAt: Date,
): string =>
  `${String(branchId)}:${kind}:${resourceKey}:${startsAt.toISOString()}`;

InventorySlotSchema.index({ slotKey: 1 }, { unique: true });
InventorySlotSchema.index({
  branchId: 1,
  kind: 1,
  resourceKey: 1,
  businessDate: 1,
});
InventorySlotSchema.index({
  branchId: 1,
  kind: 1,
  businessDate: 1,
  startsAt: 1,
});

InventorySlotSchema.virtual("available").get(function (
  this: InventorySlotDocument,
) {
  return Math.max(0, this.capacity - this.held - this.booked);
});

InventorySlotSchema.virtual("fillRate").get(function (
  this: InventorySlotDocument,
) {
  return this.capacity ? this.booked / this.capacity : 0;
});

InventorySlotSchema.pre("validate", function (this: InventorySlotDocument) {
  if (this.held + this.booked > this.capacity) {
    throw new Error(`slot ${this.slotKey} overbooked`);
  }
});
