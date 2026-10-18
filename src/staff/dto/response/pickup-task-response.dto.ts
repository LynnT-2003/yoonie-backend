import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DispatchStatus } from "../../../common/enums/dispatch.enum";

export class PickupTaskResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d7b" })
  dispatchId!: string;

  @ApiProperty({ enum: DispatchStatus, example: DispatchStatus.IN_PROGRESS })
  status!: DispatchStatus;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  driverUserId?: string;

  @ApiPropertyOptional({ example: "2026-10-20T14:35:00.000Z" })
  completedAt?: Date;
}
