import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { HHMM } from "../../../common/helpers/regex.helper";

export class RestaurantTableInputDto {
  @ApiProperty({ example: "T01" })
  @IsString()
  @IsNotEmpty()
  tableCode!: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  seats!: number;

  @ApiPropertyOptional({ example: 2, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  minSeats?: number;

  @ApiPropertyOptional({ example: "INDOOR", default: "INDOOR" })
  @IsString()
  @IsOptional()
  zone?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  isHighTop?: boolean;
}

export class MealShiftInputDto {
  @ApiProperty({ example: "BREAKFAST" })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: "Breakfast Buffet & A La Carte" })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ example: "06:30", description: "HH:mm format" })
  @IsString()
  @Matches(HHMM)
  startTime!: string;

  @ApiProperty({ example: "10:30", description: "HH:mm format" })
  @IsString()
  @Matches(HHMM)
  endTime!: string;

  @ApiPropertyOptional({ example: 60, default: 60 })
  @IsInt()
  @Min(15)
  @IsOptional()
  slotLengthMin?: number;

  @ApiPropertyOptional({
    example: [0, 1, 2, 3, 4, 5, 6],
    type: [Number],
  })
  @IsArray()
  @IsOptional()
  daysOfWeek?: number[];
}

export class CreateRestaurantDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e" })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({ example: "THE-RIVERSIDE-GRILL" })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: "The Riverside Grill & Lounge" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: "Contemporary Thai Seafood & Grill" })
  @IsString()
  @IsOptional()
  cuisine?: string;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(1)
  maxSeats!: number;

  @ApiPropertyOptional({ example: 90, default: 90 })
  @IsInt()
  @Min(15)
  @IsOptional()
  avgTurnMinutes?: number;

  @ApiPropertyOptional({ type: [RestaurantTableInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestaurantTableInputDto)
  @IsOptional()
  tables?: RestaurantTableInputDto[];

  @ApiPropertyOptional({ type: [MealShiftInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealShiftInputDto)
  @IsOptional()
  shifts?: MealShiftInputDto[];
}
