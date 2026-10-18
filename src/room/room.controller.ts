import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { RoomService } from "./room.service";
import { UpdateCleaningStatusDto } from "./dto/requests/update-cleaning-status.dto";
import { RoomResponseDto } from "./dto/responses/room-response.dto";
import { HousekeepingBoardResponseDto } from "./dto/responses/housekeeping-board-response.dto";

@ApiTags("Rooms & Housekeeping")
@ApiBearerAuth("JWT-auth")
@Controller("rooms")
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "List all physical room keys for a branch" })
  @ApiResponse({
    status: 200,
    description: "List of rooms",
    type: [RoomResponseDto],
  })
  async getRooms(@Query("branchId") branchId: string) {
    return this.roomService.findAllByBranch(branchId);
  }

  @Public()
  @Get("housekeeping")
  @ApiOperation({
    summary: "Get current housekeeping board (dirty, inspected, in-progress)",
  })
  @ApiResponse({
    status: 200,
    description: "Housekeeping board",
    type: HousekeepingBoardResponseDto,
  })
  async getHousekeepingBoard(@Query("branchId") branchId: string) {
    return this.roomService.getHousekeepingBoard(branchId);
  }

  @Public()
  @Patch(":id/cleaning")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update room housekeeping cleaning status" })
  @ApiResponse({
    status: 200,
    description: "Cleaning status updated",
    type: RoomResponseDto,
  })
  async updateCleaning(
    @Param("id") id: string,
    @Body() dto: UpdateCleaningStatusDto,
  ) {
    return this.roomService.updateCleaningStatus(id, dto.cleaningStatus);
  }
}
