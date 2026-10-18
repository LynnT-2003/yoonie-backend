import { ApiProperty } from "@nestjs/swagger";

export class ReleaseHoldResponseDto {
  @ApiProperty({
    example: true,
    description: "Whether the hold was successfully released",
  })
  released!: boolean;
}
