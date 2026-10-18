import { ApiProperty } from "@nestjs/swagger";
import { RoomResponseDto } from "./room-response.dto";

export class HousekeepingBoardResponseDto {
  @ApiProperty({
    type: [RoomResponseDto],
    description: "Rooms ready and inspected for incoming check-in guests",
  })
  inspected!: RoomResponseDto[];

  @ApiProperty({
    type: [RoomResponseDto],
    description: "Rooms cleaned by housekeeping awaiting inspection",
  })
  clean!: RoomResponseDto[];

  @ApiProperty({
    type: [RoomResponseDto],
    description: "Rooms currently being cleaned by housekeeping staff",
  })
  inProgress!: RoomResponseDto[];

  @ApiProperty({
    type: [RoomResponseDto],
    description: "Dirty turnover rooms requiring cleaning",
  })
  dirty!: RoomResponseDto[];
}
