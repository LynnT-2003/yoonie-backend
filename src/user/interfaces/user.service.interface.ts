import { OAuthUserDto } from "../dto/oauth-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { IUser, IUserPublic } from "../../common/interfaces/user.interface";

export interface IUserService {
  /**
   * Find a user by their ID.
   * Returns null if not found.
   */
  findById(id: string): Promise<IUser | null>;

  /**
   * Find a user by ID including password hash when the adapter hides it by default.
   */
  findByIdWithPassword(id: string): Promise<IUser | null>;

  /**
   * Find a user by email.
   * Used by local.strategy.ts to look up the user before password comparison.
   * Explicitly selects +password since it is excluded by default.
   */
  findByEmail(email: string): Promise<IUser | null>;

  /**
   * Find or create a user from an OAuth profile.
   * Called by google.strategy.ts after successful OAuth callback.
   *
   * Logic:
   *   1. Look up by providers.provider + providers.providerId
   *   2. If found → return existing user
   *   3. If not found but email exists → link provider to existing account
   *   4. If neither → create new user
   */
  findOrCreateOAuthUser(dto: OAuthUserDto): Promise<IUser>;

  /**
   * Create a new user from email + hashed password.
   * Called by auth.service.ts during local registration.
   */
  createLocalUser(
    email: string,
    hashedPassword: string,
    displayName: string,
  ): Promise<IUser>;

  /**
   * Update allowed profile fields.
   * Returns the updated public user shape.
   */
  updateUser(id: string, dto: UpdateUserDto): Promise<IUserPublic>;

  /**
   * Permanently delete the user account.
   */
  deleteAccount(id: string): Promise<void>;

  /**
   * Append a hashed refresh token to the user's refreshTokens array.
   * Old expired tokens are pruned at the same time.
   */
  saveRefreshToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void>;

  /**
   * Remove a specific refresh token from the array.
   * Called on logout or token rotation.
   */
  removeRefreshToken(id: string, hashedToken: string): Promise<void>;

  removeRefreshTokenById(id: string, refreshTokenId: string): Promise<void>;

  /**
   * Remove all refresh tokens for a user.
   * Called on logout-all-devices.
   */
  removeAllRefreshTokens(id: string): Promise<void>;

  /**
   * Map an internal user to the safe public shape.
   * Used before any user object is sent in a response.
   */
  toPublic(user: IUser): IUserPublic;

  saveEmailVerificationToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void>;

  findByVerificationToken(hashedToken: string): Promise<IUser | null>;

  markEmailVerified(id: string): Promise<void>;

  savePasswordResetToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void>;

  findByPasswordResetToken(hashedToken: string): Promise<IUser | null>;

  updatePasswordAndClearResetToken(
    id: string,
    hashedPassword: string,
  ): Promise<void>;

  isUserHasAnySocialLoginProvider(id: string): Promise<boolean>;
}
