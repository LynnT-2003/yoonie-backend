import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { NotificationsService } from "./notifications.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { QueryNotificationsDto } from "./dto/request/query-notifications.dto";
import { NotificationResponseDto } from "./dto/response/notification-response.dto";
import { UnreadCountResponseDto } from "./dto/response/unread-count-response.dto";
import { TickResponseDto } from "./dto/response/tick-response.dto";
import {
  ApiErrorResponse,
  ApiSuccessResponse,
} from "../common/helpers/swagger.helper";

@ApiTags("Notifications")
@ApiBearerAuth("JWT-auth")
@ApiExtraModels(
  NotificationResponseDto,
  UnreadCountResponseDto,
  TickResponseDto,
)
@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  @Get("notifications")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
    UserRole.GUEST,
  )
  @ApiOperation({ summary: "Get notifications for authenticated user" })
  @ApiResponse(ApiSuccessResponse(NotificationResponseDto, 200, true))
  @ApiResponse(ApiErrorResponse(401, "Unauthorized"))
  async listNotifications(
    @CurrentUser() user: ICurrentUser,
    @Query() query: QueryNotificationsDto,
  ): Promise<NotificationResponseDto[]> {
    return this.notificationsService.list(user, query);
  }

  @Get("notifications/unread-count")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
    UserRole.GUEST,
  )
  @ApiOperation({
    summary: "Get unread and unacknowledged critical notification counts",
  })
  @ApiResponse(ApiSuccessResponse(UnreadCountResponseDto))
  async getUnreadCount(
    @CurrentUser() user: ICurrentUser,
  ): Promise<UnreadCountResponseDto> {
    return this.notificationsService.unreadCount(user);
  }

  @Patch("notifications/:id/read")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
    UserRole.GUEST,
  )
  @ApiOperation({ summary: "Mark a notification as read" })
  @ApiResponse(ApiSuccessResponse(NotificationResponseDto))
  @ApiResponse(ApiErrorResponse(404, "Notification not found"))
  async markRead(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markRead(user, id);
  }

  @Patch("notifications/:id/ack")
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
  )
  @ApiOperation({ summary: "Acknowledge a critical notification" })
  @ApiResponse(ApiSuccessResponse(NotificationResponseDto))
  @ApiResponse(ApiErrorResponse(404, "Notification not found"))
  async markAck(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markAck(user, id);
  }

  @Public()
  @Post("internal/notifications/tick")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Trigger a notification worker tick (for Vercel cron or external schedulers)",
  })
  @ApiHeader({
    name: "x-internal-tick-secret",
    description: "Secret key configured via INTERNAL_TICK_SECRET",
    required: true,
  })
  @ApiResponse(ApiSuccessResponse(TickResponseDto))
  @ApiResponse(ApiErrorResponse(401, "Invalid tick secret"))
  async triggerTick(
    @Headers("x-internal-tick-secret") tickSecretHeader?: string,
  ): Promise<TickResponseDto> {
    const configuredSecret =
      this.configService.get<{ internalTickSecret?: string }>("staffOpsConfig")
        ?.internalTickSecret || process.env.INTERNAL_TICK_SECRET;

    if (!configuredSecret || tickSecretHeader !== configuredSecret) {
      throw new UnauthorizedException("Invalid tick secret");
    }

    return this.notificationsService.processDue();
  }
}
