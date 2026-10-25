import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";

import { StaffService } from "./staff.service";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { resolveScopedBranchIds } from "../common/helpers/branch-access.helper";
import {
  ApiErrorResponse,
  ApiSuccessResponse,
} from "../common/helpers/swagger.helper";
import { IdempotencyInterceptor } from "./interceptors/idempotency.interceptor";
import { RoomTransitionDto } from "./dto/request/room-transition.dto";
import { StaffTasksResponseDto } from "./dto/response/staff-task.dto";
import { RoomTransitionResponseDto } from "./dto/response/room-transition-response.dto";
import { PickupTaskResponseDto } from "./dto/response/pickup-task-response.dto";
import { PickupIssueDto, PickupStepDto } from "./dto/request/pickup-step.dto";
import { LineLinkTokenResponseDto } from "./dto/response/line-link-token-response.dto";

@ApiTags("Staff Operations")
@ApiBearerAuth("JWT-auth")
@ApiExtraModels(
  StaffTasksResponseDto,
  RoomTransitionResponseDto,
  PickupTaskResponseDto,
  LineLinkTokenResponseDto,
)
@Controller("staff")
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR, UserRole.DISPATCHER)
  @Get("roster")
  @ApiOperation({ summary: "Active staff on a branch, for assigning tasks" })
  async roster(
    @CurrentUser() user: ICurrentUser,
    @Query("branchId") branchId?: string,
  ) {
    const [id] = resolveScopedBranchIds(user, branchId);
    if (!id) throw new BadRequestException("branchId is required");
    return this.staffService.roster(id);
  }

  @Get("me/tasks")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: "Get tasks assigned to currently authenticated staff member",
  })
  @ApiResponse(ApiSuccessResponse(StaffTasksResponseDto))
  @ApiResponse(ApiErrorResponse(401, "Unauthorized"))
  @ApiResponse(ApiErrorResponse(403, "Forbidden"))
  async getMyTasks(
    @CurrentUser() user: ICurrentUser,
  ): Promise<StaffTasksResponseDto> {
    return this.staffService.getTasks(user);
  }

  @Post("rooms/:id/transition")
  @Roles(UserRole.STAFF, UserRole.BRANCH_MGR, UserRole.ADMIN)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Unique idempotency key for offline replay protection",
    required: false,
  })
  @ApiOperation({
    summary: "Transition room cleaning status and update linked dispatch",
  })
  @ApiResponse(ApiSuccessResponse(RoomTransitionResponseDto))
  @ApiResponse(ApiErrorResponse(400, "Bad Request"))
  @ApiResponse(ApiErrorResponse(403, "Forbidden"))
  @ApiResponse(ApiErrorResponse(404, "Room not found"))
  @ApiResponse(ApiErrorResponse(409, "Conflict - invalid state transition"))
  @ApiResponse(ApiErrorResponse(422, "Unprocessable Entity - payload mismatch"))
  async transitionRoom(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: RoomTransitionDto,
  ): Promise<RoomTransitionResponseDto> {
    return this.staffService.transitionRoom(user, id, dto);
  }

  @Post("pickups/:id/step")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
  )
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Unique idempotency key for offline replay protection",
    required: false,
  })
  @ApiOperation({
    summary:
      "Record the step an airport pickup has reached (accepted, en route, at the door, guest on board, dropped off)",
  })
  @ApiResponse(ApiSuccessResponse(PickupTaskResponseDto))
  @ApiResponse(ApiErrorResponse(403, "Forbidden"))
  @ApiResponse(ApiErrorResponse(404, "Pickup not found"))
  @ApiResponse(ApiErrorResponse(409, "Pickup closed or has no driver"))
  async recordPickupStep(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: PickupStepDto,
  ): Promise<PickupTaskResponseDto> {
    return this.staffService.recordPickupStep(user, id, dto);
  }

  @Post("pickups/:id/issue")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
  )
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Unique idempotency key for offline replay protection",
    required: false,
  })
  @ApiOperation({
    summary:
      "Driver reports a problem (flight delayed, guest not found, vehicle); alerts the desk",
  })
  @ApiResponse(ApiSuccessResponse(PickupTaskResponseDto))
  @ApiResponse(ApiErrorResponse(403, "Forbidden"))
  @ApiResponse(ApiErrorResponse(409, "Pickup closed"))
  async reportPickupIssue(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
    @Body() dto: PickupIssueDto,
  ): Promise<PickupTaskResponseDto> {
    return this.staffService.reportPickupIssue(user, id, dto);
  }

  @Post("pickups/:id/start")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
  )
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Unique idempotency key for offline replay protection",
    required: false,
  })
  @ApiOperation({ summary: "Mark an assigned airport pickup task as started" })
  @ApiResponse(ApiSuccessResponse(PickupTaskResponseDto))
  @ApiResponse(ApiErrorResponse(403, "Forbidden"))
  @ApiResponse(ApiErrorResponse(404, "Pickup not found"))
  @ApiResponse(ApiErrorResponse(409, "Conflict"))
  async startPickup(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
  ): Promise<PickupTaskResponseDto> {
    return this.staffService.startPickup(user, id);
  }

  @Post("pickups/:id/done")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
  )
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Unique idempotency key for offline replay protection",
    required: false,
  })
  @ApiOperation({
    summary: "Mark an assigned airport pickup task as completed",
  })
  @ApiResponse(ApiSuccessResponse(PickupTaskResponseDto))
  @ApiResponse(ApiErrorResponse(403, "Forbidden"))
  @ApiResponse(ApiErrorResponse(404, "Pickup not found"))
  async donePickup(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
  ): Promise<PickupTaskResponseDto> {
    return this.staffService.donePickup(user, id);
  }

  @Post("line/link-token")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary: "Generate a short-lived link token for LINE notifications",
  })
  @ApiResponse(ApiSuccessResponse(LineLinkTokenResponseDto, 201))
  async createLineLinkToken(
    @CurrentUser() user: ICurrentUser,
  ): Promise<LineLinkTokenResponseDto> {
    return this.staffService.createLineLinkToken(user);
  }

  @Public()
  @Post("line/webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Webhook callback for LINE Messaging API events" })
  async lineWebhook(
    @Headers("x-line-signature") signature: string,
    @Req() req: Request,
    @Body() body: any,
  ): Promise<{ status: string }> {
    const rawBody = (req as any).rawBody;
    return this.staffService.handleLineWebhook(signature, rawBody, body);
  }
}
