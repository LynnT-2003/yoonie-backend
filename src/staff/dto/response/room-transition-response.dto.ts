import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CleaningStatus } from "../../../common/enums/cleaning-status.enum";
import { DispatchStatus } from "../../../common/enums/dispatch.enum";

export class RoomTransitionResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d1a" })
  roomId!: string;

  @ApiProperty({ example: "101" })
  roomNumber!: string;

  @ApiProperty({ enum: CleaningStatus, example: CleaningStatus.IN_PROGRESS })
  cleaningStatus!: CleaningStatus;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d7a" })
  dispatchId?: string;

  @ApiPropertyOptional({
    enum: DispatchStatus,
    example: DispatchStatus.IN_PROGRESS,
  })
  dispatchStatus?: DispatchStatus;

  @ApiProperty({
    example: false,
    description: "True if state was already matched and operation was a no-op",
  })
  isNoOp!: boolean;

  @ApiPropertyOptional({
    example: "Noi",
    description: "Who now holds the room's job",
  })
  assigneeName?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["Somchai"],
    description: "People notified about this change (push/LINE + inbox)",
  })
  notified?: string[];
}
