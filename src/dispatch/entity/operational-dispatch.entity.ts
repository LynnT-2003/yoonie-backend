import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import {
  DispatchStatus,
  DispatchType,
  MessageChannel,
  Severity,
} from "../../common/enums/dispatch.enum";
import { BUSINESS_DATE } from "../../common/helpers/regex.helper";
import {
  PickupIssueKind,
  PickupIssueResolution,
  PickupStage,
} from "../../common/enums/pickup.enum";

@Schema({ _id: false })
export class HousekeepingPayload {
  @Prop({ type: Types.ObjectId, ref: "Room", required: true })
  roomId!: Types.ObjectId;

  @Prop({ required: true })
  roomNumber!: string;

  @Prop({ type: Types.ObjectId, ref: "Order" })
  orderId?: Types.ObjectId;

  @Prop({ type: String })
  guestName?: string;

  @Prop({ type: Date, required: true })
  etaAt!: Date;

  @Prop({
    type: String,
    enum: ["TRANSFER_FLIGHT", "CHECKIN_TIME"],
    required: true,
  })
  etaSource!: string;

  @Prop({ type: String })
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

  @Prop({ type: Types.ObjectId, ref: "Service", required: true })
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

  @Prop({
    type: String,
    enum: ["MERGE_OR_CANCEL", "WATCH"],
    required: true,
  })
  recommendation!: string;

  /** What the manager decided; the flag is closed once this is set. */
  @Prop({ type: String, enum: ["KEEP", "MERGE", "CANCEL"] })
  decision?: "KEEP" | "MERGE" | "CANCEL";

  @Prop({ type: String })
  decisionNote?: string;
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

/** One reported step of a pickup: what happened, when, and who reported it. */
@Schema({ _id: false })
export class PickupStep {
  @Prop({ type: String, enum: Object.values(PickupStage), required: true })
  stage!: PickupStage;

  @Prop({ type: Date, required: true })
  at!: Date;

  @Prop({ type: Types.ObjectId, ref: "User" })
  byUserId?: Types.ObjectId;

  @Prop({ type: String })
  byName?: string;

  @Prop({ type: String })
  note?: string;
}
export const PickupStepSchema = SchemaFactory.createForClass(PickupStep);

/** A problem the driver raised that the desk has to answer. */
@Schema({ _id: false })
export class PickupIssue {
  @Prop({ type: String, enum: Object.values(PickupIssueKind), required: true })
  kind!: PickupIssueKind;

  @Prop({ type: String })
  note?: string;

  @Prop({ type: Date, required: true })
  at!: Date;

  @Prop({ type: String })
  byName?: string;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: String, enum: Object.values(PickupIssueResolution) })
  resolution?: PickupIssueResolution;

  @Prop({ type: String })
  resolutionNote?: string;

  @Prop({ type: String })
  resolvedByName?: string;
}
export const PickupIssueSchema = SchemaFactory.createForClass(PickupIssue);

@Schema({ _id: false })
export class PickupPayload {
  @Prop({ type: Types.ObjectId, ref: "Order", required: true })
  orderId!: Types.ObjectId;

  @Prop({ required: true })
  lineId!: string;

  @Prop({ required: true })
  guestName!: string;

  @Prop({ required: true })
  flightNumber!: string;

  @Prop({ type: Date, required: true })
  etaAt!: Date;

  @Prop({ type: Number })
  meetingDoor?: number;

  @Prop({ type: String })
  vehiclePlate?: string;

  @Prop({ type: Types.ObjectId, ref: "User" })
  driverUserId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(MessageChannel),
    required: true,
  })
  channel!: MessageChannel;

  @Prop({
    type: String,
    enum: ["NOT_SENT", "QUEUED", "SENT", "FAILED"],
    default: "NOT_SENT",
  })
  deliveryStatus!: string;

  @Prop({ type: PickupCardSchema, required: true })
  card!: PickupCard;

  @Prop({
    type: String,
    enum: Object.values(PickupStage),
    default: PickupStage.ASSIGNED,
  })
  stage?: PickupStage;

  @Prop({ type: [PickupStepSchema], default: [] })
  steps?: PickupStep[];

  @Prop({ type: PickupIssueSchema })
  issue?: PickupIssue;
}
export const PickupPayloadSchema = SchemaFactory.createForClass(PickupPayload);

/**
 * OperationalDispatch Document Schema Example:
 * -------------------------------------------------------------
 * {
 *   "_id": ObjectId("665a1b2c3d4e5f6a7b8c9d7a"),
 *   "branchId": ObjectId("665a1b2c3d4e5f6a7b8c9d0e"),
 *   "serviceDate": "2026-10-20",
 *   "type": "AIRPORT_PICKUP",
 *   "priorityScore": 120,
 *   "severity": "WARN",
 *   "status": "OPEN",
 *   "title": "Airport pickup TG917 - Sarah Jenkins (Door 3)",
 *   "dedupeKey": "PICKUP:665a1b2c3d4e5f6a7b8c9d6f:line1",
 *   "assigneeUserId": ObjectId("665a1b2c3d4e5f6a7b8c9d0a"),
 *   "dueAt": ISODate("2026-10-20T14:30:00.000Z"),
 *   "generatedAt": ISODate("2026-10-20T05:30:00.000Z"),
 *   "pickup": {
 *     "orderId": ObjectId("665a1b2c3d4e5f6a7b8c9d6f"),
 *     "lineId": "line1",
 *     "guestName": "Sarah Jenkins",
 *     "flightNumber": "TG917",
 *     "etaAt": ISODate("2026-10-20T14:30:00.000Z"),
 *     "meetingDoor": 3,
 *     "vehiclePlate": "1กข-9999",
 *     "driverUserId": ObjectId("665a1b2c3d4e5f6a7b8c9d0a"),
 *     "channel": "LINE",
 *     "deliveryStatus": "SENT",
 *     "card": {
 *       "en": "Welcome to Bangkok, Ms. Sarah Jenkins",
 *       "th": "ยินดีต้อนรับสู่กรุงเทพฯ คุณซาร่าห์ เจนกินส์"
 *     }
 *   },
 *   "createdAt": ISODate("2026-10-20T05:30:00.000Z"),
 *   "updatedAt": ISODate("2026-10-20T05:30:00.000Z")
 * }
 * -------------------------------------------------------------
 */
@Schema({ timestamps: true, collection: "operational_dispatches" })
export class OperationalDispatch {
  @Prop({ type: Types.ObjectId, ref: "Branch", required: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, match: BUSINESS_DATE })
  serviceDate!: string;

  @Prop({
    type: String,
    enum: Object.values(DispatchType),
    required: true,
  })
  type!: DispatchType;

  /** higher = do it first. see dispatch-rules.ts for the formulas */
  @Prop({ required: true, min: 0 })
  priorityScore!: number;

  @Prop({
    type: String,
    enum: Object.values(Severity),
    default: Severity.INFO,
  })
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

  @Prop({ type: Types.ObjectId, ref: "User" })
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
// the morning board: equality on branch/day, sort on score
OperationalDispatchSchema.index({
  branchId: 1,
  serviceDate: 1,
  type: 1,
  priorityScore: -1,
});
// open tasks today
OperationalDispatchSchema.index({
  branchId: 1,
  serviceDate: 1,
  status: 1,
  priorityScore: -1,
});
// staff task lists
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
