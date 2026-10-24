import { ApiProperty } from "@nestjs/swagger";
import { IsMongoId, IsNotEmpty, IsString, Matches } from "class-validator";
import { BUSINESS_DATE } from "../../../common/helpers/regex.helper";

export class CheckAvailabilityQueryDto {
  @ApiProperty({
    example: "665a1b2c3d4e5f6a7b8c9d0e1",
    description: "Branch ObjectId",
  })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({
    example: "STANDARD_KING",
    description:
      "Room type code (e.g. STANDARD_KING, DELUXE_BALCONY, POOL_VILLA)",
  })
  @IsString()
  @IsNotEmpty()
  roomType!: string;

  @ApiProperty({
    example: "2026-10-20",
    description: "Check-in date (YYYY-MM-DD)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(BUSINESS_DATE)
  checkIn!: string;

  @ApiProperty({
    example: "2026-10-23",
    description: "Check-out date (YYYY-MM-DD)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(BUSINESS_DATE)
  checkOut!: string;
}
