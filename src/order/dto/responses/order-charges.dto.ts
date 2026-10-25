import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ChargeLineDto {
  @ApiProperty()
  lineId!: string;

  @ApiProperty({ enum: ["STAY", "SERVICE", "DINING"] })
  kind!: string;

  @ApiProperty({ example: "Deluxe Balcony" })
  label!: string;

  @ApiProperty({ example: "2 nights × ฿3,800" })
  detail!: string;

  @ApiProperty({ example: 7600, description: "Before service charge and VAT" })
  amountThb!: number;

  @ApiPropertyOptional({ example: "CANCELLED" })
  status?: string;
}

export class PaymentEntryDto {
  @ApiProperty({ example: 5000 })
  amountThb!: number;

  @ApiProperty({ enum: ["CASH", "CARD", "PROMPTPAY", "BANK_TRANSFER"] })
  method!: string;

  @ApiPropertyOptional()
  reference?: string;

  @ApiProperty()
  receivedAt!: Date;

  @ApiPropertyOptional()
  receivedByName?: string;
}

/** Folio view of an order: what each line costs and how the total is built. */
export class OrderChargesDto {
  @ApiProperty({ type: [ChargeLineDto] })
  lines!: ChargeLineDto[];

  @ApiProperty({ example: 4400 })
  roomsThb!: number;

  @ApiProperty({ example: 4800 })
  servicesThb!: number;

  @ApiProperty({ example: 0 })
  diningThb!: number;

  @ApiProperty()
  subtotalThb!: number;

  @ApiProperty()
  discountThb!: number;

  @ApiProperty({ example: 0.1 })
  serviceChargeRate!: number;

  @ApiProperty()
  serviceChargeThb!: number;

  @ApiProperty({ example: 0.07 })
  vatRate!: number;

  @ApiProperty()
  vatThb!: number;

  @ApiProperty()
  totalThb!: number;

  @ApiProperty()
  paidThb!: number;

  @ApiProperty()
  dueThb!: number;

  @ApiProperty({ example: "PAY_AT_HOTEL" })
  paymentMethod!: string;

  @ApiProperty({ example: "UNPAID" })
  paymentStatus!: string;

  @ApiProperty({
    type: [PaymentEntryDto],
    description: "Payments collected, oldest first",
  })
  payments!: PaymentEntryDto[];
}
