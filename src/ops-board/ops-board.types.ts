import type { OrderChargesDto } from "../order/dto/responses/order-charges.dto";

/** A booking sitting in a service slot. */
export interface SlotBooking {
  orderId: string;
  orderNumber: string;
  lineId: string;
  guestName: string;
  roomNumber?: string;
  pax: number;
  amountThb: number;
  paymentStatus: string;
  flightNumber?: string;
  flightTime?: string;
}

export interface ServiceSlotView {
  startsAt: Date;
  time: string;
  capacity: number;
  booked: number;
  held: number;
  available: number;
  fillRate: number;
  /** tours only: below this the departure loses money */
  minViablePax?: number;
  belowMinimum: boolean;
  /** cost of running the departure; only counted once someone is booked */
  fixedCostThb: number;
  revenueThb: number;
  marginThb: number;
  bookings: SlotBooking[];
}

export interface ServiceDayView {
  date: string;
  /** seats / treatments offered; null for transfers, which run on demand */
  offered: number | null;
  sold: number;
  utilization: number | null;
}

export interface ServiceBoardItem {
  serviceId: string;
  kind: string;
  name: string;
  priceThb: number;
  pricingModel: string;
  unit: "seat" | "treatment" | "pickup";
  /** vans for transfers, seats per departure for tours, parallel treatments for spa */
  capacityPerSlot: number;
  slots: ServiceSlotView[];
  today: ServiceDayView & {
    revenueThb: number;
    fixedCostThb: number;
    marginThb: number;
  };
  week: ServiceDayView[];
}

export interface ServicesBoard {
  date: string;
  timezone: string;
  days: string[];
  summary: {
    revenueThb: number;
    fixedCostThb: number;
    marginThb: number;
    seatsOffered: number;
    seatsSold: number;
    utilization: number;
    unsoldSeats: number;
    belowMinimum: number;
    projectedLossThb: number;
    pickups: number;
    fleetSize: number;
  };
  services: ServiceBoardItem[];
}

export type GuestStatus = "ARRIVING" | "IN_HOUSE" | "DEPARTING" | "UPCOMING";

export interface GuestView {
  guestId: string;
  name: string;
  email?: string;
  phone?: string;
  lineUserId?: string;
  language: string;
  nationality?: string;
  vipTier: string;
  vipScore: number;
  stayCount: number;
  lifetimeSpendThb: number;
  isReturning: boolean;
  status: GuestStatus;
  nextDate: string;
  stays: {
    orderId: string;
    orderNumber: string;
    roomNumber?: string;
    roomType: string;
    checkInDate: string;
    checkOutDate: string;
    nights: number;
    pax: number;
  }[];
  services: {
    orderId: string;
    lineId: string;
    name: string;
    kind: string;
    date: string;
    time: string;
    pax: number;
    amountThb: number;
    flightNumber?: string;
  }[];
  folios: { orderId: string; orderNumber: string; charges: OrderChargesDto }[];
  dueThb: number;
}

export interface GuestsBoard {
  date: string;
  timezone: string;
  summary: {
    inHouse: number;
    arriving: number;
    departing: number;
    upcoming: number;
    vipInHouse: number;
    returning: number;
    outstandingThb: number;
  };
  guests: GuestView[];
}
