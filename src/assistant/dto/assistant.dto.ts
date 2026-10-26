import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";
import { BUSINESS_DATE } from "../../common/helpers/regex.helper";

export const ASSISTANT_PAGES = [
  "rooms",
  "guests",
  "services",
  "dispatch",
  "property",
  "other",
] as const;
export type AssistantPage = (typeof ASSISTANT_PAGES)[number];

/** Where the staff member is when they ask, so Yoonie answers about that. */
export class AssistantContextDto {
  @ApiProperty({ enum: ASSISTANT_PAGES, example: "rooms" })
  @IsIn(ASSISTANT_PAGES)
  page!: AssistantPage;

  @ApiPropertyOptional({
    example: "305",
    description: "Room open in the room sheet",
  })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  roomNumber?: string;

  @ApiPropertyOptional({
    example: "2026-10-25",
    description: "Date the page is showing",
  })
  @IsOptional()
  @Matches(BUSINESS_DATE)
  date?: string;
}

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

  @ApiPropertyOptional({ type: AssistantContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantContextDto)
  context?: AssistantContextDto;
}
