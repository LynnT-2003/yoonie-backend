import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { LineKind } from "../../../common/enums/order.enum";
import { RoomTypeCode } from "../../../common/enums/room-type.enum";
import { ServiceKind } from "../../../common/enums/service.enum";
import { BUSINESS_DATE, E164 } from "../../../common/helpers/regex.helper";

export class GuestSnapshotInputDto {
  @ApiProperty({ example: "Sarah Jenkins" })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiPropertyOptional({ example: "sarah.j@example.com" })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: "+66812345678" })
  @IsString()
  @IsOptional()
  @Matches(E164)
  phoneE164?: string;

  @ApiPropertyOptional({ example: "U1234567890abcdef" })
  @IsString()
  @IsOptional()
  lineUserId?: string;

  @ApiPropertyOptional({ enum: ["en", "th"], default: "en" })
  @IsEnum(["en", "th"])
  @IsOptional()
  preferredLanguage?: "en" | "th";
}

export class NightlyRateInputDto {
  @ApiProperty({ example: "2026-10-20" })
  @IsString()
  @Matches(BUSINESS_DATE)
  date!: string;

  @ApiProperty({ example: 2200 })
  @IsNumber()
  @Min(0)
  rateThb!: number;
}

export class StayDetailInputDto {
  @ApiProperty({ enum: RoomTypeCode, example: RoomTypeCode.STANDARD_KING })
  @IsEnum(RoomTypeCode)
  roomType!: RoomTypeCode;

  @ApiProperty({ example: "2026-10-20" })
  @IsString()
  @Matches(BUSINESS_DATE)
  checkInDate!: string;

  @ApiProperty({ example: "2026-10-22" })
  @IsString()
  @Matches(BUSINESS_DATE)
  checkOutDate!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  nights!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  adults!: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  children?: number;

  @ApiPropertyOptional({ type: [NightlyRateInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NightlyRateInputDto)
  @IsOptional()
  nightlyRates?: NightlyRateInputDto[];
}

export class DiningDetailInputDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d2b" })
  @IsMongoId()
  restaurantId!: string;

  @ApiProperty({ example: "The Riverside Grill & Lounge" })
  @IsString()
  restaurantName!: string;

  @ApiProperty({ example: "EVENING" })
  @IsString()
  shiftCode!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  partySize!: number;

  @ApiPropertyOptional({ example: "T01" })
  @IsString()
  @IsOptional()
  tableCode?: string;

  @ApiPropertyOptional({ example: "Window seating preferred" })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class FlightInfoInputDto {
  @ApiProperty({ example: "TG917" })
  @IsString()
  number!: string;

  @ApiProperty({ enum: ["ARRIVAL", "DEPARTURE"], example: "ARRIVAL" })
  @IsEnum(["ARRIVAL", "DEPARTURE"])
  direction!: "ARRIVAL" | "DEPARTURE";

  @ApiProperty({ example: "2026-10-20T14:30:00.000Z" })
  @Type(() => Date)
  @IsDate()
  scheduledAt!: Date;

  @ApiPropertyOptional({ example: "Terminal 1" })
  @IsString()
  @IsOptional()
  terminal?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @IsOptional()
  meetingDoor?: number;
}

export class ServiceDetailInputDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d3c" })
  @IsMongoId()
  serviceId!: string;

  @ApiProperty({ example: "Private Airport Transfer" })
  @IsString()
  serviceName!: string;

  @ApiProperty({ enum: ServiceKind, example: ServiceKind.AIRPORT_TRANSFER })
  @IsEnum(ServiceKind)
  serviceKind!: ServiceKind;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  pax!: number;

  @ApiPropertyOptional({ type: FlightInfoInputDto })
  @ValidateNested()
  @Type(() => FlightInfoInputDto)
  @IsOptional()
  flight?: FlightInfoInputDto;
}

export class SlotRefInputDto {
  @ApiProperty({
    example:
      "665a1b2c3d4e5f6a7b8c9d0e1:ROOM_NIGHT:STANDARD_KING:2026-10-20T00:00:00.000Z",
  })
  @IsString()
  slotKey!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class OrderLineInputDto {
  @ApiProperty({ enum: LineKind, example: LineKind.STAY })
  @IsEnum(LineKind)
  kind!: LineKind;

  @ApiProperty({ example: "Standard King Room (2 nights)" })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @ApiProperty({ example: 4400 })
  @IsNumber()
  @Min(0)
  unitPriceThb!: number;

  @ApiProperty({ example: "2026-10-20T07:00:00.000Z" })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiPropertyOptional({ example: "2026-10-22T05:00:00.000Z" })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  endsAt?: Date;

  @ApiProperty({ example: "2026-10-20" })
  @IsString()
  @Matches(BUSINESS_DATE)
  businessDate!: string;

  @ApiPropertyOptional({ type: [SlotRefInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SlotRefInputDto)
  @IsOptional()
  slotRefs?: SlotRefInputDto[];

  @ApiPropertyOptional({ type: StayDetailInputDto })
  @ValidateNested()
  @Type(() => StayDetailInputDto)
  @IsOptional()
  stay?: StayDetailInputDto;

  @ApiPropertyOptional({ type: DiningDetailInputDto })
  @ValidateNested()
  @Type(() => DiningDetailInputDto)
  @IsOptional()
  dining?: DiningDetailInputDto;

  @ApiPropertyOptional({ type: ServiceDetailInputDto })
  @ValidateNested()
  @Type(() => ServiceDetailInputDto)
  @IsOptional()
  service?: ServiceDetailInputDto;
}

export class AttributionInputDto {
  @ApiPropertyOptional({ example: "google" })
  @IsString()
  @IsOptional()
  utmSource?: string;

  @ApiPropertyOptional({ example: "cpc" })
  @IsString()
  @IsOptional()
  utmMedium?: string;

  @ApiPropertyOptional({ example: "DIRECT_WEB", default: "DIRECT_WEB" })
  @IsString()
  @IsOptional()
  channel?: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e1" })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a1" })
  @IsMongoId()
  @IsOptional()
  guestUserId?: string;

  @ApiProperty({ type: GuestSnapshotInputDto })
  @ValidateNested()
  @Type(() => GuestSnapshotInputDto)
  guest!: GuestSnapshotInputDto;

  @ApiProperty({ type: [OrderLineInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLineInputDto)
  lines!: OrderLineInputDto[];

  @ApiPropertyOptional({
    example: "665a1b2c3d4e5f6a7b8c9d5e",
    description: "Inventory hold returned by POST /inventory/hold",
  })
  @IsMongoId()
  @IsOptional()
  holdId?: string;

  @ApiPropertyOptional({ type: AttributionInputDto })
  @ValidateNested()
  @Type(() => AttributionInputDto)
  @IsOptional()
  attribution?: AttributionInputDto;

  @ApiPropertyOptional({ example: "Early check-in requested if possible" })
  @IsString()
  @IsOptional()
  specialRequests?: string;
}
