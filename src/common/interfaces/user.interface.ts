import { OAuthProviderType } from "../enums/oauth-provider.enum";
import { UserRole } from "../enums/user-role.enum";
import { PaymentPlanId } from "../enums/payment-plan.enum";
import { Permission } from "../enums/permission.enum";

// ─── Subdocument Interfaces ────────────────────────────────────────────────────

export interface IOAuthProvider {
  provider: OAuthProviderType;
  providerId: string;
  accessToken: string | null;
  connectedAt: Date;
}

export interface IRefreshToken {
  id?: string;
  token: string; // HMAC-SHA256 hash
  createdAt: Date;
  expiresAt: Date;
}

// ─── Full User (internal — never sent to client) ───────────────────────────────

export interface IUser {
  _id: string;
  email: string | null;
  password: string | null;
  displayName: string;
  avatar: string | null;
  role: UserRole;
  branchIds: string[];
  permissions: Permission[];
  jobTitle?: string | null;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  lineUserId?: string | null;
  phoneE164?: string | null;
  notificationPrefs?: {
    enabledChannels: string[];
    quietHours: {
      enabled: boolean;
      start: string;
      end: string;
    };
  };
  providers: IOAuthProvider[];
  refreshTokens: IRefreshToken[];
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpiresAt: Date | null;
  passwordResetToken: string | null;
  passwordResetExpiresAt: Date | null;
  // Admin module stubs — inactive until `yulio add admin` is installed.
  // Safe to remove if you are not planning to use yulio's admin module.
  isSuspended: boolean;
  suspensionReason: string | null;
  suspendedAt: Date | null;
  stripeCustomerId: string | null;
  plan: PaymentPlanId;
  planExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Public User (safe to send to client) ─────────────────────────────────────

export interface IUserPublic {
  _id: string;
  email: string | null;
  displayName: string;
  avatar: string | null;
  role: UserRole;
  branchIds: string[];
  permissions: Permission[];
  jobTitle?: string | null;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  isEmailVerified: boolean;
  providers: OAuthProviderType[];
  providerDetails: Pick<IOAuthProvider, "provider" | "connectedAt">[];
  // Admin module stubs — inactive until `yulio add admin` is installed.
  // Safe to remove if you are not planning to use yulio's admin module.
  isSuspended: boolean;
  suspensionReason: string | null;
  suspendedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Admin module stub — aliased to IUserPublic until `yulio add admin` is installed. */
export type IUserAdminModerationView = IUserPublic;

// ─── Current User (lives on req.user after JwtStrategy.validate()) ─────────────

export interface ICurrentUser {
  userId: string;
  email: string | null;
  role: UserRole;
  isSuspended: boolean;
  branchIds: string[];
  permissions: Permission[];
  isPlatformAdmin: boolean;
}
