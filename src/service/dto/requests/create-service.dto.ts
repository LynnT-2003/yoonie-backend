import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import {
  PricingModel,
  ServiceCategory,
  ServiceKind,
} from "../../../common/enums/service.enum";

export class TourConfigInputDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  capacity!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  minViablePax!: number;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0)
  fixedCostThb!: number;

  @ApiProperty({ example: ["08:30", "13:30"], type: [String] })
  @IsArray()
  @IsString({ each: true })
  departureTimes!: string[];

  @ApiPropertyOptional({ example: 180, default: 120 })
  @IsInt()
  @Min(1)
  @IsOptional()
  durationMin?: number;

  @ApiPropertyOptional({ example: 6, default: 6 })
  @IsInt()
  @Min(0)
  @IsOptional()
  cutoffHoursBeforeDeparture?: number;

  @ApiPropertyOptional({ example: "Hotel Main Lobby" })
  @IsString()
  @IsOptional()
  meetingPoint?: string;
}

export class WellnessConfigInputDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  treatmentRooms!: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  therapists!: number;

  @ApiPropertyOptional({ example: 90, default: 60 })
  @IsInt()
  @Min(15)
  @IsOptional()
  durationMin?: number;

  @ApiPropertyOptional({ example: 15, default: 15 })
  @IsInt()
  @Min(0)
  @IsOptional()
  turnoverMin?: number;

  @ApiProperty({
    example: ["10:00", "11:30", "14:00", "16:00"],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  startTimes!: string[];
}

export class VehicleInputDto {
  @ApiProperty({ example: "1กข-9999" })
  @IsString()
  @IsNotEmpty()
  plate!: string;

  @ApiPropertyOptional({ example: "MINIVAN", default: "MINIVAN" })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ example: 6 })
  @IsInt()
  @Min(1)
  capacityPax!: number;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  @IsMongoId()
  @IsOptional()
  defaultDriverId?: string;
}

export class TransferConfigInputDto {
  @ApiPropertyOptional({ example: "BKK", default: "BKK" })
  @IsString()
  @IsOptional()
  airportCode?: string;

  @ApiPropertyOptional({ example: "Suvarnabhumi Airport" })
  @IsString()
  @IsOptional()
  airportName?: string;

  @ApiPropertyOptional({ type: [VehicleInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehicleInputDto)
  @IsOptional()
  vehicles?: VehicleInputDto[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  flightTrackingEnabled?: boolean;

  @ApiPropertyOptional({ example: 60, default: 60 })
  @IsInt()
  @Min(0)
  @IsOptional()
  leadTimeMin?: number;

  @ApiPropertyOptional({ example: [3, 4], type: [Number] })
  @IsArray()
  @IsOptional()
  meetingDoors?: number[];
}

export class CreateServiceDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e" })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({ example: "LONGTAIL-CANAL-TOUR" })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ enum: ServiceCategory, example: ServiceCategory.TOURS })
  @IsEnum(ServiceCategory)
  @IsNotEmpty()
  category!: ServiceCategory;

  @ApiProperty({ enum: ServiceKind, example: ServiceKind.SCHEDULED_TOUR })
  @IsEnum(ServiceKind)
  @IsNotEmpty()
  kind!: ServiceKind;

  @ApiProperty({ example: "Private Longtail Boat Canal Tour" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    example: "2-hour sunset canal exploration of Bangkok's waterways",
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 2500 })
  @IsNumber()
  @Min(0)
  basePriceThb!: number;

  @ApiProperty({ enum: PricingModel, example: PricingModel.PER_PAX })
  @IsEnum(PricingModel)
  @IsNotEmpty()
  pricingModel!: PricingModel;

  @ApiPropertyOptional({ type: TourConfigInputDto })
  @ValidateNested()
  @Type(() => TourConfigInputDto)
  @IsOptional()
  tour?: TourConfigInputDto;

  @ApiPropertyOptional({ type: WellnessConfigInputDto })
  @ValidateNested()
  @Type(() => WellnessConfigInputDto)
  @IsOptional()
  wellness?: WellnessConfigInputDto;

  @ApiPropertyOptional({ type: TransferConfigInputDto })
  @ValidateNested()
  @Type(() => TransferConfigInputDto)
  @IsOptional()
  transfer?: TransferConfigInputDto;
}
