import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class AssistantMessageDto {
  @ApiProperty({
    example: "g_2f9c1d7e4a",
    description: "Keeps one conversation together; the client picks it",
  })
  @IsString()
  @Length(8, 64)
  sessionId!: string;

  @ApiProperty({ example: "What rooms do you have?" })
  @IsString()
  @Length(1, 1000)
  message!: string;
}
