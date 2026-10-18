import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import {
  DispatchStatus,
  DispatchType,
} from "../../../common/enums/dispatch.enum";
import { BUSINESS_DATE } from "../../../common/helpers/regex.helper";

export class QueryDispatchDto {
  @ApiPropertyOptional({
    example: "665a1b2c3d4e5f6a7b8c9d0e1",
    description: "Branch ObjectId to query dispatches for",
  })
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @ApiProperty({
    example: "2026-10-20",
    description: "Business service date (YYYY-MM-DD)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(BUSINESS_DATE)
  serviceDate!: string;

  @ApiPropertyOptional({
    enum: DispatchStatus,
    example: DispatchStatus.OPEN,
    description: "Filter by task status",
  })
  @IsEnum(DispatchStatus)
  @IsOptional()
  status?: DispatchStatus;

  @ApiPropertyOptional({
    enum: DispatchType,
    example: DispatchType.AIRPORT_PICKUP,
    description: "Filter by operational dispatch category",
  })
  @IsEnum(DispatchType)
  @IsOptional()
  type?: DispatchType;
}
