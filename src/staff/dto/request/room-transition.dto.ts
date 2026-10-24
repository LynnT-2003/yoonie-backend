import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { CleaningStatus } from "../../../common/enums/cleaning-status.enum";

export class RoomTransitionDto {
  @ApiProperty({
    enum: CleaningStatus,
    description: "Target cleaning status for the room",
    example: CleaningStatus.IN_PROGRESS,
  })
  @IsEnum(CleaningStatus)
  @IsNotEmpty()
  toStatus!: CleaningStatus;

  @ApiPropertyOptional({
    description:
      "Reason for transition (mandatory when failing inspection back to DIRTY)",
    example: "Bathroom sink has persistent stains requiring maintenance",
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
