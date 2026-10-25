import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { BUSINESS_DATE } from "../../common/helpers/regex.helper";

export class ConciergeHotelQueryDto {
  @ApiProperty({ example: "BKK-RIVERSIDE" })
  @IsString()
  @IsNotEmpty()
  branchCode!: string;
}

export class ConciergeAvailabilityQueryDto extends ConciergeHotelQueryDto {
  @ApiProperty({ example: "2026-11-01" })
  @Matches(BUSINESS_DATE)
  checkIn!: string;

  @ApiProperty({ example: "2026-11-03" })
  @Matches(BUSINESS_DATE)
  checkOut!: string;
}

/** A guest proves the booking is theirs with the booking number and their email or phone. */
export class ConciergeBookingDto {
  @ApiProperty({ example: "TS-261025-A0EAA" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  orderNumber!: string;

  @ApiProperty({
    example: "hiroshi@example.com",
    description: "The email or phone number on the booking",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contact!: string;
}

export enum GuestRequestCategory {
  HOUSEKEEPING = "HOUSEKEEPING",
  AMENITY = "AMENITY",
  MAINTENANCE = "MAINTENANCE",
  FOOD_AND_DRINK = "FOOD_AND_DRINK",
  TRANSPORT = "TRANSPORT",
  OTHER = "OTHER",
}

export class ConciergeRequestDto extends ConciergeBookingDto {
  @ApiProperty({ enum: GuestRequestCategory, example: "AMENITY" })
  @IsEnum(GuestRequestCategory)
  category!: GuestRequestCategory;

  @ApiProperty({ example: "Two extra towels please" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  details!: string;
}
