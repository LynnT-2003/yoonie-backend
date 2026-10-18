import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CleaningStatus } from "../../../common/enums/cleaning-status.enum";
import { DispatchStatus } from "../../../common/enums/dispatch.enum";

export class HousekeepingTaskDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d7a" })
  dispatchId!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d1a" })
  roomId!: string;

  @ApiProperty({ example: "101" })
  roomNumber!: string;

  @ApiProperty({ example: 1 })
  floor!: number;

  @ApiProperty({ example: "STANDARD_KING" })
  roomType!: string;

  @ApiProperty({ enum: CleaningStatus, example: CleaningStatus.DIRTY })
  cleaningStatus!: CleaningStatus;

  @ApiProperty({ enum: DispatchStatus, example: DispatchStatus.OPEN })
  dispatchStatus!: DispatchStatus;

  @ApiProperty({ example: 120 })
  priorityScore!: number;

  @ApiProperty({ example: "2026-10-20T14:30:00.000Z" })
  etaAt!: Date;

  @ApiProperty({ example: false })
  isVip!: boolean;

  @ApiProperty({ example: "2026-10-20T14:00:00.000Z" })
  targetReadyBy!: Date;

  @ApiPropertyOptional({ example: "Sarah Jenkins" })
  guestName?: string;

  @ApiPropertyOptional({ example: "TG917" })
  flightNumber?: string;
}

export class PickupTaskDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d7b" })
  dispatchId!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d6f" })
  orderId!: string;

  @ApiProperty({ example: "Sarah Jenkins" })
  guestName!: string;

  @ApiProperty({ example: "TG917" })
  flightNumber!: string;

  @ApiProperty({ example: "2026-10-20T14:30:00.000Z" })
  etaAt!: Date;

  @ApiPropertyOptional({ example: 3 })
  meetingDoor?: number;

  @ApiPropertyOptional({ example: "1กข-9999" })
  vehiclePlate?: string;

  @ApiProperty({ enum: DispatchStatus, example: DispatchStatus.OPEN })
  dispatchStatus!: DispatchStatus;

  @ApiProperty({ example: "SENT" })
  deliveryStatus!: string;

  @ApiProperty({
    example: {
      en: "Welcome to Bangkok, Ms. Sarah Jenkins",
      th: "ยินดีต้อนรับสู่กรุงเทพฯ คุณซาร่าห์ เจนกินส์",
    },
  })
  card!: {
    en: string;
    th: string;
  };
}

export class StaffTasksResponseDto {
  @ApiProperty({ type: [HousekeepingTaskDto] })
  housekeeping!: HousekeepingTaskDto[];

  @ApiProperty({ type: [PickupTaskDto] })
  pickups!: PickupTaskDto[];
}
