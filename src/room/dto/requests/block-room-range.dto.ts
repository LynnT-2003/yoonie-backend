import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";
import { BUSINESS_DATE } from "../../../common/helpers/regex.helper";

export class BlockRoomRangeDto {
  @ApiProperty({
    example: "2026-10-25",
    description: "Inclusive start business date (YYYY-MM-DD)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(BUSINESS_DATE)
  from!: string;

  @ApiProperty({
    example: "2026-10-28",
    description: "Exclusive end business date (YYYY-MM-DD)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(BUSINESS_DATE)
  to!: string;

  @ApiProperty({
    example: "MAINTENANCE",
    description:
      "Reason for blocking (e.g. MAINTENANCE, OWNER_HOLD, RENOVATION)",
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
