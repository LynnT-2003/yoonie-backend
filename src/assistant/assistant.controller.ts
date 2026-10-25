import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { AssistantService } from "./assistant.service";
import { AssistantMessageDto } from "./dto/assistant.dto";

@ApiTags("Yoonie assistant")
@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("guest")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ask the guest concierge (booking website)" })
  guest(@Body() dto: AssistantMessageDto) {
    return this.assistantService.askGuest(dto.sessionId, dto.message);
  }

  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
  )
  @ApiBearerAuth("JWT-auth")
  @Post("staff")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Ask the staff assistant; it acts as the signed-in user, with their permissions",
  })
  staff(@Req() req: Request, @Body() dto: AssistantMessageDto) {
    return this.assistantService.askStaff(
      req.headers.authorization ?? "",
      dto.sessionId,
      dto.message,
      dto.context,
    );
  }
}
