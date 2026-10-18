import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  Query,
  Res,
} from "@nestjs/common";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Response } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiExtraModels,
  ApiBearerAuth,
} from "@nestjs/swagger";

import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/request/register.dto";
import { LoginDto } from "./dto/request/login.dto";
import { RefreshTokenDto } from "./dto/request/refresh-token.dto";
import { ForgotPasswordDto } from "./dto/request/forgot-password.dto";
import { ResetPasswordDto } from "./dto/request/reset-password.dto";
import { ChangePasswordDto } from "./dto/request/change-password.dto";
import { ResendVerificationDto } from "./dto/request/resend-verification.dto";
import {
  AuthResponseDto,
  AuthTokensDto,
  EmailResponseDto,
  MessageResponseDto,
  UserPublicDto,
} from "./dto/response";
import {
  ApiSuccessResponse,
  ApiErrorResponse,
} from "../common/helpers/swagger.helper";
import { LocalGuard } from "./guards/local/local.guard";
import { Public } from "../common/decorators/public.decorator";
import { AllowSuspendedUser } from "../common/decorators/allow-suspended-user.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ICurrentUser, IUser } from "../common/interfaces/user.interface";
import {
  IAuthResponse,
  IAuthTokens,
} from "../common/interfaces/auth.interface";
import { UserService } from "../user/user.service";
import { ConfigService } from "@nestjs/config";
import { ServerConfig } from "../common/config/types/env";
import { buildOAuthSpaRedirectUrl } from "./helpers/oauth-spa-redirect.helper";
import { Throttle } from "@nestjs/throttler";

@ApiExtraModels(
  AuthResponseDto,
  AuthTokensDto,
  EmailResponseDto,
  MessageResponseDto,
  UserPublicDto,
)
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  /** JSON envelope matches TransformInterceptor; redirect bypasses it intentionally. */
  private respondOAuthSuccess(res: Response, auth: IAuthResponse): void {
    const serverConfig = this.configService.get<ServerConfig>("serverConfig");
    const spa = serverConfig?.frontendOauthCallbackUrl?.trim();
    if (spa) {
      res.redirect(HttpStatus.FOUND, buildOAuthSpaRedirectUrl(spa, auth));
      return;
    }
    res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: auth,
      timestamp: new Date().toISOString(),
    });
  }

  @Public()
  @ApiTags("Auth - Local")
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a new user with email and password" })
  @ApiBody({ type: RegisterDto })
  @ApiResponse(ApiSuccessResponse(AuthResponseDto, 201))
  @ApiResponse(ApiErrorResponse(409, "Email already registered"))
  register(@Body() dto: RegisterDto): Promise<IAuthResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @ApiTags("Auth - Local")
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalGuard)
  @ApiOperation({ summary: "Login with email and password" })
  @ApiBody({ type: LoginDto })
  @ApiResponse(ApiSuccessResponse(AuthResponseDto))
  @ApiResponse(ApiErrorResponse(401, "Invalid email or password"))
  login(@Req() req: { user: IUser }): Promise<IAuthResponse> {
    return this.authService.login(req.user);
  }

  @Public()
  @ApiTags("Auth - Local")
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send password reset link to email" })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse(ApiSuccessResponse(MessageResponseDto))
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @ApiTags("Auth - Local")
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset password using token from email" })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse(ApiSuccessResponse(MessageResponseDto))
  @ApiResponse(ApiErrorResponse(400, "Invalid or expired password reset token"))
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @ApiTags("Auth - Local")
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Change password for the current authenticated user",
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse(ApiSuccessResponse(MessageResponseDto))
  @ApiResponse(ApiErrorResponse(400, "Current password is incorrect"))
  @ApiResponse(
    ApiErrorResponse(400, "This account does not use password login"),
  )
  changePassword(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Public()
  @ApiTags("Auth - Local")
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access and refresh tokens" })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse(ApiSuccessResponse(AuthTokensDto))
  @ApiResponse(ApiErrorResponse(401, "Invalid or expired refresh token"))
  refresh(@Body() dto: RefreshTokenDto): Promise<IAuthTokens> {
    return this.authService.refreshTokens(dto.userId, dto.refreshToken);
  }

  @ApiTags("Auth - Local")
  @Post("logout")
  @AllowSuspendedUser()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({ summary: "Logout and invalidate refresh token" })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: "Logged out successfully (empty response body)",
  })
  @ApiResponse(ApiErrorResponse(401, "Unauthorized"))
  logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.authService.logout(user.userId, dto.refreshToken);
  }

  @Public()
  @ApiTags("Auth - Local")
  @Get("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify email address via token from email link" })
  @ApiResponse({
    status: 302,
    description: "Redirects to VERIFY_REDIRECT_URL (when configured)",
  })
  @ApiResponse(ApiSuccessResponse(EmailResponseDto))
  @ApiResponse(ApiErrorResponse(400, "Token is required"))
  @ApiResponse(ApiErrorResponse(400, "Invalid or expired verification token"))
  async verifyEmail(
    @Query("token") token: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!token) {
      throw new BadRequestException("Token is required");
    }

    const { redirectUrl } = await this.authService.verifyEmail(token);

    if (redirectUrl) {
      res.redirect(redirectUrl);
    } else {
      res.status(HttpStatus.OK).json({
        success: true,
        statusCode: 200,
        data: { message: "Email verified successfully" },
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Public()
  @ApiTags("Auth - Local")
  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resend verification email" })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: "Verification email sent" })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const userDoc = await this.userService.findByEmail(dto.email);

    if (!userDoc) throw new NotFoundException("User not found");
    if (userDoc.isEmailVerified)
      throw new BadRequestException("Email already verified");

    await this.authService.sendVerificationEmail(userDoc);

    return { message: "Verification email sent" };
  }
}
