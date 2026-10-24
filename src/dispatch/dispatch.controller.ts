import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { resolveScopedBranchIds } from "../common/helpers/branch-access.helper";
import { DispatchService } from "./dispatch.service";
import { UpdateDispatchStatusDto } from "./dto/requests/update-dispatch-status.dto";
import { QueryDispatchDto } from "./dto/requests/query-dispatch.dto";
import { DispatchTaskResponseDto } from "./dto/responses/dispatch-task-response.dto";
import { IdempotencyInterceptor } from "../staff/interceptors/idempotency.interceptor";

@ApiTags("Operations & Dispatch")
@ApiBearerAuth("JWT-auth")
@Controller("dispatch")
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR, UserRole.DISPATCHER)
  @Get()
  @ApiOperation({
    summary: "Get daily operational dispatch run-sheet (branch-scoped)",
  })
  @ApiResponse({
    status: 200,
    description: "List of prioritized dispatch tasks",
    type: [DispatchTaskResponseDto],
  })
  async getDispatches(
    @CurrentUser() user: ICurrentUser,
    @Query() query: QueryDispatchDto,
  ) {
    const scopedBranchIds = resolveScopedBranchIds(user, query.branchId);
    return this.dispatchService.findByServiceDate(
      scopedBranchIds,
      query.serviceDate,
      query.status,
      query.type,
    );
  }

  @Roles(
    UserRole.ADMIN,
    UserRole.BRANCH_MGR,
    UserRole.DISPATCHER,
    UserRole.STAFF,
  )
  @UseInterceptors(IdempotencyInterceptor)
  @Patch(":id/status")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Unique idempotency key for offline replay protection",
    required: false,
  })
  @ApiOperation({
    summary: "Update dispatch task status (acknowledge, in progress, done)",
  })
  @ApiResponse({
    status: 200,
    description: "Dispatch task updated",
    type: DispatchTaskResponseDto,
  })
  async updateStatus(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: UpdateDispatchStatusDto,
  ) {
    return this.dispatchService.updateStatus(
      user,
      id,
      dto.status,
      dto.assigneeUserId,
    );
  }
}
