import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
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
import {
  TourConfigInputDto,
  TransferConfigInputDto,
  WellnessConfigInputDto,
} from "./create-service.dto";

export class UpdateServiceDto {
  @ApiPropertyOptional({ example: "Private Longtail Boat Canal Tour" })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: ServiceCategory })
  @IsEnum(ServiceCategory)
  @IsOptional()
  category?: ServiceCategory;

  @ApiPropertyOptional({ enum: ServiceKind })
  @IsEnum(ServiceKind)
  @IsOptional()
  kind?: ServiceKind;

  @ApiPropertyOptional({ example: "Updated description..." })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 2500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  basePriceThb?: number;

  @ApiPropertyOptional({ enum: PricingModel })
  @IsEnum(PricingModel)
  @IsOptional()
  pricingModel?: PricingModel;

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
