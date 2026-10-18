import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class ConfirmPaymentDto {
  @ApiPropertyOptional({
    example: "ch_3Lkd2kL4k2j",
    description: "External payment gateway charge/transaction ID",
  })
  @IsOptional()
  @IsString()
  paymentRef?: string;

  @ApiPropertyOptional({
    example: 4400,
    description: "Paid amount in Thai Baht",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paidThb?: number;
}
