import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import {
  MealShiftInputDto,
  RestaurantTableInputDto,
} from "./create-restaurant.dto";

export class UpdateRestaurantDto {
  @ApiPropertyOptional({ example: "The Glasshouse River Grill" })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: "Modern Thai & Seafood" })
  @IsString()
  @IsOptional()
  cuisine?: string;

  @ApiPropertyOptional({ example: 80 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxSeats?: number;

  @ApiPropertyOptional({ example: 90 })
  @Type(() => Number)
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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional({ type: [String] })
  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return value.split(",").map((s) => s.trim());
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];
}
