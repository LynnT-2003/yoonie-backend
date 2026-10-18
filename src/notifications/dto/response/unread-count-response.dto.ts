import { ApiProperty } from "@nestjs/swagger";

export class UnreadCountResponseDto {
  @ApiProperty({ example: 3, description: "Total unread notifications" })
  unreadCount!: number;

  @ApiProperty({
    example: 1,
    description: "Total unacknowledged critical alerts requiring staff action",
  })
  unackedCriticalCount!: number;
}
