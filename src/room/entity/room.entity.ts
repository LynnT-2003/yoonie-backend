import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { CleaningStatus } from "../../common/enums/cleaning-status.enum";
import { RoomTypeCode } from "../../common/enums/room-type.enum";
import { BUSINESS_DATE } from "../../common/helpers/regex.helper";

@Schema({ _id: false })
export class BlockedRange {
  @Prop({ required: true, match: BUSINESS_DATE })
  from!: string; // inclusive

  @Prop({ required: true, match: BUSINESS_DATE })
  to!: string; // exclusive

  @Prop({ required: true })
  reason!: string; // MAINTENANCE, OWNER_HOLD, RENOVATION

  @Prop({ type: Types.ObjectId, ref: "User" })
  createdBy?: Types.ObjectId;
}
export const BlockedRangeSchema = SchemaFactory.createForClass(BlockedRange);

/**
 * Room Document Schema Example:
 * -------------------------------------------------------------
 * {
 *   "_id": ObjectId("665a1b2c3d4e5f6a7b8c9d1a"),
 *   "branchId": ObjectId("665a1b2c3d4e5f6a7b8c9d0e"),
 *   "roomNumber": "101",
 *   "floor": 1,
 *   "roomType": "STANDARD_KING",
 *   "maxOccupancy": 2,
 *   "baseRateThb": 2200,
 *   "amenities": [
 *     "King Bed",
 *     "En-suite Bath",
 *     "Smart TV",
 *     "River View",
 *     "High-speed Wi-Fi"
 *   ],
 *   "cleaningStatus": "INSPECTED",
 *   "cleaningUpdatedAt": ISODate("2026-10-18T08:30:00.000Z"),
 *   "cleaningUpdatedBy": ObjectId("665a1b2c3d4e5f6a7b8c9d0a"),
 *   "blockedRanges": [
 *     {
 *       "from": "2026-10-25",
 *       "to": "2026-10-28",
 *       "reason": "MAINTENANCE",
 *       "createdBy": ObjectId("665a1b2c3d4e5f6a7b8c9d0a")
 *     }
 *   ],
 *   "isActive": true,
 *   "createdAt": ISODate("2026-10-18T00:00:00.000Z"),
 *   "updatedAt": ISODate("2026-10-18T08:30:00.000Z")
 * }
 * -------------------------------------------------------------
 * Physical unit. Availability is NOT computed from this collection.
 * Selling happens against inventory_slots (ROOM_NIGHT per roomType per night).
 * Rooms hold state that changes by the minute (housekeeping) and static config.
 */
@Schema({ timestamps: true, collection: "rooms" })
export class Room {
  @Prop({ type: Types.ObjectId, ref: "Branch", required: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  roomNumber!: string;

  @Prop({ required: true, min: 0 })
  floor!: number;

  @Prop({ type: String, enum: Object.values(RoomTypeCode), required: true })
  roomType!: RoomTypeCode;

  @Prop({ required: true, min: 1 })
  maxOccupancy!: number;

  @Prop({ required: true, min: 0 })
  baseRateThb!: number;

  @Prop({ type: [String], default: [] })
  amenities!: string[];

  @Prop({ type: String })
  coverImage?: string;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({
    type: String,
    enum: Object.values(CleaningStatus),
    default: CleaningStatus.INSPECTED,
    required: true,
  })
  cleaningStatus!: CleaningStatus;

  @Prop({ type: Date })
  cleaningUpdatedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: "User" })
  cleaningUpdatedBy?: Types.ObjectId;

  /** small, rare, always read with the room, so embedded */
  @Prop({ type: [BlockedRangeSchema], default: [] })
  blockedRanges!: BlockedRange[];

  @Prop({ default: true })
  isActive!: boolean;

  isBlockedOn!: (businessDate: string) => boolean;
}

export type RoomDocument = HydratedDocument<Room>;
export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ branchId: 1, roomNumber: 1 }, { unique: true });
RoomSchema.index({ branchId: 1, cleaningStatus: 1, roomType: 1 });
RoomSchema.index({ branchId: 1, roomType: 1, isActive: 1 });

RoomSchema.methods.isBlockedOn = function (
  this: RoomDocument,
  d: string,
): boolean {
  return this.blockedRanges.some((b) => d >= b.from && d < b.to);
};

RoomSchema.pre("validate", function (this: RoomDocument) {
  for (const b of this.blockedRanges) {
    if (b.to <= b.from) {
      throw new Error(
        `blockedRange to must be after from (${b.from}..${b.to})`,
      );
    }
  }
});

RoomSchema.pre("save", function (this: RoomDocument) {
  if (this.isModified("cleaningStatus")) {
    this.cleaningUpdatedAt = new Date();
  }
});
