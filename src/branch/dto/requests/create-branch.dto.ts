import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsArray, IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

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

  @ApiProperty({
    example: "https://images.yoonie.si/branches/riverside-logo.webp",
    required: false,
    description: "Branch logo URL (if not uploading binary file)",
  })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({
    example: "https://images.yoonie.si/branches/riverside-hero.webp",
    required: false,
    description: "Branch hero banner image URL (if not uploading binary file)",
  })
  @IsString()
  @IsOptional()
  heroImageUrl?: string;

  @ApiProperty({
    example: [
      "https://images.yoonie.si/branches/riverside-1.webp",
      "https://images.yoonie.si/branches/riverside-2.webp",
    ],
    required: false,
    type: [String],
    description: "Gallery image URLs (if not uploading binary files)",
  })
  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return value.split(",").map((s) => s.trim());
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[] = [];
}
