import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { NotificationSeverity } from "../../enums/notification-severity.enum";
import { NotificationType } from "../../enums/notification-type.enum";

export class CreateNotificationDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e" })
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({ example: "New turnaround task assigned: Room 101" })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: "Room 101 needs cleaning by 14:00" })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({
    enum: NotificationType,
    default: NotificationType.GENERAL,
  })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional({
    enum: NotificationSeverity,
    default: NotificationSeverity.INFO,
  })
  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @ApiPropertyOptional({ example: { roomId: "665a1b2c3d4e5f6a7b8c9d1a" } })
  @IsOptional()
  data?: Record<string, any>;

  @ApiPropertyOptional({ example: ["inbox", "push"] })
  @IsOptional()
  @IsArray()
  channels?: string[];
}
