import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class BranchSettings {
  @Prop({ default: '14:00' }) checkInTime!: string;
  @Prop({ default: '12:00' }) checkOutTime!: string;
  @Prop({ default: 0.07, min: 0, max: 1 }) vatRate!: number;
  @Prop({ default: 0.1, min: 0, max: 1 }) serviceChargeRate!: number;
  /** how long a checkout holds inventory before the sweeper releases it */
  @Prop({ default: 15, min: 1 }) holdTtlMinutes!: number;
  /** tours below this fill rate get flagged for consolidation */
  @Prop({ default: 0.4, min: 0, max: 1 }) consolidationThreshold!: number;
  @Prop({ default: '05:30' }) dispatchGenerationTime!: string;
}
export const BranchSettingsSchema = SchemaFactory.createForClass(BranchSettings);

@Schema({ _id: false })
export class BranchAddress {
  @Prop() line1?: string;
  @Prop() district?: string;
  @Prop() city?: string;
  @Prop({ default: 'TH' }) countryCode!: string;
  @Prop() postalCode?: string;
  @Prop({ type: [Number], default: undefined }) geo?: [number, number]; // [lng, lat]
}
export const BranchAddressSchema = SchemaFactory.createForClass(BranchAddress);

@Schema({ timestamps: true, collection: 'branches' })
export class Branch {
  @Prop({ required: true, uppercase: true, trim: true, match: /^[A-Z0-9-]{3,32}$/ }) code!: string;
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({
    required: true,
    default: 'Asia/Bangkok',
    validate: {
      validator: (tz: string) => {
        try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
      },
      message: 'invalid IANA timezone',
    },
  })
  timezone!: string;
  @Prop({ default: 'THB', uppercase: true, minlength: 3, maxlength: 3 }) currency!: string;
  @Prop({ type: BranchAddressSchema }) address?: BranchAddress;
  @Prop() contactPhoneE164?: string;
  @Prop({ lowercase: true }) contactEmail?: string;
  @Prop({ type: BranchSettingsSchema, default: () => ({}) }) settings!: BranchSettings;
  @Prop({ default: true }) isActive!: boolean;
}
export type BranchDocument = HydratedDocument<Branch>;
export const BranchSchema = SchemaFactory.createForClass(Branch);
BranchSchema.index({ code: 1 }, { unique: true });
