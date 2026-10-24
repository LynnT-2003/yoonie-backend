import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { Types } from "mongoose";

import { OAuthUserDto } from "./dto/oauth-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { InviteStaffDto } from "./dto/invite-staff.dto";
import { IUserService } from "./interfaces/user.service.interface";
import {
  ICurrentUser,
  IUser,
  IUserPublic,
} from "../common/interfaces/user.interface";
import { OAuthProviderType } from "../common/enums/oauth-provider.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { UserRepo } from "./user.repo";
import { ConfigService } from "@nestjs/config";
import { MailService } from "../mail/mail.service";
import { ConfigurationError } from "../common/errors/configuration.error";
import { R2Service } from "../storage/r2.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/enums/audit-action.enum";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.ADMIN]: 100,
  [UserRole.BRANCH_MGR]: 80,
  [UserRole.DISPATCHER]: 60,
  [UserRole.STAFF]: 40,
  [UserRole.GUEST]: 20,
};

@Injectable()
export class UserService implements IUserService {
  constructor(
    private readonly userRepo: UserRepo,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly r2Service: R2Service,
    private readonly auditService?: AuditService,
  ) {}

  // ─── Find By Id ─────────────────────────────────────────────────────────────

  async findById(id: string): Promise<IUser | null> {
    return this.userRepo.findById(id);
  }

  async findByIdWithPassword(id: string): Promise<IUser | null> {
    return this.userRepo.findByIdWithPassword(id);
  }

  // ─── Find By Email ───────────────────────────────────────────────────────────

  async findByEmail(email: string): Promise<IUser | null> {
    return this.userRepo.findByEmail(email, true); // true for includePassword
  }

  // ─── Create Local User ───────────────────────────────────────────────────────

  async createLocalUser(
    email: string,
    hashedPassword: string,
    displayName: string,
  ): Promise<IUser> {
    const existing = await this.userRepo.findByEmail(email);

    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    return this.userRepo.create({
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      displayName,
      role: UserRole.GUEST,
      branchIds: [],
      permissions: [],
      isPlatformAdmin: false,
      providers: [
        {
          provider: OAuthProviderType.LOCAL,
          providerId: email.toLowerCase().trim(),
          accessToken: null,
          connectedAt: new Date(),
        },
      ],
    });
  }

  // ─── Find Or Create OAuth User ───────────────────────────────────────────────

  async findOrCreateOAuthUser(dto: OAuthUserDto): Promise<IUser> {
    // 1. Look up by provider + providerId (compound index hit)
    const byProvider = await this.userRepo.findByProvider(
      dto.provider,
      dto.providerId,
    );

    if (byProvider) {
      // Update accessToken in case it rotated
      await this.userRepo.updateProviderAccessToken(
        byProvider._id,
        dto.provider,
        dto.providerId,
        dto.accessToken,
      );
      return byProvider;
    }

    // 2. Same email exists — link the new provider to the existing account
    if (dto.email) {
      const byEmail = await this.userRepo.findByEmail(dto.email);

      if (byEmail) {
        const shouldVerify =
          !byEmail.isEmailVerified && dto.provider !== OAuthProviderType.LOCAL;
        const user = await this.userRepo.addProviderToUser(
          byEmail._id,
          {
            provider: dto.provider,
            providerId: dto.providerId,
            accessToken: dto.accessToken,
            connectedAt: new Date(),
          },
          shouldVerify,
        );

        if (shouldVerify) {
          void this.mailService.sendCustomEmail(
            byEmail.email!,
            "Account Verified",
            `Hello ${byEmail.displayName}, Your account has been verified successfully.`,
          );
        }

        return user!;
      }
    }

    // 3. Brand new user
    const user = await this.userRepo.create({
      email: dto.email ? dto.email.toLowerCase().trim() : null,
      displayName: dto.displayName,
      avatar: dto.avatar,
      isEmailVerified: dto.provider === OAuthProviderType.LOCAL ? false : true,
      providers: [
        {
          provider: dto.provider,
          providerId: dto.providerId,
          accessToken: dto.accessToken,
          connectedAt: new Date(),
        },
      ],
    });

    return user;
  }

  // ─── Update User ─────────────────────────────────────────────────────────────

  async updateUser(id: string, dto: UpdateUserDto): Promise<IUserPublic> {
    const user = await this.userRepo.updateProfile(id, dto);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.toPublic(user);
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<IUserPublic> {
    const uploadRes = await this.r2Service.uploadFile(
      file,
      `avatars/${userId}`,
    );
    const user = await this.userRepo.updateProfile(userId, {
      avatar: uploadRes.url,
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.toPublic(user);
  }

  async inviteStaff(
    inviter: ICurrentUser,
    dto: InviteStaffDto,
  ): Promise<{ user: IUserPublic; tempPassword: string }> {
    // 1. Check role hierarchy: inviter cannot grant a role higher than their own
    const inviterLevel = ROLE_HIERARCHY[inviter.role] ?? 0;
    const targetLevel = ROLE_HIERARCHY[dto.role] ?? 0;
    if (inviterLevel < targetLevel) {
      throw new ForbiddenException(
        `Cannot grant role ${dto.role} which is higher than your current role`,
      );
    }

    // 2. Branch ownership check: inviter must own every branchId they grant (unless platform admin)
    if (!inviter.isPlatformAdmin) {
      const inviterBranches = new Set(inviter.branchIds || []);
      for (const branchId of dto.branchIds) {
        if (!inviterBranches.has(branchId)) {
          throw new ForbiddenException(
            `Cannot grant access to branch ${branchId} that you do not own or manage`,
          );
        }
      }
    }

    // 3. Email conflict check
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    // 4. Generate temporary password server-side (returned once, never logged)
    const tempPassword =
      "Tmp#" + crypto.randomBytes(6).toString("base64url") + "!";
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 5. Create user with mustChangePassword = true, isPlatformAdmin = false
    const created = await this.userRepo.create({
      email: dto.email.toLowerCase().trim(),
      password: hashedPassword,
      displayName: dto.displayName,
      role: dto.role,
      jobTitle: dto.jobTitle ?? null,
      branchIds: dto.branchIds.map((id) => new Types.ObjectId(id)) as any,
      permissions: dto.permissions || [],
      isPlatformAdmin: false,
      mustChangePassword: true,
      isEmailVerified: true,
      providers: [
        {
          provider: OAuthProviderType.LOCAL,
          providerId: dto.email.toLowerCase().trim(),
          accessToken: null,
          connectedAt: new Date(),
        },
      ],
    });

    const res = {
      user: this.toPublic(created),
      tempPassword,
    };

    if (this.auditService) {
      await this.auditService.log({
        who: AuditService.fromCurrentUser(inviter),
        action: AuditAction.STAFF_INVITE,
        targetType: "user",
        targetId: created._id.toString(),
        branchId: dto.branchIds?.[0] || null,
        to: {
          role: dto.role,
          branchIds: dto.branchIds,
          permissions: dto.permissions,
        },
        metadata: { displayName: dto.displayName, email: dto.email },
      });
    }

    return res;
  }

  async deactivateStaff(
    inviter: ICurrentUser,
    targetUserId: string,
    reason?: string,
  ): Promise<void> {
    const target = await this.userRepo.findById(targetUserId);
    if (!target) {
      throw new NotFoundException("Staff user not found");
    }

    const inviterLevel = ROLE_HIERARCHY[inviter.role] ?? 0;
    const targetLevel = ROLE_HIERARCHY[target.role] ?? 0;
    if (inviterLevel < targetLevel) {
      throw new ForbiddenException(
        "Cannot deactivate a user with a higher role than your own",
      );
    }

    if (!inviter.isPlatformAdmin) {
      const inviterBranches = new Set(inviter.branchIds || []);
      const hasCommonBranch = (target.branchIds || []).some((b) =>
        inviterBranches.has(b.toString()),
      );
      if (!hasCommonBranch && target.branchIds?.length > 0) {
        throw new ForbiddenException(
          "Cannot deactivate staff outside your assigned branches",
        );
      }
    }

    await this.userRepo.updateProfile(targetUserId, {
      isSuspended: true,
      suspensionReason: reason || "Deactivated by staff administrator",
      suspendedAt: new Date(),
    });

    if (this.auditService) {
      await this.auditService.log({
        who: AuditService.fromCurrentUser(inviter),
        action: AuditAction.STAFF_DEACTIVATE,
        targetType: "user",
        targetId: targetUserId,
        branchId: target.branchIds?.[0]?.toString() || null,
        from: { isSuspended: false },
        to: { isSuspended: true, reason },
      });
    }

    await this.removeAllRefreshTokens(targetUserId);
  }

  async deleteAccount(id: string): Promise<void> {
    const deleted = await this.userRepo.deleteById(id);

    if (!deleted) {
      throw new NotFoundException("User not found");
    }
  }

  // ─── Refresh Token Management ────────────────────────────────────────────────

  async saveRefreshToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void> {
    // Industry Standard: Limit the maximum number of concurrent active sessions
    const MAX_SESSIONS = parseInt(
      this.configService.get<string>("MAX_SESSIONS", "5"),
      10,
    );

    // 1. Prune completely expired tokens first
    await this.userRepo.removeExpiredRefreshTokens(id);

    // 2. Push the new token, sort the array by newest first, and slice to keep only the latest MAX_SESSIONS
    await this.userRepo.pushRefreshToken(
      id,
      hashedToken,
      expiresAt,
      MAX_SESSIONS,
    );
  }

  async removeRefreshToken(id: string, hashedToken: string): Promise<void> {
    await this.userRepo.removeRefreshToken(id, hashedToken);
  }

  async removeRefreshTokenById(
    id: string,
    refreshTokenId: string,
  ): Promise<void> {
    await this.userRepo.removeRefreshTokenById(id, refreshTokenId);
  }

  async removeAllRefreshTokens(id: string): Promise<void> {
    await this.userRepo.removeAllRefreshTokens(id);
  }

  // ─── Validate Refresh Token ──────────────────────────────────────────────────
  // Not on the interface — called internally by auth.service.ts.
  // Fetches the user with refreshTokens (+select) and compares hashes.

  async findValidRefreshToken(
    id: string,
    incomingToken: string,
  ): Promise<IUser | null> {
    const user = await this.userRepo.findWithRefreshTokens(id);

    if (!user) return null;

    const now = new Date();
    const hashedIncomingToken = this.hashRefreshToken(incomingToken);

    for (const stored of user.refreshTokens) {
      if (stored.expiresAt < now) continue; // skip expired
      if (stored.token === hashedIncomingToken) return user;
    }

    return null;
  }

  private hashRefreshToken(rawToken: string): string {
    const secret = this.configService.get<string>("JWT_REFRESH_SECRET");
    if (!secret) {
      throw new ConfigurationError("JWT_REFRESH_SECRET");
    }

    return crypto.createHmac("sha256", secret).update(rawToken).digest("hex");
  }

  // ─── To Public ───────────────────────────────────────────────────────────────

  toPublic(user: IUser): IUserPublic {
    return {
      _id: user._id,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      branchIds: (user.branchIds || []).map((id) => id.toString()),
      permissions: user.permissions || [],
      jobTitle: user.jobTitle ?? null,
      isPlatformAdmin: !!user.isPlatformAdmin,
      mustChangePassword: !!user.mustChangePassword,
      isEmailVerified: user.isEmailVerified,
      providers: (user.providers || []).map((p) => p.provider),
      providerDetails: (user.providers || []).map((p) => ({
        provider: p.provider,
        connectedAt: p.connectedAt,
      })),
      isSuspended: !!user.isSuspended,
      suspensionReason: user.suspensionReason ?? null,
      suspendedAt: user.suspendedAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async saveEmailVerificationToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userRepo.saveEmailVerificationToken(id, hashedToken, expiresAt);
  }

  async findByVerificationToken(hashedToken: string): Promise<IUser | null> {
    return this.userRepo.findByVerificationToken(hashedToken);
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.userRepo.markEmailVerified(id);
  }

  async savePasswordResetToken(
    id: string,
    hashedToken: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.userRepo.savePasswordResetToken(id, hashedToken, expiresAt);
  }

  async findByPasswordResetToken(hashedToken: string): Promise<IUser | null> {
    return this.userRepo.findByPasswordResetToken(hashedToken);
  }

  async updatePasswordAndClearResetToken(
    id: string,
    hashedPassword: string,
  ): Promise<void> {
    await this.userRepo.updatePasswordAndClearResetToken(id, hashedPassword);
  }

  async isUserHasAnySocialLoginProvider(id: string): Promise<boolean> {
    const user = await this.userRepo.findById(id);
    if (!user) return false;
    return user.providers.some((p) => p.provider !== OAuthProviderType.LOCAL);
  }

  async createLineLinkToken(
    userId: string,
  ): Promise<{ code: string; expiresAt: Date }> {
    const code = crypto.randomBytes(3).toString("hex").toUpperCase();
    const hashed = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.userRepo.saveLineLinkToken(userId, hashed, expiresAt);
    return { code, expiresAt };
  }

  async linkLineUser(rawCode: string, lineUserId: string): Promise<boolean> {
    const codeClean = rawCode.trim().toUpperCase();
    const hashed = crypto.createHash("sha256").update(codeClean).digest("hex");
    const updated = await this.userRepo.linkLineUserByToken(hashed, lineUserId);
    return !!updated;
  }
}
