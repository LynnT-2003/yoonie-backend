import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional } from "class-validator";
import { ServiceCategory } from "../../../common/enums/service.enum";

export class QueryServiceDto {
  @ApiProperty({
    example: "665a1b2c3d4e5f6a7b8c9d0e",
    description: "Branch ObjectId to query services for",
  })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiPropertyOptional({
    enum: ServiceCategory,
    example: ServiceCategory.WELLNESS,
    description: "Filter by service category",
  })
  @IsEnum(ServiceCategory)
  @IsOptional()
  category?: ServiceCategory;
}
