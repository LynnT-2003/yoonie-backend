import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class GetPresignedUrlDto {
  @ApiProperty({
    example: "deluxe-balcony-view.jpg",
    description: "Original filename or desired filename with extension",
  })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty({
    example: "image/jpeg",
    description:
      "MIME type of the file (e.g. image/jpeg, image/png, image/webp)",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^image\/(jpeg|png|webp|avif|gif|svg\+xml)$/, {
    message:
      "contentType must be a supported image MIME type (jpeg, png, webp, avif, gif, svg+xml)",
  })
  contentType!: string;

  @ApiPropertyOptional({
    example: "rooms",
    description:
      "Destination folder/prefix in R2 bucket (e.g. rooms, restaurants, services, avatars)",
    default: "uploads",
  })
  @IsString()
  @IsOptional()
  folder?: string = "uploads";
}
