import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { HospitalityUserRole } from "../common/hospitality.enums";
import { E164, ObjectIdType } from "../common/hospitality.types";

@Schema({ _id: false })
export class GuestStats {
  @Prop({ default: 0, min: 0 })
  lifetimeSpendThb!: number;

  @Prop({ default: 0, min: 0 })
  stayCount!: number;

  @Prop({ default: 0, min: 0 })
  orderCount!: number;

  @Prop({ type: Date })
  lastStayAt?: Date;
}
export const GuestStatsSchema = SchemaFactory.createForClass(GuestStats);

@Schema({ _id: false })
export class FirstTouch {
  @Prop()
  utmSource?: string;

  @Prop()
  utmCampaign?: string;

  @Prop()
  referrer?: string;

  @Prop({ type: Date })
  at?: Date;
}
export const FirstTouchSchema = SchemaFactory.createForClass(FirstTouch);

@Schema({ timestamps: true, collection: "hospitality_users" })
export class HospitalityUser {
  @Prop({
    type: String,
    enum: Object.values(HospitalityUserRole),
    default: HospitalityUserRole.GUEST,
    required: true,
  })
  role!: HospitalityUserRole;

  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ lowercase: true, trim: true, match: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ })
  email?: string;

  @Prop({ trim: true, match: E164 })
  phoneE164?: string;

  @Prop({ trim: true })
  lineUserId?: string;

  @Prop({ default: false })
  whatsappOptIn!: boolean;

  @Prop({ type: String, enum: ["en", "th"], default: "en" })
  preferredLanguage!: "en" | "th";

  @Prop()
  nationalityCode?: string;

  /** staff only. empty for guests. an ADMIN with [] means all branches */
  @Prop({ type: [ObjectIdType], ref: "Branch", default: [] })
  branchIds!: Types.ObjectId[];

  @Prop()
  jobTitle?: string; // DRIVER, HOUSEKEEPER, GUIDE, THERAPIST

  @Prop({ select: false })
  passwordHash?: string;

  @Prop({ type: GuestStatsSchema, default: () => ({}) })
  stats!: GuestStats;

  /** 0..100, recomputed in pre('save'). see note there about bulk updates */
  @Prop({ default: 0, min: 0, max: 100 })
  vipScore!: number;

  @Prop({ type: FirstTouchSchema })
  firstTouch?: FirstTouch;

  @Prop({ default: true })
  isActive!: boolean;
}

export type HospitalityUserDocument = HydratedDocument<HospitalityUser>;
export const HospitalityUserSchema =
  SchemaFactory.createForClass(HospitalityUser);

// identity lookups. partial so many guests can legitimately have no email / no line id
const present = (f: string) => ({
  partialFilterExpression: { [f]: { $type: "string" } },
});
HospitalityUserSchema.index(
  { email: 1 },
  { unique: true, ...present("email") },
);
HospitalityUserSchema.index(
  { phoneE164: 1 },
  { unique: true, ...present("phoneE164") },
);
HospitalityUserSchema.index(
  { lineUserId: 1 },
  { unique: true, ...present("lineUserId") },
);
HospitalityUserSchema.index({ role: 1, isActive: 1, branchIds: 1 }); // staff pickers, dispatch assignment
HospitalityUserSchema.index({ role: 1, vipScore: -1 }); // VIP arrival lists

HospitalityUserSchema.virtual("vipTier").get(function (
  this: HospitalityUserDocument,
) {
  const s = this.vipScore;
  return s >= 80 ? "PLATINUM" : s >= 50 ? "GOLD" : s >= 20 ? "SILVER" : "NONE";
});

HospitalityUserSchema.pre("validate", function (this: HospitalityUserDocument) {
  if (this.role === HospitalityUserRole.GUEST) {
    if (!this.email && !this.phoneE164 && !this.lineUserId) {
      throw new Error("guest needs at least one contact channel");
    }
  } else if (!this.email) {
    throw new Error("staff accounts require an email");
  }
});

/**
 * vip = 1 point per ฿1,000 lifetime spend (cap 60) + 8 per stay (cap 40).
 * pre('save') does NOT fire for updateOne / $inc. if you maintain stats with $inc, recompute vipScore
 * in the same update with an aggregation pipeline, or run a nightly job. keep this formula in one place.
 */
export const computeVipScore = (s: GuestStats): number =>
  Math.min(
    100,
    Math.min(60, Math.floor((s.lifetimeSpendThb || 0) / 1000)) +
      Math.min(40, (s.stayCount || 0) * 8),
  );

HospitalityUserSchema.pre("save", function (this: HospitalityUserDocument) {
  if (this.isModified("stats")) {
    this.vipScore = computeVipScore(this.stats);
  }
});

// Domain aliases
export { HospitalityUser as User };
export { HospitalityUserDocument as UserDocument };
export { HospitalityUserSchema as UserSchema };
