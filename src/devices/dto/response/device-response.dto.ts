import { ApiProperty } from "@nestjs/swagger";
import { DevicePlatform } from "../../enums/device-platform.enum";

export class DeviceResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d9a" })
  id!: string;

  @ApiProperty({ example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" })
  expoPushToken!: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.IOS })
  platform!: DevicePlatform;

  @ApiProperty({ example: "1.0.0" })
  appVersion!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: "2026-10-18T12:00:00.000Z" })
  lastActiveAt!: Date;
}
