import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NotificationSeverity } from "../../enums/notification-severity.enum";
import { NotificationStatus } from "../../enums/notification-status.enum";
import { NotificationType } from "../../enums/notification-type.enum";

export class NotificationResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9e01" })
  id!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  userId!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e" })
  branchId!: string;

  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.TASK_ASSIGNED,
  })
  type!: NotificationType;

  @ApiProperty({
    enum: NotificationSeverity,
    example: NotificationSeverity.INFO,
  })
  severity!: NotificationSeverity;

  @ApiProperty({ example: "New turnaround task assigned: Room 101" })
  title!: string;

  @ApiProperty({ example: "Room 101 needs cleaning by 14:00" })
  body!: string;

  @ApiProperty({ example: { roomId: "665a1b2c3d4e5f6a7b8c9d1a" } })
  data!: Record<string, any>;

  @ApiProperty({
    enum: NotificationStatus,
    example: NotificationStatus.SENT,
  })
  status!: NotificationStatus;

  @ApiPropertyOptional({ example: "2026-10-18T12:05:00.000Z" })
  readAt?: Date | null;

  @ApiPropertyOptional({ example: "2026-10-18T12:10:00.000Z" })
  ackedAt?: Date | null;

  @ApiPropertyOptional({ example: null })
  escalatedAt?: Date | null;

  @ApiProperty({ example: "2026-10-18T12:00:00.000Z" })
  createdAt!: Date;
}
