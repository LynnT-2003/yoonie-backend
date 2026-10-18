import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { IDevicesService } from "./interfaces/devices.service.interface";
import { Device, DeviceDocument } from "./entity/device.entity";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { RegisterDeviceDto } from "./dto/request/register-device.dto";
import { DeviceResponseDto } from "./dto/response/device-response.dto";
import { DevicePlatform } from "./enums/device-platform.enum";

@Injectable()
export class DevicesService implements IDevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectModel(Device.name)
    private readonly deviceModel: Model<DeviceDocument>,
  ) {}

  async register(
    currentUser: ICurrentUser,
    dto: RegisterDeviceDto,
  ): Promise<DeviceResponseDto> {
    const userObjectId = new Types.ObjectId(currentUser.userId);
    const platform = dto.platform || DevicePlatform.IOS;
    const appVersion = dto.appVersion || "1.0.0";

    const device = await this.deviceModel
      .findOneAndUpdate(
        { expoPushToken: dto.expoPushToken.trim() },
        {
          $set: {
            userId: userObjectId,
            platform,
            appVersion,
            isActive: true,
            lastActiveAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return {
      id: device._id.toString(),
      expoPushToken: device.expoPushToken,
      platform: device.platform,
      appVersion: device.appVersion,
      isActive: device.isActive,
      lastActiveAt: device.lastActiveAt,
    };
  }

  async unregister(
    currentUser: ICurrentUser,
    idOrToken: string,
  ): Promise<void> {
    const userObjectId = new Types.ObjectId(currentUser.userId);
    const isObjectId = Types.ObjectId.isValid(idOrToken);

    const filter: Record<string, any> = { userId: userObjectId };
    if (isObjectId) {
      filter.$or = [
        { _id: new Types.ObjectId(idOrToken) },
        { expoPushToken: idOrToken },
      ];
    } else {
      filter.expoPushToken = idOrToken;
    }

    const res = await this.deviceModel
      .updateOne(filter, { $set: { isActive: false } })
      .exec();

    if (res.matchedCount === 0) {
      throw new NotFoundException("Device not found");
    }
  }

  async getActiveTokensForUser(userId: string): Promise<string[]> {
    const devices = await this.deviceModel
      .find({
        userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .select("expoPushToken")
      .lean()
      .exec();

    return devices.map((d) => d.expoPushToken);
  }

  async handleInvalidToken(token: string): Promise<void> {
    this.logger.warn(`Deactivating invalid Expo push token: ${token}`);
    await this.deviceModel
      .updateOne({ expoPushToken: token }, { $set: { isActive: false } })
      .exec();
  }
}
