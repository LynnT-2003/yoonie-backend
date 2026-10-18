import { randomBytes, randomUUID } from 'crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { LineKind, LineStatus, OrderStatus, RoomTypeCode, ServiceKind } from '../common/enums';
import { BUSINESS_DATE, E164, ObjectIdType } from '../common/types';

const ENUM = <T extends object>(e: T) => Object.values(e);

/* ---------- line item details (exactly one is present per line, enforced in pre-validate) ---------- */
@Schema({ _id: false })
export class NightlyRate {
  @Prop({ required: true, match: BUSINESS_DATE }) date!: string;
  @Prop({ required: true, min: 0 }) rateThb!: number;
}
export const NightlyRateSchema = SchemaFactory.createForClass(NightlyRate);

@Schema({ _id: false })
export class StayDetail {
  @Prop({ type: String, enum: ENUM(RoomTypeCode), required: true }) roomType!: RoomTypeCode;
  @Prop({ type: ObjectIdType, ref: 'Room' }) assignedRoomId?: Types.ObjectId;
  @Prop() assignedRoomNumber?: string;
  @Prop({ required: true, match: BUSINESS_DATE }) checkInDate!: string;
  @Prop({ required: true, match: BUSINESS_DATE }) checkOutDate!: string;
  @Prop({ required: true, min: 1 }) nights!: number;
  @Prop({ required: true, min: 1 }) adults!: number;
  @Prop({ default: 0, min: 0 }) children!: number;
  @Prop({ type: [NightlyRateSchema], default: [] }) nightlyRates!: NightlyRate[];
}
export const StayDetailSchema = SchemaFactory.createForClass(StayDetail);

@Schema({ _id: false })
export class DiningDetail {
  @Prop({ type: ObjectIdType, ref: 'Restaurant', required: true }) restaurantId!: Types.ObjectId;
  @Prop({ required: true }) restaurantName!: string;
  @Prop({ required: true }) shiftCode!: string;
  @Prop({ required: true, min: 1 }) partySize!: number;
  @Prop() tableCode?: string;
  @Prop() notes?: string;
}
export const DiningDetailSchema = SchemaFactory.createForClass(DiningDetail);

@Schema({ _id: false })
export class FlightInfo {
  @Prop({ required: true, uppercase: true, trim: true }) number!: string;
  @Prop({ type: String, enum: ['ARRIVAL', 'DEPARTURE'], required: true }) direction!: 'ARRIVAL' | 'DEPARTURE';
  @Prop({ type: Date, required: true }) scheduledAt!: Date;
  /** updated by flight tracking. dispatch reads THIS, not scheduledAt */
  @Prop({ type: Date }) estimatedAt?: Date;
  @Prop() terminal?: string;
  @Prop() gate?: string;
  @Prop() meetingDoor?: number;
}
export const FlightInfoSchema = SchemaFactory.createForClass(FlightInfo);

@Schema({ _id: false })
export class ServiceDetail {
  @Prop({ type: ObjectIdType, ref: 'Service', required: true }) serviceId!: Types.ObjectId;
  @Prop({ required: true }) serviceName!: string;
  @Prop({ type: String, enum: ENUM(ServiceKind), required: true }) serviceKind!: ServiceKind;
  @Prop({ required: true, min: 1 }) pax!: number;
  @Prop({ type: FlightInfoSchema }) flight?: FlightInfo;
  @Prop() vehiclePlate?: string;
  @Prop({ type: ObjectIdType, ref: 'User' }) driverUserId?: Types.ObjectId;
}
export const ServiceDetailSchema = SchemaFactory.createForClass(ServiceDetail);

/* ---------- price evolution hooks: dynamic pricing, promos, upsell ---------- */
@Schema({ _id: false })
export class PriceAdjustment {
  @Prop({ required: true }) code!: string;          // EARLY_BIRD, WEEKEND_UPLIFT, VIP_DISCOUNT
  @Prop({ required: true }) label!: string;
  @Prop({ required: true }) deltaThb!: number;      // negative = discount
}
export const PriceAdjustmentSchema = SchemaFactory.createForClass(PriceAdjustment);

@Schema({ _id: false })
export class SlotRef {
  @Prop({ required: true }) slotKey!: string;
  @Prop({ required: true, min: 1 }) qty!: number;
}
export const SlotRefSchema = SchemaFactory.createForClass(SlotRef);

@Schema({ _id: false })
export class OrderLine {
  /** stable id so a single line can be cancelled / replaced without positional array updates */
  @Prop({ default: () => randomUUID() }) lineId!: string;
  @Prop({ type: String, enum: ENUM(LineKind), required: true }) kind!: LineKind;
  @Prop({ type: String, enum: ENUM(LineStatus), default: LineStatus.PENDING }) status!: LineStatus;
  @Prop({ required: true }) title!: string;
  @Prop({ default: 1, min: 1 }) quantity!: number;
  @Prop({ required: true, min: 0 }) unitPriceThb!: number;
  @Prop({ default: 0 }) totalThb!: number;
  /** first moment this line needs operational attention + its business date. denormalised for the ops indexes */
  @Prop({ type: Date, required: true }) startsAt!: Date;
  @Prop({ type: Date }) endsAt?: Date;
  @Prop({ required: true, match: BUSINESS_DATE }) businessDate!: string;
  @Prop({ type: [SlotRefSchema], default: [] }) slotRefs!: SlotRef[];
  @Prop({ type: StayDetailSchema }) stay?: StayDetail;
  @Prop({ type: DiningDetailSchema }) dining?: DiningDetail;
  @Prop({ type: ServiceDetailSchema }) service?: ServiceDetail;

  @Prop({ type: [PriceAdjustmentSchema], default: [] }) adjustments!: PriceAdjustment[];
  @Prop() ratePlanCode?: string;
  /** upgrade = new line with supersedesLineId pointing at the cancelled one. full audit, zero mutation of history */
  @Prop() supersedesLineId?: string;
  @Prop({ type: Date }) cancelledAt?: Date;
  @Prop() cancelReason?: string;
  @Prop({ default: 0, min: 0 }) refundThb!: number;
}
export const OrderLineSchema = SchemaFactory.createForClass(OrderLine);

/* ---------- order level ---------- */
@Schema({ _id: false })
export class Attribution {
  @Prop({ lowercase: true, trim: true }) utmSource?: string;
  @Prop({ lowercase: true, trim: true }) utmMedium?: string;
  @Prop({ trim: true }) utmCampaign?: string;
  @Prop({ trim: true }) utmContent?: string;
  @Prop() referrer?: string;
  @Prop() landingPath?: string;
  @Prop({ default: 'DIRECT_WEB' }) channel!: string; // DIRECT_WEB, FRONT_DESK, WHATSAPP, LINE
}
export const AttributionSchema = SchemaFactory.createForClass(Attribution);

@Schema({ _id: false })
export class GuestSnapshot {
  @Prop({ required: true }) fullName!: string;
  @Prop() email?: string;
  @Prop({ match: E164 }) phoneE164?: string;
  @Prop() lineUserId?: string;
  @Prop({ type: String, enum: ['en', 'th'], default: 'en' }) preferredLanguage!: 'en' | 'th';
}
export const GuestSnapshotSchema = SchemaFactory.createForClass(GuestSnapshot);

@Schema({ _id: false })
export class OrderTotals {
  @Prop({ default: 0 }) subtotalThb!: number;
  @Prop({ default: 0 }) discountThb!: number;
  @Prop({ default: 0.1 }) serviceChargeRate!: number;
  @Prop({ default: 0 }) serviceChargeThb!: number;
  @Prop({ default: 0.07 }) vatRate!: number;
  @Prop({ default: 0 }) vatThb!: number;
  @Prop({ default: 0 }) grandTotalThb!: number;
}
export const OrderTotalsSchema = SchemaFactory.createForClass(OrderTotals);

@Schema({ _id: false })
export class OrderWindow {
  @Prop({ type: Date }) from?: Date;
  @Prop({ type: Date }) to?: Date;
}
export const OrderWindowSchema = SchemaFactory.createForClass(OrderWindow);

@Schema({ _id: false })
export class PaymentInfo {
  @Prop({ type: String, enum: ['UNPAID', 'DEPOSIT', 'PAID', 'REFUNDED'], default: 'UNPAID' }) status!: string;
  @Prop() method?: string;
  @Prop({ default: 0, min: 0 }) paidThb!: number;
  @Prop() providerRef?: string;
}
export const PaymentInfoSchema = SchemaFactory.createForClass(PaymentInfo);

export const genOrderNumber = (now = new Date()): string => {
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
  return `TS-${yymmdd}-${rand}`;
};

@Schema({ timestamps: true, collection: 'orders', optimisticConcurrency: true })
export class Order {
  @Prop({ default: () => genOrderNumber() }) orderNumber!: string;
  @Prop({ type: ObjectIdType, ref: 'Branch', required: true }) branchId!: Types.ObjectId;
  @Prop({ type: ObjectIdType, ref: 'User', required: true }) guestId!: Types.ObjectId;
  @Prop({ type: GuestSnapshotSchema, required: true }) guestSnapshot!: GuestSnapshot;
  @Prop({ type: String, enum: ENUM(OrderStatus), default: OrderStatus.PENDING, required: true }) status!: OrderStatus;
  @Prop({ type: [OrderLineSchema], validate: (v: unknown[]) => v.length > 0 }) items!: OrderLine[];
  @Prop({ type: AttributionSchema, default: () => ({}) }) attribution!: Attribution;
  @Prop({ type: OrderTotalsSchema, default: () => ({}) }) totals!: OrderTotals;
  @Prop({ type: OrderWindowSchema, default: () => ({}) }) window!: OrderWindow;
  @Prop({ type: PaymentInfoSchema, default: () => ({}) }) payment!: PaymentInfo;
  @Prop({ type: [PriceAdjustmentSchema], default: [] }) orderAdjustments!: PriceAdjustment[];
  @Prop({ type: ObjectIdType, ref: 'InventoryHold' }) holdId?: Types.ObjectId;
  /** client generated, makes POST /orders safely retryable */
  @Prop() idempotencyKey?: string;
  @Prop({ type: Date }) cancelledAt?: Date;
}
export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ orderNumber: 1 }, { unique: true });
OrderSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
OrderSchema.index({ guestId: 1, createdAt: -1 });                               // guest history / CDP
OrderSchema.index({ branchId: 1, status: 1, createdAt: -1 });                    // admin order list
// ops: "every line happening on day D of kind K" (multikey over one array, so all three paths are legal in one index)
OrderSchema.index({ branchId: 1, 'items.businessDate': 1, 'items.kind': 1, 'items.status': 1 });
// transfer + flight lookups (pickup cards, flight delay fan-out)
OrderSchema.index({ 'items.service.flight.number': 1, 'items.businessDate': 1 }, { sparse: true });
// attribution rollup, covered: match branch/status/date, group by source/campaign, sum total. no FETCH needed
OrderSchema.index({
  branchId: 1, status: 1, createdAt: 1,
  'attribution.utmSource': 1, 'attribution.utmCampaign': 1, 'totals.grandTotalThb': 1,
});

const active = (l: OrderLine) => l.status !== LineStatus.CANCELLED;

OrderSchema.pre('validate', async function (this: OrderDocument) {
  for (const l of this.items) {
    const detail = { [LineKind.STAY]: l.stay, [LineKind.DINING]: l.dining, [LineKind.SERVICE]: l.service }[l.kind];
    if (!detail) throw new Error(`line ${l.lineId}: ${l.kind} line requires its ${l.kind.toLowerCase()} detail`);
    if (l.kind === LineKind.STAY && l.stay) {
      if (l.stay.nightlyRates.length !== l.stay.nights) throw new Error(`line ${l.lineId}: nightlyRates must have one entry per night`);
      l.unitPriceThb = l.stay.nightlyRates.reduce((n, r) => n + r.rateThb, 0);
    }
    const adj = l.adjustments.reduce((n, a) => n + a.deltaThb, 0);
    l.totalThb = Math.max(0, l.unitPriceThb * l.quantity + adj);
  }

  const live = this.items.filter(active);
  const subtotal = live.reduce((n, l) => n + l.totalThb, 0);
  const discount = Math.max(0, -this.orderAdjustments.reduce((n, a) => n + a.deltaThb, 0));
  const net = Math.max(0, subtotal - discount);
  const t = this.totals;
  t.subtotalThb = subtotal;
  t.discountThb = discount;
  t.serviceChargeThb = Math.round(net * t.serviceChargeRate);
  t.vatThb = Math.round((net + t.serviceChargeThb) * t.vatRate);
  t.grandTotalThb = net + t.serviceChargeThb + t.vatThb;

  if (live.length) {
    this.window.from = new Date(Math.min(...live.map((l) => l.startsAt.getTime())));
    this.window.to = new Date(Math.max(...live.map((l) => (l.endsAt ?? l.startsAt).getTime())));
  }

  // lifecycle derivations that must never drift from line state
  if (this.items.length && !live.length) {
    this.status = OrderStatus.CANCELLED;
    this.cancelledAt ??= new Date();
  } else if (live.length && live.every((l) => l.status === LineStatus.COMPLETED || l.status === LineStatus.NO_SHOW)) {
    this.status = OrderStatus.COMPLETED;
  }
});
