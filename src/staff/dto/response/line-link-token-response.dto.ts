import { ApiProperty } from "@nestjs/swagger";

export class LineLinkTokenResponseDto {
  @ApiProperty({
    example: "A8B3C9",
    description:
      "One-time 6-character code to send to the Yoonie LINE Official Account",
  })
  code!: string;

  @ApiProperty({
    example: "2026-10-18T20:30:00.000Z",
    description: "Expiration time (10 minutes)",
  })
  expiresAt!: Date;

  @ApiProperty({
    example:
      "Send this 6-character code to Yoonie Official LINE Account to link notifications",
  })
  instructions!: string;
}
