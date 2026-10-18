import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { RoomTypeCode } from "../../../common/enums/room-type.enum";
import { CleaningStatus } from "../../../common/enums/cleaning-status.enum";

export class UpdateRoomDto {
  @ApiPropertyOptional({ example: "101", description: "Unique room number" })
  @IsString()
  @IsOptional()
  roomNumber?: string;

  @ApiPropertyOptional({ example: 1, description: "Floor level" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  floor?: number;

  @ApiPropertyOptional({ enum: RoomTypeCode })
  @IsEnum(RoomTypeCode)
  @IsOptional()
  roomType?: RoomTypeCode;

  @ApiPropertyOptional({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxOccupancy?: number;

  @ApiPropertyOptional({ example: 2200 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  baseRateThb?: number;

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
  amenities?: string[];

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

  @ApiPropertyOptional({ enum: CleaningStatus })
  @IsEnum(CleaningStatus)
  @IsOptional()
  cleaningStatus?: CleaningStatus;
}
