import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { IdempotencyState } from "../enums/idempotency-state.enum";

@Schema({ timestamps: true, collection: "idempotency_keys" })
export class IdempotencyKey {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  methodPath!: string;

  @Prop({ required: true, trim: true })
  bodyHash!: string;

  @Prop({
    type: String,
    enum: Object.values(IdempotencyState),
    default: IdempotencyState.IN_PROGRESS,
    required: true,
  })
  state!: IdempotencyState;

  @Prop({ type: Object })
  response?: any;

  @Prop({
    type: Date,
    default: () => new Date(),
    expires: 86400, // 24-hour TTL
  })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKey>;
export const IdempotencyKeySchema =
  SchemaFactory.createForClass(IdempotencyKey);

// Compound unique index on (userId, key)
IdempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });
