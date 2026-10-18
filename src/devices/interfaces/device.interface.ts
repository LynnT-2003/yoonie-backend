import { Types } from "mongoose";
import { DevicePlatform } from "../enums/device-platform.enum";

export interface IDevice {
  _id: string;
  userId: string | Types.ObjectId;
  expoPushToken: string;
  platform: DevicePlatform;
  appVersion: string;
  lastActiveAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
