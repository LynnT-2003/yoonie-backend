import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema, Types } from "mongoose";
import { AuditAction } from "../enums/audit-action.enum";

@Schema({ _id: false })
export class AuditActor {
  @Prop({ type: String, default: null })
  userId: string | null;

  @Prop({ type: String, default: null })
  email: string | null;

  @Prop({ type: String, default: null })
  role: string | null;

  @Prop({ type: Boolean, default: false })
  isPlatformAdmin: boolean;
}
export const AuditActorSchema = SchemaFactory.createForClass(AuditActor);

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: "audit_logs",
})
export class AuditLog {
  _id: Types.ObjectId;

  @Prop({ type: AuditActorSchema, required: true })
  who: AuditActor;

  @Prop({ type: String, enum: Object.values(AuditAction), required: true })
  action: AuditAction;

  @Prop({ type: String, required: true })
  targetType: string; // "order" | "order_line" | "room" | "staff" | "dispatch"

  @Prop({ type: String, required: true })
  targetId: string;

  @Prop({ type: String, default: null })
  branchId: string | null;

  @Prop({ type: Date, default: () => new Date(), required: true })
  when: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  from: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  to: any;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ action: 1, when: -1 });
AuditLogSchema.index({ branchId: 1, when: -1 });
