import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CancelOrderLineDto {
  @ApiProperty({
    example: "Guest changed travel itinerary",
    description: "Audit reason for cancelling the order line",
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({
    example: 2200,
    default: 0,
    description: "Refund amount in THB to credit back to guest",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  refundThb?: number;
}
