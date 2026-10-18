import { ApiProperty } from "@nestjs/swagger";

import {
  IUserPublic,
  IOAuthProvider,
} from "../../../common/interfaces/user.interface";
import { UserRole } from "../../../common/enums/user-role.enum";
import { OAuthProviderType } from "../../../common/enums/oauth-provider.enum";
import { Permission } from "../../../common/enums/permission.enum";

/**
 * Swagger response schema for public user data.
 * Excludes sensitive fields (password, refreshTokens).
 */
export class UserPublicDto implements IUserPublic {
  @ApiProperty({
    example: "665a1b2c3d4e5f6a7b8c9d0e",
    description: "User ID",
  })
  _id!: string;

  @ApiProperty({
    example: "john@example.com",
    nullable: true,
    description: "Email address (null for OAuth-only users without email)",
  })
  email!: string | null;

  @ApiProperty({
    example: "John Doe",
    description: "Display name",
  })
  displayName!: string;

  @ApiProperty({
    example: "https://lh3.googleusercontent.com/...",
    nullable: true,
    description: "Avatar URL",
  })
  avatar!: string | null;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.GUEST,
    description: "User role",
  })
  role!: UserRole;

  @ApiProperty({
    example: ["665a1b2c3d4e5f6a7b8c9d0e"],
    type: [String],
    description: "Branch IDs the user has access to",
  })
  branchIds!: string[];

  @ApiProperty({
    enum: Permission,
    isArray: true,
    example: [Permission.HOUSEKEEPING_INSPECT],
    description: "Granted permissions for staff",
  })
  permissions!: Permission[];

  @ApiProperty({
    example: "HOUSEKEEPER",
    nullable: true,
    description: "Job title for staff member",
  })
  jobTitle!: string | null;

  @ApiProperty({
    example: false,
    description: "Cross-branch platform admin flag",
  })
  isPlatformAdmin!: boolean;

  @ApiProperty({
    example: false,
    description: "Whether the user must change password upon next login",
  })
  mustChangePassword!: boolean;

  @ApiProperty({
    example: false,
    description: "Email verification status",
  })
  isEmailVerified!: boolean;

  @ApiProperty({
    example: ["google", "local"],
    type: [String],
    description: "Array of connected OAuth provider names",
  })
  providers!: OAuthProviderType[];

  @ApiProperty({
    example: [
      { provider: "google", connectedAt: "2026-03-22T00:00:00.000Z" },
      { provider: "local", connectedAt: "2026-03-22T00:00:00.000Z" },
    ],
    description: "Detailed provider connection info",
  })
  providerDetails!: Pick<IOAuthProvider, "provider" | "connectedAt">[];

  @ApiProperty({
    example: false,
    description:
      "When true, most authenticated routes return 403 until unsuspended",
  })
  isSuspended!: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    description: "Optional operator note (only when suspended)",
  })
  suspensionReason!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    description: "When the account was suspended",
  })
  suspendedAt!: Date | null;

  @ApiProperty({
    example: "2026-03-22T00:00:00.000Z",
    description: "Account creation timestamp",
  })
  createdAt!: Date;

  @ApiProperty({
    example: "2026-03-22T00:00:00.000Z",
    description: "Last update timestamp",
  })
  updatedAt!: Date;
}
