import { LineKind, LineStatus } from "../../common/enums/order.enum";
import type { Order, OrderLine } from "../entity/order.entity";
import type {
  ChargeLineDto,
  OrderChargesDto,
} from "../dto/responses/order-charges.dto";

const DEAD = [LineStatus.CANCELLED, LineStatus.NO_SHOW];
const thb = (n: number) => `฿${Math.round(n).toLocaleString("en-US")}`;
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const localStart = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(d));

function chargeLine(line: OrderLine, timeZone: string): ChargeLineDto {
  const base = {
    lineId: line.lineId,
    kind: line.kind,
    amountThb: line.totalThb,
    status: DEAD.includes(line.status) ? line.status : undefined,
  };
  if (line.kind === LineKind.STAY && line.stay) {
    const rates = line.stay.nightlyRates ?? [];
    const flat =
      rates.length && rates.every((r) => r.rateThb === rates[0].rateThb);
    return {
      ...base,
      label:
        titleCase(line.stay.roomType) +
        (line.stay.assignedRoomNumber
          ? ` · room ${line.stay.assignedRoomNumber}`
          : ""),
      detail: flat
        ? `${line.stay.nights} ${line.stay.nights === 1 ? "night" : "nights"} × ${thb(rates[0].rateThb)}`
        : `${line.stay.nights} nights`,
    };
  }
  if (line.kind === LineKind.SERVICE && line.service) {
    const perUnit =
      line.quantity > 1
        ? ` · ${line.quantity} × ${thb(line.unitPriceThb)}`
        : "";
    return {
      ...base,
      label: line.service.serviceName,
      detail: `${localStart(line.startsAt, timeZone)}${perUnit}`,
    };
  }
  if (line.kind === LineKind.DINING && line.dining) {
    return {
      ...base,
      label: line.dining.restaurantName,
      detail: `${localStart(line.startsAt, timeZone)} · ${line.dining.partySize} guests`,
    };
  }
  return { ...base, label: line.title, detail: "" };
}

/** Folio breakdown straight from the order the schema already priced; no maths re-done client side. */
export function buildOrderCharges(
  order: Order,
  timeZone: string,
): OrderChargesDto {
  const lines = order.items.map((l) => chargeLine(l, timeZone));
  const live = order.items.filter((l) => !DEAD.includes(l.status));
  const sum = (kind: LineKind) =>
    live.filter((l) => l.kind === kind).reduce((n, l) => n + l.totalThb, 0);
  const t = order.totals;
  const paid = order.payment?.paidThb ?? 0;
  return {
    lines,
    roomsThb: sum(LineKind.STAY),
    servicesThb: sum(LineKind.SERVICE),
    diningThb: sum(LineKind.DINING),
    subtotalThb: t?.subtotalThb ?? 0,
    discountThb: t?.discountThb ?? 0,
    serviceChargeRate: t?.serviceChargeRate ?? 0.1,
    serviceChargeThb: t?.serviceChargeThb ?? 0,
    vatRate: t?.vatRate ?? 0.07,
    vatThb: t?.vatThb ?? 0,
    totalThb: t?.grandTotalThb ?? 0,
    paidThb: paid,
    dueThb: Math.max(0, (t?.grandTotalThb ?? 0) - paid),
    paymentMethod: order.payment?.method ?? "PAY_AT_HOTEL",
    paymentStatus: order.payment?.status ?? "UNPAID",
    payments: (order.payment?.entries ?? []).map((e) => ({
      amountThb: e.amountThb,
      method: e.method,
      reference: e.reference,
      receivedAt: e.receivedAt,
      receivedByName: e.receivedByName,
    })),
  };
}
