import { ApiProperty } from "@nestjs/swagger";

export class UploadFileResponseDto {
  @ApiProperty({
    example: "rooms/1729267200000-a1b2c3d4.jpg",
    description: "R2 object storage key",
  })
  key!: string;

  @ApiProperty({
    example: "https://images.yoonie.si/rooms/1729267200000-a1b2c3d4.jpg",
    description: "Public CDN URL of the uploaded image",
  })
  url!: string;

  @ApiProperty({
    example: "image/jpeg",
    description: "MIME type of the uploaded file",
  })
  contentType!: string;

  @ApiProperty({
    example: 1048576,
    description: "File size in bytes",
  })
  sizeBytes!: number;
}
