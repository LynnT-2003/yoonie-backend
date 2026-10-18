import { ApiProperty } from "@nestjs/swagger";

export class TickResponseDto {
  @ApiProperty({
    example: 5,
    description: "Number of notifications processed in this tick",
  })
  processedCount!: number;

  @ApiProperty({ example: 2, description: "Number of Expo receipts verified" })
  receiptsChecked!: number;

  @ApiProperty({
    example: 0,
    description: "Number of unacknowledged critical notifications escalated",
  })
  escalatedCount!: number;
}
