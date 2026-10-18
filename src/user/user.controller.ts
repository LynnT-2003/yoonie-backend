import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
} from "@nestjs/swagger";

import { UserService } from "./user.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { InviteStaffDto } from "./dto/invite-staff.dto";
import { InviteStaffResponseDto } from "./dto/invite-staff-response.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ICurrentUser, IUserPublic } from "../common/interfaces/user.interface";
import { UserRole } from "../common/enums/user-role.enum";
import { AllowSuspendedUser } from "../common/decorators/allow-suspended-user.decorator";

const USER_EXAMPLE = {
  _id: "665a1b2c3d4e5f6a7b8c9d0e1",
  email: "john@example.com",
  displayName: "John Doe",
  avatar: null,
  role: UserRole.GUEST,
  isEmailVerified: false,
  providers: [],
  isSuspended: false,
  suspensionReason: null,
  suspendedAt: null,
  createdAt: "2026-03-22T00:00:00.000Z",
  updatedAt: "2026-03-22T00:00:00.000Z",
};

@ApiTags("Users")
@ApiBearerAuth("JWT-auth")
@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  @AllowSuspendedUser()
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({
    status: 200,
    description: "User profile",
    schema: { example: USER_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  getMe(@CurrentUser() user: ICurrentUser): Promise<IUserPublic> {
    return this.userService.findById(user.userId).then((doc) => {
      if (!doc) throw new Error("User not found");
      return this.userService.toPublic(doc);
    });
  }

  @Patch("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update current user profile" })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: "Profile updated",
    schema: { example: { ...USER_EXAMPLE, displayName: "Jane Doe" } },
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  updateMe(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: UpdateUserDto,
  ): Promise<IUserPublic> {
    return this.userService.updateUser(user.userId, dto);
  }

  @Post("me/avatar")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    summary: "Upload & set current user profile avatar in 1 call",
    description:
      "Uploads an image file to Cloudflare R2 and immediately updates user.avatar in MongoDB.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "User avatar image file",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Avatar updated",
    schema: { example: USER_EXAMPLE },
  })
  async uploadAvatar(
    @CurrentUser() user: ICurrentUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<IUserPublic> {
    if (!file) {
      throw new BadRequestException("Avatar image file must be provided");
    }
    return this.userService.uploadAvatar(user.userId, file);
  }

  @Delete("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete current user account" })
  @ApiResponse({
    status: 200,
    description: "Account deleted",
    schema: { example: { message: "Account deleted successfully" } },
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async deleteMe(
    @CurrentUser() user: ICurrentUser,
  ): Promise<{ message: string }> {
    await this.userService.deleteAccount(user.userId);
    return { message: "Account deleted successfully" };
  }

  @Post("staff")
  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Invite/create a new staff member (Admin/Branch Manager only)",
    description:
      "Creates a new staff member with server-generated temporary password and mustChangePassword=true. The inviter must own all granted branches and cannot grant a role above their own.",
  })
  @ApiBody({ type: InviteStaffDto })
  @ApiResponse({
    status: 201,
    description: "Staff created successfully with temporary password",
    type: InviteStaffResponseDto,
  })
  @ApiResponse({ status: 403, description: "Forbidden" })
  async inviteStaff(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: InviteStaffDto,
  ): Promise<InviteStaffResponseDto> {
    return (await this.userService.inviteStaff(user, dto)) as any;
  }

  @Patch("staff/:id/deactivate")
  @Roles(UserRole.ADMIN, UserRole.BRANCH_MGR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Deactivate a staff member" })
  @ApiResponse({ status: 200, description: "Staff deactivated successfully" })
  async deactivateStaff(
    @CurrentUser() user: ICurrentUser,
    @Param("id") targetUserId: string,
    @Body("reason") reason?: string,
  ): Promise<{ message: string }> {
    await this.userService.deactivateStaff(user, targetUserId, reason);
    return { message: "Staff deactivated successfully" };
  }

  @Get("admin")
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Admin-only: get current admin profile" })
  @ApiResponse({
    status: 200,
    description: "Admin profile",
    schema: { example: { ...USER_EXAMPLE, role: UserRole.ADMIN } },
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  async adminOnly(@CurrentUser() user: ICurrentUser): Promise<IUserPublic> {
    return this.userService.findById(user.userId).then((doc) => {
      if (!doc) throw new Error("User not found");
      return this.userService.toPublic(doc);
    });
  }
}
