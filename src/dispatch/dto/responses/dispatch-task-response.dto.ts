import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  DispatchStatus,
  DispatchType,
  MessageChannel,
  Severity,
} from "../../../common/enums/dispatch.enum";

export class HousekeepingPayloadResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d1a" })
  roomId!: string;

  @ApiProperty({ example: "101" })
  roomNumber!: string;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d6f" })
  orderId?: string;

  @ApiPropertyOptional({ example: "Sarah Jenkins" })
  guestName?: string;

  @ApiProperty({ example: "2026-10-20T14:30:00.000Z" })
  etaAt!: Date;

  @ApiProperty({ example: "TRANSFER_FLIGHT" })
  etaSource!: string;

  @ApiPropertyOptional({ example: "TG917" })
  flightNumber?: string;

  @ApiProperty({ example: true })
  isVip!: boolean;

  @ApiProperty({ example: "2026-10-20T14:00:00.000Z" })
  targetReadyBy!: Date;
}

export class ConsolidationPayloadResponseDto {
  @ApiProperty({
    example:
      "665a1b2c3d4e5f6a7b8c9d0e1:TOUR:LONGTAIL-CANAL-TOUR:2026-10-20T08:30:00.000Z",
  })
  slotKey!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d3c" })
  serviceId!: string;

  @ApiProperty({ example: "Private Longtail Boat Canal Tour" })
  serviceName!: string;

  @ApiProperty({ example: "2026-10-20T08:30:00.000Z" })
  departsAt!: Date;

  @ApiProperty({ example: 1 })
  booked!: number;

  @ApiProperty({ example: 12 })
  capacity!: number;

  @ApiProperty({ example: 0.083 })
  fillRate!: number;

  @ApiProperty({ example: 2 })
  minViablePax!: number;

  @ApiProperty({ example: 5000 })
  fixedCostThb!: number;

  @ApiProperty({ example: 2500 })
  revenueThb!: number;

  @ApiProperty({ example: 2500 })
  projectedLossThb!: number;

  @ApiProperty({ example: "MERGE_OR_CANCEL" })
  recommendation!: string;
}

export class PickupCardResponseDto {
  @ApiProperty({ example: "Welcome to Bangkok, Ms. Sarah Jenkins" })
  en!: string;

  @ApiProperty({ example: "ยินดีต้อนรับสู่กรุงเทพฯ คุณซาร่าห์ เจนกินส์" })
  th!: string;
}

export class PickupPayloadResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d6f" })
  orderId!: string;

  @ApiProperty({ example: "e2b0a1d4-8c7e-4b9e-9d2a-1b2c3d4e5f6a" })
  lineId!: string;

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

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  driverUserId?: string;

  @ApiProperty({ enum: MessageChannel, example: MessageChannel.LINE })
  channel!: MessageChannel;

  @ApiProperty({ example: "SENT" })
  deliveryStatus!: string;

  @ApiProperty({ type: PickupCardResponseDto })
  card!: PickupCardResponseDto;
}

export class DispatchTaskResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d7a" })
  _id!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e1" })
  branchId!: string;

  @ApiProperty({ example: "2026-10-20" })
  serviceDate!: string;

  @ApiProperty({ enum: DispatchType, example: DispatchType.AIRPORT_PICKUP })
  type!: DispatchType;

  @ApiProperty({
    example: 120,
    description: "Dynamic priority score (higher = earlier attention)",
  })
  priorityScore!: number;

  @ApiProperty({ enum: Severity, example: Severity.WARN })
  severity!: Severity;

  @ApiProperty({ enum: DispatchStatus, example: DispatchStatus.OPEN })
  status!: DispatchStatus;

  @ApiProperty({ example: "Airport pickup TG917 - Sarah Jenkins (Door 3)" })
  title!: string;

  @ApiProperty({ example: "PICKUP:665a1b2c3d4e5f6a7b8c9d6f:line1" })
  dedupeKey!: string;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  assigneeUserId?: string;

  @ApiPropertyOptional({ example: "2026-10-20T14:30:00.000Z" })
  dueAt?: Date;

  @ApiPropertyOptional({ example: "2026-10-20T15:15:00.000Z" })
  completedAt?: Date;

  @ApiProperty({ example: "2026-10-20T05:30:00.000Z" })
  generatedAt!: Date;

  @ApiPropertyOptional({ type: HousekeepingPayloadResponseDto })
  housekeeping?: HousekeepingPayloadResponseDto;

  @ApiPropertyOptional({ type: ConsolidationPayloadResponseDto })
  consolidation?: ConsolidationPayloadResponseDto;

  @ApiPropertyOptional({ type: PickupPayloadResponseDto })
  pickup?: PickupPayloadResponseDto;

  @ApiProperty({ example: "2026-10-18T05:30:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-10-18T05:30:00.000Z" })
  updatedAt!: Date;
}
