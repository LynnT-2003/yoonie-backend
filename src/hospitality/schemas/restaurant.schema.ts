import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { HHMM, ObjectIdType } from "../common/hospitality.types";

@Schema({ _id: false })
export class RestaurantTable {
  @Prop({ required: true })
  tableCode!: string;

  @Prop({ required: true, min: 1 })
  seats!: number;

  @Prop({ default: 1, min: 1 })
  minSeats!: number;

  @Prop({ default: "INDOOR" })
  zone!: string;

  @Prop({ default: false })
  isHighTop!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}
export const RestaurantTableSchema =
  SchemaFactory.createForClass(RestaurantTable);

@Schema({ _id: false })
export class MealShift {
  @Prop({ required: true })
  code!: string; // BREAKFAST, ALL_DAY, EVENING

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true, match: HHMM })
  startTime!: string;

  @Prop({ required: true, match: HHMM })
  endTime!: string;

  @Prop({ default: 60, min: 15 })
  slotLengthMin!: number;

  @Prop({ type: [Number], default: [0, 1, 2, 3, 4, 5, 6] })
  daysOfWeek!: number[];
}
export const MealShiftSchema = SchemaFactory.createForClass(MealShift);

/**
 * Tables are static config, so embedded. Bookable inventory for dining lives in inventory_slots
 * (kind DINING, capacity = seats) which keeps the booking path identical to rooms and tours.
 */
@Schema({ timestamps: true, collection: "restaurants" })
export class Restaurant {
  @Prop({ type: ObjectIdType, ref: "Branch", required: true })
  branchId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop()
  cuisine?: string;

  @Prop({ type: [RestaurantTableSchema], default: [] })
  tables!: RestaurantTable[];

  @Prop({ type: [MealShiftSchema], default: [] })
  shifts!: MealShift[];

  @Prop({ required: true, min: 1 })
  maxSeats!: number; // licensed / spec limit

  @Prop({ default: 0 })
  totalSeats!: number; // derived from active tables

  @Prop({ default: 90, min: 15 })
  avgTurnMinutes!: number;

  @Prop({ default: true })
  isActive!: boolean;
}

export type RestaurantDocument = HydratedDocument<Restaurant>;
export const RestaurantSchema = SchemaFactory.createForClass(Restaurant);
RestaurantSchema.index({ branchId: 1, code: 1 }, { unique: true });
RestaurantSchema.index({ branchId: 1, isActive: 1 });

RestaurantSchema.pre("validate", function (this: RestaurantDocument) {
  const codes = new Set<string>();
  for (const t of this.tables) {
    if (codes.has(t.tableCode)) {
      throw new Error(`duplicate tableCode ${t.tableCode}`);
    }
    codes.add(t.tableCode);
  }
  this.totalSeats = this.tables
    .filter((t) => t.isActive)
    .reduce((n, t) => n + t.seats, 0);
  if (this.totalSeats > this.maxSeats) {
    throw new Error(
      `seats ${this.totalSeats} exceed maxSeats ${this.maxSeats}`,
    );
  }
});
