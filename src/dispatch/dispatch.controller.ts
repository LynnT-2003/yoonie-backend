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
import { DispatchService } from "./dispatch.service";
import { UpdateDispatchStatusDto } from "./dto/requests/update-dispatch-status.dto";
import { QueryDispatchDto } from "./dto/requests/query-dispatch.dto";
import { DispatchTaskResponseDto } from "./dto/responses/dispatch-task-response.dto";

@ApiTags("Operations & Dispatch")
@ApiBearerAuth("JWT-auth")
@Controller("dispatch")
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Get daily operational dispatch run-sheet" })
  @ApiResponse({
    status: 200,
    description: "List of prioritized dispatch tasks",
    type: [DispatchTaskResponseDto],
  })
  async getDispatches(@Query() query: QueryDispatchDto) {
    return this.dispatchService.findByServiceDate(
      query.branchId,
      query.serviceDate,
      query.status,
      query.type,
    );
  }

  @Public()
  @Patch(":id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update dispatch task status (acknowledge, in progress, done)",
  })
  @ApiResponse({
    status: 200,
    description: "Dispatch task updated",
    type: DispatchTaskResponseDto,
  })
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDispatchStatusDto,
  ) {
    return this.dispatchService.updateStatus(
      id,
      dto.status,
      dto.assigneeUserId,
    );
  }
}
