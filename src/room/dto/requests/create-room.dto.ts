import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { RoomTypeCode } from "../../../common/enums/room-type.enum";

export class CreateRoomDto {
  @ApiProperty({
    example: "665a1b2c3d4e5f6a7b8c9d0e",
    description: "Branch ID of the property",
  })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({ example: "101", description: "Unique room number per branch" })
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;

  @ApiPropertyOptional({ example: 1, description: "Floor level of the room" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  floor?: number;

  @ApiProperty({
    enum: RoomTypeCode,
    example: RoomTypeCode.STANDARD_KING,
    description: "Room category / spec type",
  })
  @IsEnum(RoomTypeCode)
  @IsNotEmpty()
  roomType!: RoomTypeCode;

  @ApiProperty({ example: 2, description: "Maximum guest occupancy" })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxOccupancy!: number;

  @ApiProperty({ example: 2200, description: "Base nightly rack rate in THB" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseRateThb!: number;

  @ApiPropertyOptional({
    example: ["King Bed", "En-suite Bath", "Smart TV"],
    type: [String],
    description: "List of amenities in the room",
  })
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
  amenities?: string[] = [];

  @ApiPropertyOptional({
    example: "https://images.yoonie.si/rooms/standard-king-cover.webp",
    description: "Main cover image URL (if not uploading binary file)",
  })
  @IsString()
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional({
    example: [
      "https://images.yoonie.si/rooms/standard-king-1.webp",
      "https://images.yoonie.si/rooms/standard-king-2.webp",
    ],
    type: [String],
    description: "Gallery image URLs (if not uploading binary files)",
  })
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
  images?: string[] = [];
}
