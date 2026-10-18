import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";

import { UserService } from "../user/user.service";
import { RegisterDto } from "./dto/request/register.dto";
import { IAuthService } from "./interfaces/auth.service.interface";
import {
  IAuthResponse,
  IAuthTokens,
} from "../common/interfaces/auth.interface";
import { StringValue } from "ms";
import * as crypto from "crypto";
import { MailService } from "../mail/mail.service";
import { Logger } from "@nestjs/common";
import { IUser } from "../common/interfaces/user.interface";
import { ConfigurationError } from "../common/errors/configuration.error";

const SALT_ROUNDS = 10;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const PASSWORD_RESET_EXPIRY_HOURS = 1;

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<IAuthResponse> {
    const existing = await this.userService.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.userService.createLocalUser(
      dto.email,
      hashedPassword,
      dto.displayName,
    );

    this.sendVerificationEmail(user).catch((err) =>
      this.logger.error("Failed to send verification email", err),
    );

    const tokens = await this.generateTokens(user);

    return {
      user: this.userService.toPublic(user),
      tokens,
    };
  }

  // ─── Validate Local User ─────────────────────────────────────────────────────

  // Called by local.strategy.ts — never throws, returns null on failure.
  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<IUser | null> {
    const user = await this.userService.findByEmail(email);

    if (!user || !user.password) return null;

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return null;

    return user;
  }

  // ─── Login (local) ───────────────────────────────────────────────────────────

  // Called by auth.controller after LocalGuard attaches user to req.
  async login(user: IUser): Promise<IAuthResponse> {
    const tokens = await this.generateTokens(user);

    return {
      user: this.userService.toPublic(user),
      tokens,
    };
  }

  // ─── OAuth Login ─────────────────────────────────────────────────────────────

  // Called by google.strategy after findOrCreateOAuthUser resolves.
  async oauthLogin(user: IUser): Promise<IAuthResponse> {
    const tokens = await this.generateTokens(user);

    return {
      user: this.userService.toPublic(user),
      tokens,
    };
  }

  // ─── Refresh Tokens ──────────────────────────────────────────────────────────

  async refreshTokens(
    userId: string,
    incomingRefreshToken: string,
  ): Promise<IAuthTokens> {
    const user = await this.userService.findValidRefreshToken(
      userId,
      incomingRefreshToken,
    );

    if (!user) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Rotate — remove old token, issue new pair
    await this.removeMatchingRefreshTokens(user, incomingRefreshToken);

    return this.generateTokens(user);
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken: string): Promise<void> {
    const user = await this.userService.findValidRefreshToken(
      userId,
      refreshToken,
    );

    if (!user) return; // already logged out or invalid — fail silently

    await this.removeMatchingRefreshTokens(user, refreshToken);
  }

  private async removeMatchingRefreshTokens(
    user: IUser,
    rawRefreshToken: string,
  ): Promise<void> {
    const hashedRefreshToken = this.hashRefreshToken(rawRefreshToken);
    const now = new Date();

    for (const stored of user.refreshTokens) {
      if (stored.expiresAt < now) continue;

      if (stored.token === hashedRefreshToken && stored.id) {
        await this.userService.removeRefreshTokenById(user._id, stored.id);
        return;
      }
    }
  }

  // ─── Generate Tokens ─────────────────────────────────────────────────────────

  async generateTokens(user: IUser): Promise<IAuthTokens> {
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
    };

    const accessSecret = this.configService.get<string>("JWT_ACCESS_SECRET");
    if (!accessSecret) {
      throw new ConfigurationError("JWT_ACCESS_SECRET");
    }
    const refreshSecret = this.configService.get<string>("JWT_REFRESH_SECRET");
    if (!refreshSecret) {
      throw new ConfigurationError("JWT_REFRESH_SECRET");
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: (this.configService.get("JWT_ACCESS_EXPIRES_IN") ??
          "15m") as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: (this.configService.get("JWT_REFRESH_EXPIRES_IN") ??
          "30d") as StringValue,
      }),
    ]);

    // Hash and persist the full refresh token.
    const hashedRefreshToken = this.hashRefreshToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.userService.saveRefreshToken(
      user._id,
      hashedRefreshToken,
      expiresAt,
    );

    return { accessToken, refreshToken };
  }

  private hashRefreshToken(rawToken: string): string {
    return crypto
      .createHmac("sha256", this.getRequiredConfig("JWT_REFRESH_SECRET"))
      .update(rawToken)
      .digest("hex");
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new ConfigurationError(key);
    }
    return value;
  }

  // ─── Send Verification Email ──────────────────────────────────────────────────

  async sendVerificationEmail(user: IUser): Promise<void> {
    if (user.isEmailVerified) {
      throw new BadRequestException("Email already verified");
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.userService.saveEmailVerificationToken(
      user._id,
      hashedToken,
      expiresAt,
    );

    await this.mailService.sendVerificationEmail(
      user.email!,
      user.displayName,
      rawToken,
    );
  }

  // ─── Verify Email ─────────────────────────────────────────────────────────────

  async verifyEmail(rawToken: string): Promise<{ redirectUrl: string | null }> {
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const user = await this.userService.findByVerificationToken(hashedToken);

    if (!user) {
      throw new BadRequestException("Invalid or expired verification token");
    }

    await this.userService.markEmailVerified(user._id);

    this.mailService
      .sendWelcomeEmail(user.email!, user.displayName)
      .catch((err: unknown) =>
        this.logger.error(`Failed to send welcome email → ${user.email}`, err),
      );

    void this.mailService.sendCustomEmail(
      user.email!,
      "Account Verified",
      `Hello ${user.displayName}, Your account has been verified successfully.`,
    );

    const redirectUrl =
      this.configService.get<string>("VERIFY_REDIRECT_URL") ?? null;

    return { redirectUrl };
  }

  // ─── Forgot / Reset Password ────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(email);
    const message =
      "If an account with that email exists, a password reset link has been sent.";

    if (!user || !user.password) {
      return { message };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_EXPIRY_HOURS);

    await this.userService.savePasswordResetToken(
      user._id,
      hashedToken,
      expiresAt,
    );

    await this.mailService.sendPasswordResetEmail(
      user.email!,
      user.displayName,
      rawToken,
    );

    return { message };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const user = await this.userService.findByPasswordResetToken(hashedToken);

    if (!user || !user.password) {
      throw new BadRequestException("Invalid or expired password reset token");
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.userService.updatePasswordAndClearResetToken(
      user._id,
      hashedPassword,
    );
    await this.userService.removeAllRefreshTokens(user._id);

    this.mailService
      .sendPasswordChangedEmail(user.email!, user.displayName)
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to send password changed email → ${user.email}`,
          err,
        ),
      );

    return { message: "Password reset successfully. You can now log in." };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userService.findByIdWithPassword(userId);

    if (!user || !user.password) {
      throw new BadRequestException("This account does not use password login");
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.userService.updatePasswordAndClearResetToken(
      user._id,
      hashedPassword,
    );
    await this.userService.removeAllRefreshTokens(user._id);

    this.mailService
      .sendPasswordChangedEmail(user.email!, user.displayName)
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to send password changed email → ${user.email}`,
          err,
        ),
      );

    return { message: "Password changed successfully. Please log in again." };
  }
}
