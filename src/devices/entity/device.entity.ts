import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { DevicePlatform } from "../enums/device-platform.enum";

@Schema({ timestamps: true, collection: "devices" })
export class Device {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  expoPushToken!: string;

  @Prop({
    type: String,
    enum: Object.values(DevicePlatform),
    default: DevicePlatform.IOS,
  })
  platform!: DevicePlatform;

  @Prop({ type: String, default: "1.0.0" })
  appVersion!: string;

  @Prop({ type: Date, default: () => new Date() })
  lastActiveAt!: Date;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  @Prop({ type: Date })
  createdAt!: Date;

  @Prop({ type: Date })
  updatedAt!: Date;
}

export type DeviceDocument = HydratedDocument<Device>;
export const DeviceSchema = SchemaFactory.createForClass(Device);

DeviceSchema.index({ expoPushToken: 1 }, { unique: true });
DeviceSchema.index({ userId: 1, isActive: 1 });
