import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { DispatchStatus } from "../common/hospitality.enums";

export class UpdateDispatchStatusDto {
  @ApiProperty({ enum: DispatchStatus, example: DispatchStatus.IN_PROGRESS })
  @IsEnum(DispatchStatus)
  @IsNotEmpty()
  status!: DispatchStatus;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e1", required: false })
  @IsOptional()
  @IsString()
  assigneeUserId?: string;
}
