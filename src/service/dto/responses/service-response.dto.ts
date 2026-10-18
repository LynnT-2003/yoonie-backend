import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  PricingModel,
  ServiceCategory,
  ServiceKind,
} from "../../../common/enums/service.enum";

export class TourConfigResponseDto {
  @ApiProperty({ example: 12 })
  capacity!: number;

  @ApiProperty({ example: 2 })
  minViablePax!: number;

  @ApiProperty({ example: 5000 })
  fixedCostThb!: number;

  @ApiProperty({ example: ["08:30", "13:30"], type: [String] })
  departureTimes!: string[];

  @ApiProperty({ example: 120 })
  durationMin!: number;

  @ApiProperty({ example: 6 })
  cutoffHoursBeforeDeparture!: number;

  @ApiPropertyOptional({ example: "Hotel Main Lobby" })
  meetingPoint?: string;
}

export class WellnessConfigResponseDto {
  @ApiProperty({ example: 2 })
  treatmentRooms!: number;

  @ApiProperty({ example: 4 })
  therapists!: number;

  @ApiProperty({ example: 60 })
  durationMin!: number;

  @ApiProperty({ example: 15 })
  turnoverMin!: number;

  @ApiProperty({
    example: ["10:00", "11:30", "14:00", "16:00"],
    type: [String],
  })
  startTimes!: string[];
}

export class VehicleResponseDto {
  @ApiProperty({ example: "1กข-9999" })
  plate!: string;

  @ApiProperty({ example: "MINIVAN" })
  type!: string;

  @ApiProperty({ example: 6 })
  capacityPax!: number;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  defaultDriverId?: string;

  @ApiProperty({ example: true })
  isActive!: boolean;
}

export class TransferConfigResponseDto {
  @ApiProperty({ example: "BKK" })
  airportCode!: string;

  @ApiProperty({ example: "Suvarnabhumi Airport" })
  airportName!: string;

  @ApiProperty({ type: [VehicleResponseDto] })
  vehicles!: VehicleResponseDto[];

  @ApiProperty({ example: true })
  flightTrackingEnabled!: boolean;

  @ApiProperty({ example: 60 })
  leadTimeMin!: number;

  @ApiProperty({ example: [3, 4], type: [Number] })
  meetingDoors!: number[];
}

export class ServiceResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d3c" })
  _id!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e" })
  branchId!: string;

  @ApiProperty({ example: "LONGTAIL-CANAL-TOUR" })
  code!: string;

  @ApiProperty({ enum: ServiceCategory, example: ServiceCategory.TOURS })
  category!: ServiceCategory;

  @ApiProperty({ enum: ServiceKind, example: ServiceKind.SCHEDULED_TOUR })
  kind!: ServiceKind;

  @ApiProperty({ example: "Private Longtail Boat Canal Tour" })
  name!: string;

  @ApiPropertyOptional({
    example: "2-hour sunset canal exploration of Bangkok's waterways",
  })
  description?: string;

  @ApiProperty({ example: 2500 })
  basePriceThb!: number;

  @ApiProperty({ enum: PricingModel, example: PricingModel.PER_PAX })
  pricingModel!: PricingModel;

  @ApiPropertyOptional({ type: TourConfigResponseDto })
  tour?: TourConfigResponseDto;

  @ApiPropertyOptional({ type: WellnessConfigResponseDto })
  wellness?: WellnessConfigResponseDto;

  @ApiPropertyOptional({ type: TransferConfigResponseDto })
  transfer?: TransferConfigResponseDto;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  updatedAt!: Date;
}
