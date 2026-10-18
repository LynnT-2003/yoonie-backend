import { ApiProperty } from "@nestjs/swagger";

export class PresignedUrlResponseDto {
  @ApiProperty({
    example: "https://<account_id>.r2.cloudflarestorage.com/yoonie-media/rooms/uuid.jpg?X-Amz-Algorithm=...",
    description: "Presigned PUT URL for direct browser/client upload to Cloudflare R2",
  })
  uploadUrl!: string;

  @ApiProperty({
    example: "rooms/1729267200000-a1b2c3d4.jpg",
    description: "R2 object storage key",
  })
  key!: string;

  @ApiProperty({
    example: "https://images.yoonie.si/rooms/1729267200000-a1b2c3d4.jpg",
    description: "Public CDN URL of the image once uploaded",
  })
  publicUrl!: string;

  @ApiProperty({
    example: 900,
    description: "Presigned URL expiration time in seconds (default: 15 minutes)",
  })
  expiresInSeconds!: number;
}
