import { ApiProperty } from "@nestjs/swagger";
import { CleaningStatus } from "../../../common/enums/cleaning-status.enum";
import { RoomTypeCode } from "../../../common/enums/room-type.enum";

export class BlockedRangeResponseDto {
  @ApiProperty({ example: "2026-10-25" })
  from!: string;

  @ApiProperty({ example: "2026-10-28" })
  to!: string;

  @ApiProperty({ example: "MAINTENANCE" })
  reason!: string;
}

export class RoomResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d1a" })
  _id!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e" })
  branchId!: string;

  @ApiProperty({ example: "101" })
  roomNumber!: string;

  @ApiProperty({ example: 1 })
  floor!: number;

  @ApiProperty({ enum: RoomTypeCode, example: RoomTypeCode.STANDARD_KING })
  roomType!: RoomTypeCode;

  @ApiProperty({ example: 2 })
  maxOccupancy!: number;

  @ApiProperty({ example: 2200 })
  baseRateThb!: number;

  @ApiProperty({ example: ["King Bed", "En-suite Bath", "Smart TV"] })
  amenities!: string[];

  @ApiProperty({
    example: "https://images.yoonie.si/rooms/standard-king-cover.webp",
    required: false,
  })
  coverImage?: string;

  @ApiProperty({
    example: [
      "https://images.yoonie.si/rooms/standard-king-1.webp",
      "https://images.yoonie.si/rooms/standard-king-2.webp",
    ],
    type: [String],
  })
  images!: string[];

  @ApiProperty({ enum: CleaningStatus, example: CleaningStatus.INSPECTED })
  cleaningStatus!: CleaningStatus;

  @ApiProperty({ example: "2026-10-18T08:00:00.000Z", required: false })
  cleaningUpdatedAt?: Date;

  @ApiProperty({ type: [BlockedRangeResponseDto] })
  blockedRanges!: BlockedRangeResponseDto[];

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  updatedAt!: Date;
}
