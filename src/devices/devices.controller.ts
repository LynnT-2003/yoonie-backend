import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { DevicesService } from "./devices.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { RegisterDeviceDto } from "./dto/request/register-device.dto";
import { DeviceResponseDto } from "./dto/response/device-response.dto";
import {
  ApiErrorResponse,
  ApiSuccessResponse,
} from "../common/helpers/swagger.helper";

@ApiTags("Devices")
@ApiBearerAuth("JWT-auth")
@ApiExtraModels(DeviceResponseDto)
@Controller("devices")
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
    UserRole.GUEST,
  )
  @ApiOperation({
    summary: "Register or refresh an Expo mobile push notification device",
  })
  @ApiResponse(ApiSuccessResponse(DeviceResponseDto, 201))
  @ApiResponse(ApiErrorResponse(400, "Bad Request"))
  @ApiResponse(ApiErrorResponse(401, "Unauthorized"))
  async register(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DeviceResponseDto> {
    return this.devicesService.register(user, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(
    UserRole.STAFF,
    UserRole.DISPATCHER,
    UserRole.BRANCH_MGR,
    UserRole.ADMIN,
    UserRole.GUEST,
  )
  @ApiOperation({
    summary: "Unregister or deactivate a mobile push device token",
  })
  @ApiResponse({ status: 204, description: "Device unregistered successfully" })
  @ApiResponse(ApiErrorResponse(404, "Device not found"))
  async unregister(
    @CurrentUser() user: ICurrentUser,
    @Param("id") id: string,
  ): Promise<void> {
    await this.devicesService.unregister(user, id);
  }
}
