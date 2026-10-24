import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AvailabilityResponseDto {
  @ApiProperty({
    example: 18,
    description: "Number of units available across the requested range",
  })
  available!: number;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0e1" })
  branchId?: string;

  @ApiPropertyOptional({ example: "STANDARD_KING" })
  roomType?: string;

  @ApiPropertyOptional({ example: "2026-10-20" })
  checkIn?: string;

  @ApiPropertyOptional({ example: "2026-10-23" })
  checkOut?: string;
}
