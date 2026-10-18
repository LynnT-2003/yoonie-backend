import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema({ _id: false })
export class BranchSettings {
  @Prop({ default: "14:00" })
  checkInTime!: string;

  @Prop({ default: "12:00" })
  checkOutTime!: string;

  @Prop({ default: 0.07, min: 0, max: 1 })
  vatRate!: number;

  @Prop({ default: 0.1, min: 0, max: 1 })
  serviceChargeRate!: number;

  /** how long a checkout holds inventory before the sweeper releases it */
  @Prop({ default: 15, min: 1 })
  holdTtlMinutes!: number;

  /** tours below this fill rate get flagged for consolidation */
  @Prop({ default: 0.4, min: 0, max: 1 })
  consolidationThreshold!: number;

  @Prop({ default: "05:30" })
  dispatchGenerationTime!: string;
}
export const BranchSettingsSchema =
  SchemaFactory.createForClass(BranchSettings);

@Schema({ _id: false })
export class BranchAddress {
  @Prop({ type: String })
  line1?: string;

  @Prop({ type: String })
  district?: string;

  @Prop({ type: String })
  city?: string;

  @Prop({ type: String, default: "TH" })
  countryCode!: string;

  @Prop({ type: String })
  postalCode?: string;

  @Prop({ type: [Number], default: undefined })
  geo?: [number, number]; // [lng, lat]
}
export const BranchAddressSchema = SchemaFactory.createForClass(BranchAddress);

/**
 * Branch Document Schema Example:
 * -------------------------------------------------------------
 * {
 *   "_id": ObjectId("665a1b2c3d4e5f6a7b8c9d0e"),
 *   "code": "BKK-RIVERSIDE",
 *   "name": "BKK Riverside Boutique Hotel",
 *   "timezone": "Asia/Bangkok",
 *   "currency": "THB",
 *   "address": {
 *     "line1": "25 Charoen Krung Soi 30, Bang Rak",
 *     "district": "Bang Rak",
 *     "city": "Bangkok",
 *     "countryCode": "TH",
 *     "postalCode": "10500",
 *     "geo": [100.5134, 13.7279]
 *   },
 *   "contactPhoneE164": "+6620001234",
 *   "contactEmail": "stay@riverside-bkk.example",
 *   "settings": {
 *     "checkInTime": "14:00",
 *     "checkOutTime": "12:00",
 *     "vatRate": 0.07,
 *     "serviceChargeRate": 0.1,
 *     "holdTtlMinutes": 15,
 *     "consolidationThreshold": 0.4,
 *     "dispatchGenerationTime": "05:30"
 *   },
 *   "isActive": true,
 *   "createdAt": ISODate("2026-10-18T00:00:00.000Z"),
 *   "updatedAt": ISODate("2026-10-18T00:00:00.000Z")
 * }
 * -------------------------------------------------------------
 */
@Schema({ timestamps: true, collection: "branches" })
export class Branch {
  @Prop({
    required: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9-]{3,32}$/,
  })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    required: true,
    default: "Asia/Bangkok",
    validate: {
      validator: (tz: string) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      message: "invalid IANA timezone",
    },
  })
  timezone!: string;

  @Prop({ default: "THB", uppercase: true, minlength: 3, maxlength: 3 })
  currency!: string;

  @Prop({ type: BranchAddressSchema })
  address?: BranchAddress;

  @Prop({ type: String })
  contactPhoneE164?: string;

  @Prop({ type: String, lowercase: true })
  contactEmail?: string;

  @Prop({ type: String })
  logoUrl?: string;

  @Prop({ type: String })
  heroImageUrl?: string;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: BranchSettingsSchema, default: () => ({}) })
  settings!: BranchSettings;

  @Prop({ default: true })
  isActive!: boolean;
}

export type BranchDocument = HydratedDocument<Branch>;
export const BranchSchema = SchemaFactory.createForClass(Branch);
BranchSchema.index({ code: 1 }, { unique: true });
