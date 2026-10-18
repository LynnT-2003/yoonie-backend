import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import {
  DispatchStatus,
  DispatchType,
  MessageChannel,
  Severity,
} from "../common/hospitality.enums";
import { BUSINESS_DATE, ObjectIdType } from "../common/hospitality.types";

@Schema({ _id: false })
export class HousekeepingPayload {
  @Prop({ type: ObjectIdType, ref: "Room", required: true })
  roomId!: Types.ObjectId;

  @Prop({ required: true })
  roomNumber!: string;

  @Prop({ type: ObjectIdType, ref: "Order" })
  orderId?: Types.ObjectId;

  @Prop()
  guestName?: string;

  @Prop({ type: Date, required: true })
  etaAt!: Date;

  @Prop({
    type: String,
    enum: ["TRANSFER_FLIGHT", "CHECKIN_TIME"],
    required: true,
  })
  etaSource!: string;

  @Prop()
  flightNumber?: string;

  @Prop({ default: false })
  isVip!: boolean;

  @Prop({ type: Date, required: true })
  targetReadyBy!: Date;
}
export const HousekeepingPayloadSchema =
  SchemaFactory.createForClass(HousekeepingPayload);

@Schema({ _id: false })
export class ConsolidationPayload {
  @Prop({ required: true })
  slotKey!: string;

  @Prop({ type: ObjectIdType, ref: "Service", required: true })
  serviceId!: Types.ObjectId;

  @Prop({ required: true })
  serviceName!: string;

  @Prop({ type: Date, required: true })
  departsAt!: Date;

  @Prop({ required: true })
  booked!: number;

  @Prop({ required: true })
  capacity!: number;

  @Prop({ required: true })
  fillRate!: number;

  @Prop({ required: true })
  minViablePax!: number;

  @Prop({ required: true })
  fixedCostThb!: number;

  @Prop({ required: true })
  revenueThb!: number;

  @Prop({ required: true })
  projectedLossThb!: number;

  @Prop({ type: String, enum: ["MERGE_OR_CANCEL", "WATCH"], required: true })
  recommendation!: string;
}
export const ConsolidationPayloadSchema =
  SchemaFactory.createForClass(ConsolidationPayload);

@Schema({ _id: false })
export class PickupCard {
  @Prop({ required: true })
  en!: string;

  @Prop({ required: true })
  th!: string;
}
export const PickupCardSchema = SchemaFactory.createForClass(PickupCard);

@Schema({ _id: false })
export class PickupPayload {
  @Prop({ type: ObjectIdType, ref: "Order", required: true })
  orderId!: Types.ObjectId;

  @Prop({ required: true })
  lineId!: string;

  @Prop({ required: true })
  guestName!: string;

  @Prop({ required: true })
  flightNumber!: string;

  @Prop({ type: Date, required: true })
  etaAt!: Date;

  @Prop()
  meetingDoor?: number;

  @Prop()
  vehiclePlate?: string;

  @Prop({ type: ObjectIdType, ref: "HospitalityUser" })
  driverUserId?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(MessageChannel), required: true })
  channel!: MessageChannel;

  @Prop({
    type: String,
    enum: ["NOT_SENT", "QUEUED", "SENT", "FAILED"],
    default: "NOT_SENT",
  })
  deliveryStatus!: string;

  @Prop({ type: PickupCardSchema, required: true })
  card!: PickupCard;
}
export const PickupPayloadSchema = SchemaFactory.createForClass(PickupPayload);

@Schema({ timestamps: true, collection: "operational_dispatches" })
export class OperationalDispatch {
  @Prop({ type: ObjectIdType, ref: "Branch", required: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, match: BUSINESS_DATE })
  serviceDate!: string;

  @Prop({ type: String, enum: Object.values(DispatchType), required: true })
  type!: DispatchType;

  /** higher = do it first. see dispatch-rules.ts for the formulas */
  @Prop({ required: true, min: 0 })
  priorityScore!: number;

  @Prop({ type: String, enum: Object.values(Severity), default: Severity.INFO })
  severity!: Severity;

  @Prop({
    type: String,
    enum: Object.values(DispatchStatus),
    default: DispatchStatus.OPEN,
  })
  status!: DispatchStatus;

  @Prop({ required: true })
  title!: string;

  /** natural key, makes the 05:30 generator idempotent (re-running never duplicates tasks) */
  @Prop({ required: true })
  dedupeKey!: string;

  @Prop({ type: ObjectIdType, ref: "HospitalityUser" })
  assigneeUserId?: Types.ObjectId;

  @Prop({ type: Date })
  dueAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date, default: () => new Date() })
  generatedAt!: Date;

  @Prop({ type: HousekeepingPayloadSchema })
  housekeeping?: HousekeepingPayload;

  @Prop({ type: ConsolidationPayloadSchema })
  consolidation?: ConsolidationPayload;

  @Prop({ type: PickupPayloadSchema })
  pickup?: PickupPayload;
}

export type OperationalDispatchDocument = HydratedDocument<OperationalDispatch>;
export const OperationalDispatchSchema =
  SchemaFactory.createForClass(OperationalDispatch);

// idempotent generation
OperationalDispatchSchema.index(
  { branchId: 1, serviceDate: 1, type: 1, dedupeKey: 1 },
  { unique: true },
);
// the morning board: equality on branch/day, sort on score. type filter is a cheap in-index filter
OperationalDispatchSchema.index({
  branchId: 1,
  serviceDate: 1,
  type: 1,
  priorityScore: -1,
});
// "what's still open today, worst first". status is equality so the sort stays index-backed
OperationalDispatchSchema.index({
  branchId: 1,
  serviceDate: 1,
  status: 1,
  priorityScore: -1,
});
// my tasks (driver / housekeeper app)
OperationalDispatchSchema.index(
  { assigneeUserId: 1, serviceDate: 1, status: 1 },
  { sparse: true },
);

OperationalDispatchSchema.pre(
  "validate",
  function (this: OperationalDispatchDocument) {
    const need = {
      [DispatchType.HOUSEKEEPING_TURNAROUND]: "housekeeping",
      [DispatchType.TOUR_CONSOLIDATION]: "consolidation",
      [DispatchType.AIRPORT_PICKUP]: "pickup",
    } as const;
    if (!this[need[this.type]]) {
      throw new Error(
        `${this.type} dispatch requires ${need[this.type]} payload`,
      );
    }
  },
);

OperationalDispatchSchema.pre(
  "save",
  function (this: OperationalDispatchDocument) {
    if (this.isModified("status") && this.status === DispatchStatus.DONE) {
      this.completedAt ??= new Date();
    }
  },
);
