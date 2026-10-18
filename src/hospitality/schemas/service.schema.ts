import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import {
  PricingModel,
  ServiceCategory,
  ServiceKind,
} from "../common/hospitality.enums";
import { ObjectIdType } from "../common/hospitality.types";

@Schema({ _id: false })
export class Vehicle {
  @Prop({ required: true })
  plate!: string;

  @Prop({ default: "MINIVAN" })
  type!: string;

  @Prop({ required: true, min: 1 })
  capacityPax!: number;

  @Prop({ type: ObjectIdType, ref: "HospitalityUser" })
  defaultDriverId?: Types.ObjectId;

  @Prop({ default: true })
  isActive!: boolean;
}
export const VehicleSchema = SchemaFactory.createForClass(Vehicle);

@Schema({ _id: false })
export class TransferConfig {
  @Prop({ default: "BKK" })
  airportCode!: string;

  @Prop({ default: "Suvarnabhumi Airport" })
  airportName!: string;

  @Prop({ type: [VehicleSchema], default: [] })
  vehicles!: Vehicle[];

  @Prop({ default: true })
  flightTrackingEnabled!: boolean;

  @Prop({ default: 60, min: 0 })
  leadTimeMin!: number;

  /** arrivals meeting door numbers used on pickup cards */
  @Prop({ type: [Number], default: [3, 4] })
  meetingDoors!: number[];
}
export const TransferConfigSchema =
  SchemaFactory.createForClass(TransferConfig);

@Schema({ _id: false })
export class TourConfig {
  @Prop({ required: true, min: 1 })
  capacity!: number;

  @Prop({ required: true, min: 1 })
  minViablePax!: number;

  @Prop({ required: true, min: 0 })
  fixedCostThb!: number;

  @Prop({ type: [String], default: [] })
  departureTimes!: string[]; // HH:mm, branch tz

  @Prop({ default: 120, min: 1 })
  durationMin!: number;

  @Prop({ default: 6, min: 0 })
  cutoffHoursBeforeDeparture!: number;

  @Prop()
  meetingPoint?: string;
}
export const TourConfigSchema = SchemaFactory.createForClass(TourConfig);

@Schema({ _id: false })
export class WellnessConfig {
  @Prop({ required: true, min: 1 })
  treatmentRooms!: number;

  @Prop({ required: true, min: 1 })
  therapists!: number;

  @Prop({ default: 60, min: 15 })
  durationMin!: number;

  @Prop({ default: 15, min: 0 })
  turnoverMin!: number;

  @Prop({ type: [String], default: [] })
  startTimes!: string[];
}
export const WellnessConfigSchema =
  SchemaFactory.createForClass(WellnessConfig);

@Schema({ timestamps: true, collection: "services" })
export class Service {
  @Prop({ type: ObjectIdType, ref: "Branch", required: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  code!: string;

  @Prop({ type: String, enum: Object.values(ServiceCategory), required: true })
  category!: ServiceCategory;

  @Prop({ type: String, enum: Object.values(ServiceKind), required: true })
  kind!: ServiceKind;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 0 })
  basePriceThb!: number;

  @Prop({ type: String, enum: Object.values(PricingModel), required: true })
  pricingModel!: PricingModel;

  @Prop({ type: TourConfigSchema })
  tour?: TourConfig;

  @Prop({ type: WellnessConfigSchema })
  wellness?: WellnessConfig;

  @Prop({ type: TransferConfigSchema })
  transfer?: TransferConfig;

  @Prop({ default: true })
  isActive!: boolean;
}

export type ServiceDocument = HydratedDocument<Service> & {
  concurrentCapacity: number;
};
export const ServiceSchema = SchemaFactory.createForClass(Service);
ServiceSchema.index({ branchId: 1, code: 1 }, { unique: true });
ServiceSchema.index({ branchId: 1, category: 1, isActive: 1 });

/** wellness can only run as many parallel sessions as it has rooms AND therapists */
ServiceSchema.virtual("concurrentCapacity").get(function (
  this: ServiceDocument,
) {
  if (this.wellness)
    return Math.min(this.wellness.treatmentRooms, this.wellness.therapists);
  if (this.tour) return this.tour.capacity;
  if (this.transfer)
    return this.transfer.vehicles.filter((v) => v.isActive).length;
  return 0;
});

ServiceSchema.pre("validate", function (this: ServiceDocument) {
  const want = {
    [ServiceKind.SCHEDULED_TOUR]: "tour",
    [ServiceKind.SPA_TREATMENT]: "wellness",
    [ServiceKind.AIRPORT_TRANSFER]: "transfer",
  } as const;
  const need = want[this.kind];
  if (!this[need]) {
    throw new Error(`service kind ${this.kind} requires ${need} config`);
  }
  if (this.tour && this.tour.minViablePax > this.tour.capacity) {
    throw new Error("minViablePax cannot exceed capacity");
  }
  const categoryOk: Record<ServiceKind, ServiceCategory> = {
    [ServiceKind.SCHEDULED_TOUR]: ServiceCategory.TOURS,
    [ServiceKind.SPA_TREATMENT]: ServiceCategory.WELLNESS,
    [ServiceKind.AIRPORT_TRANSFER]: ServiceCategory.TRANSPORT,
  };
  if (categoryOk[this.kind] !== this.category) {
    throw new Error(
      `kind ${this.kind} does not belong in category ${this.category}`,
    );
  }
});
