import { ApiProperty } from "@nestjs/swagger";

export class BranchSettingsResponseDto {
  @ApiProperty({ example: "14:00" })
  checkInTime!: string;

  @ApiProperty({ example: "12:00" })
  checkOutTime!: string;

  @ApiProperty({ example: 0.07 })
  vatRate!: number;

  @ApiProperty({ example: 0.1 })
  serviceChargeRate!: number;

  @ApiProperty({ example: 15 })
  holdTtlMinutes!: number;

  @ApiProperty({ example: 0.4 })
  consolidationThreshold!: number;

  @ApiProperty({ example: "05:30" })
  dispatchGenerationTime!: string;
}

export class BranchResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e" })
  _id!: string;

  @ApiProperty({ example: "BKK-RIVERSIDE" })
  code!: string;

  @ApiProperty({ example: "BKK Riverside Boutique Hotel" })
  name!: string;

  @ApiProperty({ example: "Asia/Bangkok" })
  timezone!: string;

  @ApiProperty({ example: "THB" })
  currency!: string;

  @ApiProperty({
    example: "https://images.yoonie.si/branches/riverside-logo.webp",
    required: false,
  })
  logoUrl?: string;

  @ApiProperty({
    example: "https://images.yoonie.si/branches/riverside-hero.webp",
    required: false,
  })
  heroImageUrl?: string;

  @ApiProperty({
    example: [
      "https://images.yoonie.si/branches/riverside-pool.webp",
      "https://images.yoonie.si/branches/riverside-lobby.webp",
    ],
    type: [String],
  })
  images!: string[];

  @ApiProperty({ type: BranchSettingsResponseDto })
  settings!: BranchSettingsResponseDto;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  updatedAt!: Date;
}
