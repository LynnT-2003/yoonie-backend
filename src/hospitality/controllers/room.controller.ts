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
import { Types } from "mongoose";
import { Public } from "../../common/decorators/public.decorator";
import { RoomService } from "../services/room.service";
import { UpdateCleaningStatusDto } from "../dto/update-cleaning-status.dto";

@ApiTags("Hospitality - Rooms & Housekeeping")
@ApiBearerAuth("JWT-auth")
@Controller("hospitality/rooms")
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "List all physical rooms for a branch" })
  @ApiResponse({ status: 200, description: "List of rooms" })
  async getRooms(@Query("branchId") branchId: string) {
    return this.roomService.findAllByBranch(branchId);
  }

  @Public()
  @Get("housekeeping")
  @ApiOperation({
    summary: "Get current housekeeping board (dirty, inspected, in-progress)",
  })
  @ApiResponse({ status: 200, description: "Housekeeping board" })
  async getHousekeepingBoard(@Query("branchId") branchId: string) {
    return this.roomService.getHousekeepingBoard(branchId);
  }

  @Public()
  @Patch(":id/cleaning")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update room housekeeping cleaning status" })
  @ApiResponse({ status: 200, description: "Cleaning status updated" })
  async updateCleaning(
    @Param("id") id: string,
    @Body() dto: UpdateCleaningStatusDto,
  ) {
    return this.roomService.updateCleaningStatus(
      new Types.ObjectId(id),
      dto.cleaningStatus,
    );
  }
}
