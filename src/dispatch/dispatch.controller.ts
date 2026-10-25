import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import {
  AssignTaskDto,
  TourDecisionDto,
  ResolvePickupIssueDto,
} from "./dto/requests/task-actions.dto";
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
    return this.dispatchService.listTasks(
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
    summary: "Move a pickup or tour task (OPEN, IN_PROGRESS, DONE, DISMISSED)",
    description:
      "Room turnarounds are rejected with 409: they follow the room via POST /staff/rooms/:id/transition. ACKNOWLEDGED is retired.",
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

  @Roles(
    UserRole.ADMIN,
    UserRole.BRANCH_MGR,
    UserRole.DISPATCHER,
    UserRole.STAFF,
  )
  @UseInterceptors(IdempotencyInterceptor)
  @Post(":id/claim")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Take an unassigned task from the open pool" })
  async claim(@CurrentUser() user: ICurrentUser, @Param("id") id: string) {
    return this.dispatchService.claim(user, id);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR, UserRole.DISPATCHER)
  @Patch(":id/assign")
  @ApiOperation({
    summary:
      "Assign a task to a staff member (or null to return it to the pool); notifies them",
  })
  async assign(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.dispatchService.assign(user, id, dto.assigneeUserId ?? null);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR, UserRole.DISPATCHER)
  @Post(":id/pickup-issue")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Answer a driver's problem report: keep waiting, or close the pickup as a no-show",
  })
  async resolvePickupIssue(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: ResolvePickupIssueDto,
  ) {
    return this.dispatchService.resolvePickupIssue(user, id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR, UserRole.DISPATCHER)
  @Post(":id/decision")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Close a tour fill flag with a decision: keep running, merge or cancel the departure",
  })
  async decide(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: TourDecisionDto,
  ) {
    return this.dispatchService.decideTour(user, id, dto);
  }
}
