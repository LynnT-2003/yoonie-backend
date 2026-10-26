import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

export class OnboardBranchDto {
  @ApiProperty({
    example: "Lynn Stays",
    description: "Property name",
  })
  @IsString()
  @IsNotEmpty()
  hotelName!: string;

  @ApiProperty({
    example: "lynn-stays",
    description: "Subdomain slug and branch code (3-32 alphanumeric/hyphen characters)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9-]{3,32}$/, {
    message: "Slug must be 3-32 alphanumeric characters or hyphens",
  })
  slug!: string;

  @ApiPropertyOptional({ example: "Bangkok" })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: "TH" })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({
    example: "Asia/Bangkok",
    default: "Asia/Bangkok",
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    example: "THB",
    default: "THB",
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: "+66812345678" })
  @IsString()
  @IsOptional()
  contactPhoneE164?: string;

  @ApiPropertyOptional({ example: "stay@lynn-stays.com" })
  @IsString()
  @IsOptional()
  contactEmail?: string;

  @ApiPropertyOptional({
    example: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200",
  })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({
    example: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1600",
  })
  @IsString()
  @IsOptional()
  heroImageUrl?: string;

  // ─── Owner Credentials ────────────────────────────────────────────────────────

  @ApiProperty({
    example: "Lynn",
    description: "Full name of the property owner / initial admin",
  })
  @IsString()
  @IsNotEmpty()
  ownerName!: string;

  @ApiProperty({
    example: "owner@lynn-stays.com",
    description: "Work email for owner sign-in",
  })
  @IsEmail({}, { message: "Invalid email format for owner email" })
  @IsNotEmpty()
  ownerEmail!: string;

  @ApiProperty({
    example: "Password123!",
    description: "Secure password for owner sign-in (min 8 characters)",
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: "Password must be at least 8 characters long" })
  ownerPassword!: string;
}
