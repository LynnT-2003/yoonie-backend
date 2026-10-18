import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { HoldStatus } from "../../../common/enums/inventory.enum";

export class HoldLineResponseDto {
  @ApiProperty({
    example:
      "665a1b2c3d4e5f6a7b8c9d0e1:ROOM_NIGHT:STANDARD_KING:2026-10-20T00:00:00.000Z",
  })
  slotKey!: string;

  @ApiProperty({ example: 1 })
  qty!: number;
}

export class InventoryHoldResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d5e" })
  _id!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e1" })
  branchId!: string;

  @ApiProperty({ example: "cart_abc123" })
  cartId!: string;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d6f" })
  orderId?: string;

  @ApiProperty({ type: [HoldLineResponseDto] })
  lines!: HoldLineResponseDto[];

  @ApiProperty({ enum: HoldStatus, example: HoldStatus.ACTIVE })
  status!: HoldStatus;

  @ApiProperty({ example: "2026-10-18T14:45:00.000Z" })
  expiresAt!: Date;

  @ApiPropertyOptional({ example: "2026-10-18T15:00:00.000Z" })
  purgeAt?: Date;

  @ApiPropertyOptional({ example: "ht_665a1b2c3d4e5f6a7b8c9d5e_xyz" })
  holdToken?: string;

  @ApiProperty({ example: "2026-10-18T14:30:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-10-18T14:30:00.000Z" })
  updatedAt!: Date;
}
