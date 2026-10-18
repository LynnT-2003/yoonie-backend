import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { OAuthProviderType } from "../../common/enums/oauth-provider.enum";
import { UserRole } from "../../common/enums/user-role.enum";
import { PaymentPlanId } from "../../common/enums/payment-plan.enum";

// ─── Subdocument: OAuthProvider ───────────────────────────────────────────────

@Schema({ _id: false })
export class OAuthProvider {
  @Prop({
    type: String,
    enum: OAuthProviderType,
    required: true,
  })
  provider: OAuthProviderType;

  @Prop({ required: true })
  providerId: string;

  @Prop({ type: String, default: null })
  accessToken: string | null;

  @Prop({ required: true, default: () => new Date() })
  connectedAt: Date;
}

export const OAuthProviderSchema = SchemaFactory.createForClass(OAuthProvider);

// ─── Subdocument: RefreshToken ─────────────────────────────────────────────────

@Schema()
export class RefreshToken {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  token: string; // stored as HMAC-SHA256 hash — never raw

  @Prop({ required: true, default: () => new Date() })
  createdAt: Date;

  @Prop({ required: true })
  expiresAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// ─── Main Entity: User ─────────────────────────────────────────────────────────

/**
 * User Document Schema Example (Guest CDP Profile & Staff Member):
 * -------------------------------------------------------------
 * {
 *   "_id": ObjectId("665a1b2c3d4e5f6a7b8c9d0a"),
 *   "email": "sarah.jenkins@example.com",
 *   "password": "$2b$10$hashedpassword...",
 *   "displayName": "Sarah Jenkins",
 *   "avatar": "https://cdn.example.com/avatars/sarah.jpg",
 *   "role": "GUEST",
 *   "providers": [
 *     {
 *       "provider": "GOOGLE",
 *       "providerId": "google_1234567890"
 *     }
 *   ],
 *   "phoneE164": "+66812345678",
 *   "lineUserId": "U1234567890abcdef",
 *   "whatsappOptIn": true,
 *   "preferredLanguage": "en",
 *   "nationalityCode": "GB",
 *   "branchIds": [
 *     ObjectId("665a1b2c3d4e5f6a7b8c9d0e")
 *   ],
 *   "jobTitle": null,
 *   "stats": {
 *     "lifetimeSpendThb": 54200,
 *     "stayCount": 4,
 *     "orderCount": 6,
 *     "lastStayAt": ISODate("2026-10-18T00:00:00.000Z")
 *   },
 *   "vipScore": 85,
 *   "isActive": true,
 *   "isEmailVerified": true,
 *   "createdAt": ISODate("2026-01-15T10:00:00.000Z"),
 *   "updatedAt": ISODate("2026-10-18T00:00:00.000Z")
 * }
 * -------------------------------------------------------------
 */
@Schema({
  timestamps: true, // auto createdAt + updatedAt
  collection: "users",
})
export class User {
  // Mongoose attaches _id automatically — exposing as a typed getter
  _id: Types.ObjectId;

  @Prop({
    type: String,
    lowercase: true,
    trim: true,
    default: null,
  })
  email: string | null;

  @Prop({
    type: String,
    default: null,
    select: false, // never returned in queries unless explicitly requested
  })
  password: string | null; // null for OAuth-only users

  @Prop({
    type: String,
    trim: true,
    required: true,
  })
  displayName: string;

  @Prop({ type: String, default: null })
  avatar: string | null;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Prop({
    type: [OAuthProviderSchema],
    default: [],
  })
  providers: OAuthProvider[];

  @Prop({
    type: [RefreshTokenSchema],
    default: [],
    select: false, // never returned in queries unless explicitly requested
  })
  refreshTokens: RefreshToken[];

  @Prop({ type: Boolean, default: false })
  isEmailVerified: boolean;

  @Prop({ type: String, default: null, select: false })
  emailVerificationToken: string | null;

  @Prop({ type: Date, default: null })
  emailVerificationExpiresAt: Date | null;

  @Prop({ type: String, default: null, select: false })
  passwordResetToken: string | null;

  @Prop({ type: Date, default: null })
  passwordResetExpiresAt: Date | null;

  // ─── Hospitality / Guest CDP & Staff Extensions ─────────────────────────

  @Prop({ type: String, trim: true, default: null })
  phoneE164: string | null;

  @Prop({ type: String, trim: true, default: null })
  lineUserId: string | null;

  @Prop({ type: Boolean, default: false })
  whatsappOptIn: boolean;

  @Prop({ type: String, enum: ["en", "th"], default: "en" })
  preferredLanguage: "en" | "th";

  @Prop({ type: String, default: null })
  nationalityCode: string | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: "Branch" }], default: [] })
  branchIds: Types.ObjectId[];

  @Prop({ type: String, default: null })
  jobTitle: string | null;

  @Prop({
    type: {
      lifetimeSpendThb: { type: Number, default: 0 },
      stayCount: { type: Number, default: 0 },
      orderCount: { type: Number, default: 0 },
      lastStayAt: { type: Date, default: null },
    },
    default: () => ({
      lifetimeSpendThb: 0,
      stayCount: 0,
      orderCount: 0,
      lastStayAt: null,
    }),
  })
  stats: {
    lifetimeSpendThb: number;
    stayCount: number;
    orderCount: number;
    lastStayAt: Date | null;
  };

  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  vipScore: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // ─── Admin module stubs ────────────────────────────────────────────────────
  // These fields are inactive without the admin module. Run `yulio add admin`
  // to enable moderation, suspension enforcement, and role management.
  // Safe to remove if you are not planning to use yulio's admin module.

  @Prop({ type: Boolean, default: false })
  isSuspended: boolean;

  @Prop({ type: String, default: null })
  suspensionReason: string | null;

  @Prop({ type: Date, default: null })
  suspendedAt: Date | null;

  // Injected by timestamps: true
  createdAt: Date;
  updatedAt: Date;

  @Prop({ type: String, default: null })
  stripeCustomerId: string | null;

  @Prop({ type: String, enum: PaymentPlanId, default: PaymentPlanId.FREE })
  plan: PaymentPlanId;

  @Prop({ type: Date, default: null })
  planExpiresAt: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

export const computeVipScore = (stats?: {
  lifetimeSpendThb?: number;
  stayCount?: number;
}): number =>
  Math.min(
    100,
    Math.min(60, Math.floor(((stats && stats.lifetimeSpendThb) || 0) / 1000)) +
      Math.min(40, ((stats && stats.stayCount) || 0) * 8),
  );

UserSchema.virtual("vipTier").get(function (this: UserDocument) {
  const s = this.vipScore || 0;
  return s >= 80 ? "PLATINUM" : s >= 50 ? "GOLD" : s >= 20 ? "SILVER" : "NONE";
});

UserSchema.pre("save", function (this: UserDocument) {
  if (this.isModified("stats")) {
    this.vipScore = computeVipScore(this.stats);
  }
});

// ─── Document Type ─────────────────────────────────────────────────────────────

// UserDocument is what Mongoose actually returns from queries.
// Use this as the return type in your service methods.
export type UserDocument = User & Document;

// ─── Indexes ───────────────────────────────────────────────────────────────────

// Compound index: quickly find a user by a specific OAuth provider + providerId.
// Used in findOrCreateOAuthUser() in user.service.ts.
UserSchema.index({ "providers.provider": 1, "providers.providerId": 1 });
// partial filter, not sparse: email defaults to explicit null (not absent),
// and a sparse index only exempts absent fields, so two nulls would still collide
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } },
);
UserSchema.index(
  { phoneE164: 1 },
  { unique: true, partialFilterExpression: { phoneE164: { $type: "string" } } },
);
UserSchema.index(
  { lineUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { lineUserId: { $type: "string" } },
  },
);
UserSchema.index({ role: 1, vipScore: -1 });
// Admin module stub index — inactive until `yulio add admin` is installed.
UserSchema.index({ isSuspended: 1, createdAt: -1 });
