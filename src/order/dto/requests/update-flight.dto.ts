import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

export class UpdateFlightDto {
  @ApiProperty({ example: "TG 930" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9]{2}\s?\d{1,4}[A-Za-z]?$/, {
    message: "Flight number looks like TG 930",
  })
  number!: string;

  @ApiProperty({
    example: "2026-10-25T02:20:00.000Z",
    description: "Scheduled landing time",
  })
  @Type(() => Date)
  @IsDate()
  landingAt!: Date;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @Min(1)
  @IsOptional()
  meetingDoor?: number;
}
