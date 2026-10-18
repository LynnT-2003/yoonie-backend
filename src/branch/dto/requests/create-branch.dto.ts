import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class CreateBranchDto {
  @ApiProperty({
    example: "BKK-RIVERSIDE",
    description: "Unique property code (3-32 chars)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9-]{3,32}$/)
  code!: string;

  @ApiProperty({
    example: "BKK Riverside Boutique Hotel",
    description: "Property name",
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: "Asia/Bangkok",
    default: "Asia/Bangkok",
    description: "IANA timezone",
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({
    example: "THB",
    default: "THB",
    description: "3-letter currency code",
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ example: "+6620001234", required: false })
  @IsString()
  @IsOptional()
  contactPhoneE164?: string;

  @ApiProperty({ example: "stay@riverside-bkk.example", required: false })
  @IsString()
  @IsOptional()
  contactEmail?: string;
}
