import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty } from "class-validator";
import { CleaningStatus } from "../../common/enums/cleaning-status.enum";

export class UpdateCleaningStatusDto {
  @ApiProperty({ enum: CleaningStatus, example: CleaningStatus.CLEAN })
  @IsEnum(CleaningStatus)
  @IsNotEmpty()
  cleaningStatus!: CleaningStatus;
}
