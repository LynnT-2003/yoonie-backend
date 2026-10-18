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
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ICurrentUser, IUserPublic } from "../common/interfaces/user.interface";
import { UserRole } from "../common/enums/user-role.enum";
import { Public } from "../common/decorators/public.decorator";
import { AllowSuspendedUser } from "../common/decorators/allow-suspended-user.decorator";

const USER_EXAMPLE = {
  _id: "665a1b2c3d4e5f6a7b8c9d0e1",
  email: "john@example.com",
  displayName: "John Doe",
  avatar: null,
  role: "user",
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
  @UseInterceptors(FileInterceptor("avatar"))
  @ApiOperation({
    summary: "Update current user profile (with optional avatar file in 1 shot)",
  })
  @ApiConsumes("multipart/form-data", "application/json")
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: "Profile updated",
    schema: { example: { ...USER_EXAMPLE, displayName: "Jane Doe" } },
  })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async updateMe(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: UpdateUserDto,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ): Promise<IUserPublic> {
    if (avatarFile) {
      await this.userService.uploadAvatar(user.userId, avatarFile);
    }
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

  @Get("admin")
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Admin-only: get current admin profile" })
  @ApiResponse({
    status: 200,
    description: "Admin profile",
    schema: { example: { ...USER_EXAMPLE, role: "admin" } },
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
