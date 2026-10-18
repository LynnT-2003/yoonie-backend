import { ApiProperty } from "@nestjs/swagger";

export class MessageResponseDto {
  @ApiProperty({
    description: "Human readable success message",
    example: "Request completed successfully",
  })
  message: string;
}
