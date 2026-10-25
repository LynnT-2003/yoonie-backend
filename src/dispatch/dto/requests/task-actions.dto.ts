import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class AssignTaskDto {
  @ApiPropertyOptional({
    example: "665a1b2c3d4e5f6a7b8c9d0e",
    nullable: true,
    description:
      "Staff member to own the task; null returns it to the open pool",
  })
  @ValidateIf((o: AssignTaskDto) => o.assigneeUserId !== null)
  @IsMongoId()
  assigneeUserId!: string | null;
}

export const TOUR_DECISIONS = ["KEEP", "MERGE", "CANCEL"] as const;

export class TourDecisionDto {
  @ApiProperty({ enum: TOUR_DECISIONS, example: "MERGE" })
  @IsIn(TOUR_DECISIONS)
  decision!: (typeof TOUR_DECISIONS)[number];

  @ApiPropertyOptional({ example: "Moved 4 guests to the 08:00 departure" })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  note?: string;
}

export const PICKUP_ISSUE_ANSWERS = ["KEEP_WAITING", "NO_SHOW"] as const;

export class ResolvePickupIssueDto {
  @ApiProperty({ enum: PICKUP_ISSUE_ANSWERS, example: "KEEP_WAITING" })
  @IsIn(PICKUP_ISSUE_ANSWERS)
  resolution!: (typeof PICKUP_ISSUE_ANSWERS)[number];

  @ApiPropertyOptional({ example: "Flight now lands 15:10, wait at door 4" })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  note?: string;
}
