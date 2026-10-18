import { RegisterDto } from "../dto/request/register.dto";
import {
  IAuthResponse,
  IAuthTokens,
} from "../../common/interfaces/auth.interface";
import { IUser } from "../../common/interfaces/user.interface";

export interface IAuthService {
  /**
   * Register a new user with email + password.
   * Hashes password, creates user, issues token pair.
   * Throws ConflictException if email already exists.
   */
  register(dto: RegisterDto): Promise<IAuthResponse>;

  /**
   * Validate email + password during local login.
   * Called by local.strategy.ts — returns the user doc or null.
   * Never throws — returning null signals invalid credentials.
   */
  validateLocalUser(email: string, password: string): Promise<IUser | null>;

  /**
   * Issue tokens for a validated user.
   * Called by auth.controller.ts after LocalGuard passes.
   */
  login(user: IUser): Promise<IAuthResponse>;

  /**
   * Handle OAuth callback (Google etc.).
   * User is already validated and attached by the OAuth strategy.
   * Issues token pair and returns auth response.
   */
  oauthLogin(user: IUser): Promise<IAuthResponse>;

  /**
   * Rotate the refresh token.
   * Validates the incoming token, removes it, issues a new pair.
   * Throws UnauthorizedException if token is invalid or expired.
   */
  refreshTokens(
    userId: string,
    incomingRefreshToken: string,
  ): Promise<IAuthTokens>;

  /**
   * Invalidate the provided refresh token.
   * Removes it from the user's refreshTokens array.
   */
  logout(userId: string, refreshToken: string): Promise<void>;

  /**
   * Generate a signed access + refresh token pair for a user.
   * Private to the service but declared here for transparency.
   */
  generateTokens(user: IUser): Promise<IAuthTokens>;

  /**
   * Send a verification email to the user.
   * Generates a hashed token, saves it to the user, and sends the email.
   */
  sendVerificationEmail(user: IUser): Promise<void>;

  /**
   * Verify an email address via a token from an email link.
   * Finds the user by the hashed token, marks them as verified, and returns the redirect URL.
   */
  verifyEmail(rawToken: string): Promise<{ redirectUrl: string | null }>;

  /**
   * Send a password reset link when a matching local account exists.
   */
  forgotPassword(email: string): Promise<{ message: string }>;

  /**
   * Reset password with a one-time token from email.
   */
  resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }>;

  /**
   * Change password for an authenticated local account.
   */
  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }>;
}
