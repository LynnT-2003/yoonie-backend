import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DispatchStatus } from "../../../common/enums/dispatch.enum";
import { PickupStage } from "../../../common/enums/pickup.enum";

export class PickupTaskResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d7b" })
  dispatchId!: string;

  @ApiProperty({ enum: DispatchStatus, example: DispatchStatus.IN_PROGRESS })
  status!: DispatchStatus;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  driverUserId?: string;

  @ApiPropertyOptional({ example: "2026-10-20T14:35:00.000Z" })
  completedAt?: Date;

  @ApiPropertyOptional({ enum: PickupStage, example: PickupStage.EN_ROUTE })
  stage?: PickupStage;

  @ApiPropertyOptional({
    type: [String],
    example: ["Anan Boonmee"],
    description: "People notified about this step",
  })
  notified?: string[];
}
