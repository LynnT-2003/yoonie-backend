import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RestaurantTableResponseDto {
  @ApiProperty({ example: "T01" })
  tableCode!: string;

  @ApiProperty({ example: 4 })
  seats!: number;

  @ApiProperty({ example: 2 })
  minSeats!: number;

  @ApiProperty({ example: "INDOOR" })
  zone!: string;

  @ApiProperty({ example: false })
  isHighTop!: boolean;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class MealShiftResponseDto {
  @ApiProperty({ example: "BREAKFAST" })
  code!: string;

  @ApiProperty({ example: "Breakfast Buffet & A La Carte" })
  label!: string;

  @ApiProperty({ example: "06:30" })
  startTime!: string;

  @ApiProperty({ example: "10:30" })
  endTime!: string;

  @ApiProperty({ example: 60 })
  slotLengthMin!: number;

  @ApiProperty({ example: [0, 1, 2, 3, 4, 5, 6], type: [Number] })
  daysOfWeek!: number[];
}

export class RestaurantResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d2b" })
  _id!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e" })
  branchId!: string;

  @ApiProperty({ example: "THE-RIVERSIDE-GRILL" })
  code!: string;

  @ApiProperty({ example: "The Riverside Grill & Lounge" })
  name!: string;

  @ApiPropertyOptional({ example: "Contemporary Thai Seafood & Grill" })
  cuisine?: string;

  @ApiProperty({ type: [RestaurantTableResponseDto] })
  tables!: RestaurantTableResponseDto[];

  @ApiProperty({ type: [MealShiftResponseDto] })
  shifts!: MealShiftResponseDto[];

  @ApiProperty({ example: 60 })
  maxSeats!: number;

  @ApiProperty({ example: 60 })
  totalSeats!: number;

  @ApiProperty({ example: 90 })
  avgTurnMinutes!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  updatedAt!: Date;
}
