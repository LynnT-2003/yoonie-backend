import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { CleaningStatus, RoomTypeCode } from "../common/hospitality.enums";
import { BUSINESS_DATE, ObjectIdType } from "../common/hospitality.types";

@Schema({ _id: false })
export class BlockedRange {
  @Prop({ required: true, match: BUSINESS_DATE })
  from!: string; // inclusive

  @Prop({ required: true, match: BUSINESS_DATE })
  to!: string; // exclusive

  @Prop({ required: true })
  reason!: string; // MAINTENANCE, OWNER_HOLD, RENOVATION

  @Prop({ type: ObjectIdType, ref: "HospitalityUser" })
  createdBy?: Types.ObjectId;
}
export const BlockedRangeSchema = SchemaFactory.createForClass(BlockedRange);

/**
 * Physical unit. Availability is NOT computed from this collection.
 * Selling happens against inventory_slots (ROOM_NIGHT per roomType per night).
 * Rooms hold state that changes by the minute (housekeeping) and static config.
 */
@Schema({ timestamps: true, collection: "rooms" })
export class Room {
  @Prop({ type: ObjectIdType, ref: "Branch", required: true })
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

  @Prop({
    type: String,
    enum: Object.values(CleaningStatus),
    default: CleaningStatus.INSPECTED,
    required: true,
  })
  cleaningStatus!: CleaningStatus;

  @Prop({ type: Date })
  cleaningUpdatedAt?: Date;

  @Prop({ type: ObjectIdType, ref: "HospitalityUser" })
  cleaningUpdatedBy?: Types.ObjectId;

  /** small, rare, always read with the room, so embedded. sell-side effect: close/reduce the matching ROOM_NIGHT slots */
  @Prop({ type: [BlockedRangeSchema], default: [] })
  blockedRanges!: BlockedRange[];

  @Prop({ default: true })
  isActive!: boolean;

  isBlockedOn!: (businessDate: string) => boolean;
}

export type RoomDocument = HydratedDocument<Room>;
export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ branchId: 1, roomNumber: 1 }, { unique: true });
// housekeeping board: "all DIRTY rooms in this branch by type"
RoomSchema.index({ branchId: 1, cleaningStatus: 1, roomType: 1 });
// assignment: "active rooms of type X"
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
