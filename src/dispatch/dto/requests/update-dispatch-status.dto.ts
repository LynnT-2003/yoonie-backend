import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional } from "class-validator";
import { DispatchStatus } from "../../../common/enums/dispatch.enum";

export class UpdateDispatchStatusDto {
  @ApiProperty({
    enum: DispatchStatus,
    example: DispatchStatus.IN_PROGRESS,
    description: "New status for the operational dispatch task",
  })
  @IsEnum(DispatchStatus)
  @IsNotEmpty()
  status!: DispatchStatus;

  @ApiPropertyOptional({
    example: "665a1b2c3d4e5f6a7b8c9d0e1",
    description: "Assigned staff member user ObjectId",
  })
  @IsMongoId()
  @IsOptional()
  assigneeUserId?: string;
}
