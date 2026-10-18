import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  LineKind,
  LineStatus,
  OrderStatus,
} from "../../../common/enums/order.enum";
import { RoomTypeCode } from "../../../common/enums/room-type.enum";
import { ServiceKind } from "../../../common/enums/service.enum";

export class GuestSnapshotResponseDto {
  @ApiProperty({ example: "Sarah Jenkins" })
  fullName!: string;

  @ApiPropertyOptional({ example: "sarah.j@example.com" })
  email?: string;

  @ApiPropertyOptional({ example: "+66812345678" })
  phoneE164?: string;

  @ApiPropertyOptional({ example: "U1234567890abcdef" })
  lineUserId?: string;

  @ApiProperty({ example: "en" })
  preferredLanguage!: string;
}

export class OrderTotalsResponseDto {
  @ApiProperty({ example: 4400 })
  subtotalThb!: number;

  @ApiProperty({ example: 0 })
  discountThb!: number;

  @ApiProperty({ example: 0.1 })
  serviceChargeRate!: number;

  @ApiProperty({ example: 440 })
  serviceChargeThb!: number;

  @ApiProperty({ example: 0.07 })
  vatRate!: number;

  @ApiProperty({ example: 338.8 })
  vatThb!: number;

  @ApiProperty({ example: 5178.8 })
  grandTotalThb!: number;
}

export class PaymentInfoResponseDto {
  @ApiProperty({ example: "PAID" })
  status!: string;

  @ApiPropertyOptional({ example: "STRIPE" })
  method?: string;

  @ApiProperty({ example: 5178.8 })
  paidThb!: number;

  @ApiPropertyOptional({ example: "ch_3Lkd2kL4k2j" })
  providerRef?: string;
}

export class StayDetailResponseDto {
  @ApiProperty({ enum: RoomTypeCode, example: RoomTypeCode.STANDARD_KING })
  roomType!: RoomTypeCode;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d1a" })
  assignedRoomId?: string;

  @ApiPropertyOptional({ example: "101" })
  assignedRoomNumber?: string;

  @ApiProperty({ example: "2026-10-20" })
  checkInDate!: string;

  @ApiProperty({ example: "2026-10-22" })
  checkOutDate!: string;

  @ApiProperty({ example: 2 })
  nights!: number;

  @ApiProperty({ example: 2 })
  adults!: number;

  @ApiProperty({ example: 0 })
  children!: number;
}

export class DiningDetailResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d2b" })
  restaurantId!: string;

  @ApiProperty({ example: "The Riverside Grill & Lounge" })
  restaurantName!: string;

  @ApiProperty({ example: "EVENING" })
  shiftCode!: string;

  @ApiProperty({ example: 2 })
  partySize!: number;

  @ApiPropertyOptional({ example: "T01" })
  tableCode?: string;

  @ApiPropertyOptional({ example: "Window seating preferred" })
  notes?: string;
}

export class FlightInfoResponseDto {
  @ApiProperty({ example: "TG917" })
  number!: string;

  @ApiProperty({ example: "ARRIVAL" })
  direction!: string;

  @ApiProperty({ example: "2026-10-20T14:30:00.000Z" })
  scheduledAt!: Date;

  @ApiPropertyOptional({ example: "2026-10-20T14:45:00.000Z" })
  estimatedAt?: Date;

  @ApiPropertyOptional({ example: "Terminal 1" })
  terminal?: string;

  @ApiPropertyOptional({ example: 3 })
  meetingDoor?: number;
}

export class ServiceDetailResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d3c" })
  serviceId!: string;

  @ApiProperty({ example: "Private Airport Transfer" })
  serviceName!: string;

  @ApiProperty({ enum: ServiceKind, example: ServiceKind.AIRPORT_TRANSFER })
  serviceKind!: ServiceKind;

  @ApiProperty({ example: 2 })
  pax!: number;

  @ApiPropertyOptional({ type: FlightInfoResponseDto })
  flight?: FlightInfoResponseDto;

  @ApiPropertyOptional({ example: "1กข-9999" })
  vehiclePlate?: string;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a" })
  driverUserId?: string;
}

export class SlotRefResponseDto {
  @ApiProperty({
    example:
      "665a1b2c3d4e5f6a7b8c9d0e1:ROOM_NIGHT:STANDARD_KING:2026-10-20T00:00:00.000Z",
  })
  slotKey!: string;

  @ApiProperty({ example: 1 })
  qty!: number;
}

export class OrderLineResponseDto {
  @ApiProperty({ example: "e2b0a1d4-8c7e-4b9e-9d2a-1b2c3d4e5f6a" })
  lineId!: string;

  @ApiProperty({ enum: LineKind, example: LineKind.STAY })
  kind!: LineKind;

  @ApiProperty({ enum: LineStatus, example: LineStatus.CONFIRMED })
  status!: LineStatus;

  @ApiProperty({ example: "Standard King Room (2 nights)" })
  title!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ example: 4400 })
  unitPriceThb!: number;

  @ApiProperty({ example: 4400 })
  totalThb!: number;

  @ApiProperty({ example: "2026-10-20T07:00:00.000Z" })
  startsAt!: Date;

  @ApiPropertyOptional({ example: "2026-10-22T05:00:00.000Z" })
  endsAt?: Date;

  @ApiProperty({ example: "2026-10-20" })
  businessDate!: string;

  @ApiProperty({ type: [SlotRefResponseDto] })
  slotRefs!: SlotRefResponseDto[];

  @ApiPropertyOptional({ type: StayDetailResponseDto })
  stay?: StayDetailResponseDto;

  @ApiPropertyOptional({ type: DiningDetailResponseDto })
  dining?: DiningDetailResponseDto;

  @ApiPropertyOptional({ type: ServiceDetailResponseDto })
  service?: ServiceDetailResponseDto;

  @ApiPropertyOptional({ example: "2026-10-21T00:00:00.000Z" })
  cancelledAt?: Date;

  @ApiPropertyOptional({ example: "Guest travel change" })
  cancelReason?: string;

  @ApiProperty({ example: 0 })
  refundThb!: number;
}

export class OrderResponseDto {
  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d6f" })
  _id!: string;

  @ApiProperty({ example: "TS-261020-A1B2C" })
  orderNumber!: string;

  @ApiProperty({ example: "665a1b2c3d4e5f6a7b8c9d0e1" })
  branchId!: string;

  @ApiPropertyOptional({ example: "665a1b2c3d4e5f6a7b8c9d0a1" })
  guestUserId?: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  status!: OrderStatus;

  @ApiProperty({ type: GuestSnapshotResponseDto })
  guest!: GuestSnapshotResponseDto;

  @ApiProperty({ type: [OrderLineResponseDto] })
  lines!: OrderLineResponseDto[];

  @ApiProperty({ type: OrderTotalsResponseDto })
  totals!: OrderTotalsResponseDto;

  @ApiProperty({ type: PaymentInfoResponseDto })
  payment!: PaymentInfoResponseDto;

  @ApiPropertyOptional({ example: "Early check-in requested if possible" })
  specialRequests?: string;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-10-18T00:00:00.000Z" })
  updatedAt!: Date;
}
