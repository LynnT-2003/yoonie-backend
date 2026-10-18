import { ApiProperty } from "@nestjs/swagger";
import { IsMongoId, IsNotEmpty } from "class-validator";

export class QueryRestaurantDto {
  @ApiProperty({
    example: "665a1b2c3d4e5f6a7b8c9d0e",
    description: "Branch ObjectId to query restaurants for",
  })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;
}
