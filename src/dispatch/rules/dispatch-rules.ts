import { hhmm, minutesOfDay } from "../../common/helpers/time.helper";

/** earliest arrival gets the highest score. VIP adds a bump so they win ties inside a 50 min window */
export const housekeepingPriority = (etaAt: Date, isVip: boolean): number =>
  Math.max(0, 1440 - minutesOfDay(etaAt)) + (isVip ? 50 : 0);

export const pickupPriority = (etaAt: Date): number =>
  Math.max(0, 1440 - minutesOfDay(etaAt));

export interface ConsolidationInput {
  booked: number;
  capacity: number;
  minViablePax: number;
  fixedCostThb: number;
  unitPriceThb: number;
}

export interface ConsolidationResult {
  flag: boolean;
  fillRate: number;
  severity: "WARN" | "CRITICAL";
  recommendation: "MERGE_OR_CANCEL" | "WATCH";
  revenueThb: number;
  projectedLossThb: number;
  priorityScore: number;
}

export const evaluateConsolidation = (
  i: ConsolidationInput,
  threshold = 0.4,
): ConsolidationResult => {
  const fillRate = i.capacity ? i.booked / i.capacity : 0;
  const belowMin = i.booked < i.minViablePax;
  const revenueThb = i.booked * i.unitPriceThb;
  return {
    flag: fillRate < threshold,
    fillRate,
    severity: belowMin ? "CRITICAL" : "WARN",
    recommendation: belowMin ? "MERGE_OR_CANCEL" : "WATCH",
    revenueThb,
    projectedLossThb: Math.max(0, i.fixedCostThb - revenueThb),
    priorityScore: Math.round(
      800 + (1 - fillRate) * 100 + (belowMin ? 100 : 0),
    ),
  };
};

export interface PickupCardInput {
  hotelName: string;
  guestName: string;
  flightNumber: string;
  etaAt: Date;
  meetingDoor: number;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
}

/** bilingual card, plain text so it works unchanged on WhatsApp and LINE */
export const buildPickupCard = (
  i: PickupCardInput,
): { en: string; th: string } => ({
  en: [
    `Welcome to ${i.hotelName}, ${i.guestName}!`,
    `Your driver will meet you at Suvarnabhumi Airport (BKK).`,
    `Flight: ${i.flightNumber} | ETA ${hhmm(i.etaAt)}`,
    `Meeting point: Arrivals, Door ${i.meetingDoor}, Level 1`,
    `Driver: ${i.driverName} (${i.driverPhone})`,
    `Vehicle: white minivan, plate ${i.vehiclePlate}`,
  ].join("\n"),
  th: [
    `ยินดีต้อนรับสู่ ${i.hotelName} คุณ ${i.guestName}`,
    `คนขับรอรับท่านที่สนามบินสุวรรณภูมิ (BKK)`,
    `เที่ยวบิน: ${i.flightNumber} | เวลาถึง ${hhmm(i.etaAt)}`,
    `จุดนัดพบ: ผู้โดยสารขาเข้า ประตู ${i.meetingDoor} ชั้น 1`,
    `คนขับ: ${i.driverName} (${i.driverPhone})`,
    `รถตู้สีขาว ทะเบียน ${i.vehiclePlate}`,
  ].join("\n"),
});
