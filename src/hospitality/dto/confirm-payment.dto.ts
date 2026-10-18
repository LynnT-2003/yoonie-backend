import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class ConfirmPaymentDto {
  @ApiProperty({ example: "ch_3Lkd2kL4k2j", required: false })
  @IsOptional()
  @IsString()
  paymentRef?: string;

  @ApiProperty({ example: 4400, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paidThb?: number;
}
