import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { RoomTypeCode } from "../../../common/enums/room-type.enum";
import { BUSINESS_DATE } from "../../../common/helpers/regex.helper";

export class HoldItemDto {
  @ApiProperty({
    example:
      "665a1b2c3d4e5f6a7b8c9d0e1:ROOM_NIGHT:STANDARD_KING:2026-10-20T00:00:00.000Z",
    description: "Target slot key to atomically hold",
  })
  @IsString()
  @IsNotEmpty()
  slotKey!: string;

  @ApiProperty({
    example: 1,
    minimum: 1,
    description: "Quantity of slots to hold",
  })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class HoldStayDto {
  @ApiProperty({ enum: RoomTypeCode, example: RoomTypeCode.STANDARD_KING })
  @IsEnum(RoomTypeCode)
  roomType!: RoomTypeCode;

  @ApiProperty({ example: "2026-10-20" })
  @Matches(BUSINESS_DATE)
  checkInDate!: string;

  @ApiProperty({ example: "2026-10-22" })
  @Matches(BUSINESS_DATE)
  checkOutDate!: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
}

export class HoldServiceDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d3c" })
  @IsMongoId()
  serviceId!: string;

  @ApiProperty({
    example: "2026-10-26T01:00:00.000Z",
    description: "Departure, treatment or pickup time",
  })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  pax!: number;
}

export class CreateHoldDto {
  @ApiProperty({
    example: "665a1b2c3d4e5f6a7b8c9d0e1",
    description: "Branch ObjectId",
  })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({
    example: "cart_abc123",
    description: "Unique checkout cart session ID",
  })
  @IsString()
  @IsNotEmpty()
  cartId!: string;

  @ApiPropertyOptional({
    type: [HoldItemDto],
    description: "List of slot keys and quantities to hold",
  })
  @ValidateIf((o: CreateHoldDto) => !o.stays && !o.services)
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => HoldItemDto)
  lines?: HoldItemDto[];

  @ApiPropertyOptional({
    type: [HoldStayDto],
    description:
      "Room stays to hold by date range; the server expands them into room-night slots",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HoldStayDto)
  stays?: HoldStayDto[];

  @ApiPropertyOptional({
    type: [HoldServiceDto],
    description: "Transfers, tours and treatments to hold capacity for",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HoldServiceDto)
  services?: HoldServiceDto[];

  @ApiPropertyOptional({
    example: 15,
    default: 15,
    description: "Hold TTL in minutes before automatic expiration",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMinutes?: number;
}
