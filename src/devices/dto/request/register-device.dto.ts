import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { DevicePlatform } from "../../enums/device-platform.enum";

export class RegisterDeviceDto {
  @ApiProperty({
    example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    description: "Expo push notification token from mobile device",
  })
  @IsString()
  @IsNotEmpty()
  expoPushToken!: string;

  @ApiPropertyOptional({
    enum: DevicePlatform,
    default: DevicePlatform.IOS,
    example: DevicePlatform.IOS,
  })
  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;

  @ApiPropertyOptional({
    example: "1.0.0",
    description: "Application client version",
  })
  @IsOptional()
  @IsString()
  appVersion?: string;
}
