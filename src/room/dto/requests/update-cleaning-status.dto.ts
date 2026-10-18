import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty } from "class-validator";
import { CleaningStatus } from "../../../common/enums/cleaning-status.enum";

export class UpdateCleaningStatusDto {
  @ApiProperty({
    enum: CleaningStatus,
    example: CleaningStatus.CLEAN,
    description: "New cleaning status for the room key",
  })
  @IsEnum(CleaningStatus)
  @IsNotEmpty()
  cleaningStatus!: CleaningStatus;
}
