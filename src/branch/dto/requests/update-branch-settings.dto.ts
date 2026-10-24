import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class UpdateBranchSettingsDto {
  @ApiProperty({ example: "14:00", required: false })
  @IsString()
  @IsOptional()
  checkInTime?: string;

  @ApiProperty({ example: "12:00", required: false })
  @IsString()
  @IsOptional()
  checkOutTime?: string;

  @ApiProperty({ example: 0.07, required: false })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  vatRate?: number;

  @ApiProperty({ example: 0.1, required: false })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  serviceChargeRate?: number;

  @ApiProperty({
    example: 15,
    required: false,
    description: "Hold TTL in minutes",
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  holdTtlMinutes?: number;

  @ApiProperty({
    example: 0.4,
    required: false,
    description: "Consolidation threshold (0-1)",
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  consolidationThreshold?: number;
}
