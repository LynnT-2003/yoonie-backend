import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { NotificationSeverity } from "../enums/notification-severity.enum";
import { NotificationStatus } from "../enums/notification-status.enum";
import { NotificationType } from "../enums/notification-type.enum";

@Schema({ timestamps: true, collection: "notifications" })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Branch", required: true, index: true })
  branchId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(NotificationType),
    default: NotificationType.GENERAL,
  })
  type!: NotificationType;

  @Prop({
    type: String,
    enum: Object.values(NotificationSeverity),
    default: NotificationSeverity.INFO,
  })
  severity!: NotificationSeverity;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  body!: string;

  @Prop({ type: Object, default: {} })
  data!: Record<string, any>;

  @Prop({ type: [String], default: ["inbox", "push"] })
  channels!: string[];

  @Prop({
    type: String,
    enum: Object.values(NotificationStatus),
    default: NotificationStatus.PENDING,
    index: true,
  })
  status!: NotificationStatus;

  @Prop({ type: Date, default: null })
  lockedUntil?: Date | null;

  @Prop({ type: Number, default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: null })
  readAt?: Date | null;

  @Prop({ type: Date, default: null })
  ackedAt?: Date | null;

  @Prop({ type: Date, default: null })
  escalatedAt?: Date | null;

  @Prop({
    type: [{ id: String, token: String }],
    default: [],
  })
  expoTickets!: Array<{ id: string; token: string }>;

  @Prop({ type: Boolean, default: false })
  expoReceiptsChecked!: boolean;

  @Prop({ type: Date })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ status: 1, lockedUntil: 1, createdAt: 1 });
NotificationSchema.index({
  severity: 1,
  status: 1,
  ackedAt: 1,
  escalatedAt: 1,
});
NotificationSchema.index({ status: 1, expoReceiptsChecked: 1 });
