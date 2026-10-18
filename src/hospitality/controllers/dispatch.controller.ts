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
import { DispatchService } from "../services/dispatch.service";
import { UpdateDispatchStatusDto } from "../dto/update-dispatch-status.dto";
import { DispatchStatus, DispatchType } from "../common/hospitality.enums";

@ApiTags("Hospitality - Operations & Dispatch")
@ApiBearerAuth("JWT-auth")
@Controller("hospitality/dispatch")
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Get daily operational dispatch run-sheet" })
  @ApiResponse({
    status: 200,
    description: "List of prioritized dispatch tasks",
  })
  async getDispatches(
    @Query("branchId") branchId: string,
    @Query("serviceDate") serviceDate: string,
    @Query("status") status?: DispatchStatus,
    @Query("type") type?: DispatchType,
  ) {
    return this.dispatchService.findByServiceDate(
      branchId,
      serviceDate,
      status,
      type,
    );
  }

  @Public()
  @Patch(":id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update dispatch task status (acknowledge, in progress, done)",
  })
  @ApiResponse({ status: 200, description: "Dispatch task updated" })
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDispatchStatusDto,
  ) {
    return this.dispatchService.updateStatus(
      new Types.ObjectId(id),
      dto.status,
      dto.assigneeUserId ? new Types.ObjectId(dto.assigneeUserId) : undefined,
    );
  }
}
