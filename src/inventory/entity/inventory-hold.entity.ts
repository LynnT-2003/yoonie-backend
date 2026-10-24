import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { HoldStatus } from "../../common/enums/inventory.enum";

@Schema({ _id: false })
export class HoldLine {
  @Prop({ required: true })
  slotKey!: string;

  @Prop({ required: true, min: 1 })
  qty!: number;
}
export const HoldLineSchema = SchemaFactory.createForClass(HoldLine);

/**
 * InventoryHold Document Schema Example:
 * -------------------------------------------------------------
 * {
 *   "_id": ObjectId("665a1b2c3d4e5f6a7b8c9d5e"),
 *   "branchId": ObjectId("665a1b2c3d4e5f6a7b8c9d0e"),
 *   "cartId": "cart_abc123",
 *   "orderId": ObjectId("665a1b2c3d4e5f6a7b8c9d6f"),
 *   "lines": [
 *     {
 *       "slotKey": "665a1b2c3d4e5f6a7b8c9d0e:ROOM_NIGHT:STANDARD_KING:2026-10-20T00:00:00.000Z",
 *       "qty": 1
 *     },
 *     {
 *       "slotKey": "665a1b2c3d4e5f6a7b8c9d0e:ROOM_NIGHT:STANDARD_KING:2026-10-21T00:00:00.000Z",
 *       "qty": 1
 *     }
 *   ],
 *   "status": "ACTIVE",
 *   "expiresAt": ISODate("2026-10-18T14:45:00.000Z"),
 *   "purgeAt": ISODate("2026-10-18T15:00:00.000Z"),
 *   "createdAt": ISODate("2026-10-18T14:30:00.000Z"),
 *   "updatedAt": ISODate("2026-10-18T14:30:00.000Z")
 * }
 * -------------------------------------------------------------
 * A checkout's claim on N slots. Counters live on slots, this doc only remembers what to give back.
 */
@Schema({ timestamps: true, collection: "inventory_holds" })
export class InventoryHold {
  @Prop({ type: Types.ObjectId, ref: "Branch", required: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true })
  cartId!: string;

  @Prop({ type: Types.ObjectId, ref: "Order" })
  orderId?: Types.ObjectId;

  @Prop({ type: [HoldLineSchema], default: [] })
  lines!: HoldLine[];

  @Prop({
    type: String,
    enum: Object.values(HoldStatus),
    default: HoldStatus.ACTIVE,
  })
  status!: HoldStatus;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: String })
  holdToken?: string;

  /** set when the hold reaches a terminal state, TTL index garbage collects it later */
  @Prop({ type: Date })
  purgeAt?: Date;
}

export type InventoryHoldDocument = HydratedDocument<InventoryHold>;
export const InventoryHoldSchema = SchemaFactory.createForClass(InventoryHold);
InventoryHoldSchema.index({ status: 1, expiresAt: 1 }); // sweeper
InventoryHoldSchema.index({ cartId: 1 });
InventoryHoldSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 }); // TTL only on terminal holds
