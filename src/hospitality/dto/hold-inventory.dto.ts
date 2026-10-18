import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
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
  })
  @IsString()
  @IsNotEmpty()
  slotKey!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class CreateHoldDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e1" })
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @ApiProperty({ example: "cart_abc123" })
  @IsString()
  @IsNotEmpty()
  cartId!: string;

  @ApiProperty({ type: [HoldItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HoldItemDto)
  lines!: HoldItemDto[];

  @ApiProperty({ example: 15, default: 15, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMinutes?: number;
}
