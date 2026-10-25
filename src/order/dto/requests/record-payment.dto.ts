import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { PAYMENT_METHODS, type PaymentMethod } from "../../entity/order.entity";

export class RecordPaymentDto {
  @ApiProperty({
    example: 19067,
    description: "Amount collected, at most the balance due",
  })
  @IsNumber()
  @Min(1)
  amountThb!: number;

  @ApiProperty({ enum: PAYMENT_METHODS, example: "CARD" })
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;

  @ApiPropertyOptional({
    example: "Card slip 004512",
    description: "Receipt, slip or transfer reference",
  })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  reference?: string;
}
