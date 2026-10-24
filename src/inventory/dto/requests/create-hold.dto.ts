import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class HoldItemDto {
  @ApiProperty({
    example:
      "665a1b2c3d4e5f6a7b8c9d0e1:ROOM_NIGHT:STANDARD_KING:2026-10-20T00:00:00.000Z",
    description: "Target slot key to atomically hold",
  })
  @IsString()
  @IsNotEmpty()
  slotKey!: string;

  @ApiProperty({
    example: 1,
    minimum: 1,
    description: "Quantity of slots to hold",
  })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class CreateHoldDto {
  @ApiProperty({
    example: "665a1b2c3d4e5f6a7b8c9d0e1",
    description: "Branch ObjectId",
  })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({
    example: "cart_abc123",
    description: "Unique checkout cart session ID",
  })
  @IsString()
  @IsNotEmpty()
  cartId!: string;

  @ApiProperty({
    type: [HoldItemDto],
    description: "List of slot keys and quantities to hold",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HoldItemDto)
  lines!: HoldItemDto[];

  @ApiPropertyOptional({
    example: 15,
    default: 15,
    description: "Hold TTL in minutes before automatic expiration",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMinutes?: number;
}
