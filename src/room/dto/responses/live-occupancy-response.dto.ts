import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CleaningStatus } from "../../../common/enums/cleaning-status.enum";
import { OrderChargesDto } from "../../../order/dto/responses/order-charges.dto";
import { RoomTypeCode } from "../../../common/enums/room-type.enum";

export type OccupancyStatus =
  | "OCCUPIED"
  | "ARRIVING_TODAY"
  | "DEPARTING_TODAY"
  | "VACANT";

export class ServiceDispatchDto {
  @ApiProperty()
  dispatchId!: string;

  @ApiProperty({ example: "IN_PROGRESS" })
  status!: string;

  @ApiPropertyOptional({
    example: "AT_AIRPORT",
    description: "Pickup step the driver last reported",
  })
  stage?: string;

  @ApiPropertyOptional({ description: "Driver reported a problem" })
  hasIssue?: boolean;

  @ApiPropertyOptional({ example: "Somchai Rattana" })
  driverName?: string;

  @ApiPropertyOptional({ example: "1กก 1234" })
  vehiclePlate?: string;
}

/** One transfer, tour or treatment on a live order. */
export class LiveServiceDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty()
  lineId!: string;

  @ApiProperty()
  guestName!: string;

  @ApiPropertyOptional({
    example: "101",
    description: "Room of the guest's stay on this order",
  })
  roomNumber?: string;

  @ApiProperty()
  serviceId!: string;

  @ApiProperty({
    enum: ["AIRPORT_TRANSFER", "SCHEDULED_TOUR", "SPA_TREATMENT"],
  })
  serviceKind!: string;

  @ApiProperty()
  serviceName!: string;

  @ApiProperty({ example: "2026-10-25" })
  date!: string;

  @ApiProperty({
    example: "09:40",
    description: "Start time in branch local time",
  })
  time!: string;

  @ApiProperty()
  startsAt!: Date;

  @ApiProperty()
  pax!: number;

  @ApiProperty({ description: "Line revenue before service charge and VAT" })
  totalThb!: number;

  @ApiProperty({ example: "CONFIRMED" })
  status!: string;

  @ApiProperty({ example: "UNPAID" })
  paymentStatus!: string;

  @ApiPropertyOptional()
  flightNumber?: string;

  @ApiPropertyOptional()
  meetingDoor?: number;

  @ApiProperty({
    description:
      "Transfer booked without flight details, so no pickup can be scheduled",
  })
  needsDetails!: boolean;

  @ApiPropertyOptional({ type: ServiceDispatchDto })
  dispatch?: ServiceDispatchDto;
}

/** One stay line of a live order. Shared by room cards, arrivals, departures, the timeline and the booking feed. */
export class LiveStayDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty({ example: "TS-261024-A1B2C" })
  orderNumber!: string;

  @ApiProperty()
  lineId!: string;

  @ApiPropertyOptional({
    description: "Physical room, absent when no room could be assigned",
  })
  roomId?: string;

  @ApiPropertyOptional({ example: "204" })
  roomNumber?: string;

  @ApiProperty({ enum: RoomTypeCode })
  roomType!: RoomTypeCode;

  @ApiProperty()
  guestName!: string;

  @ApiPropertyOptional()
  guestEmail?: string;

  @ApiPropertyOptional()
  guestPhone?: string;

  @ApiProperty({ example: "GOLD" })
  vipTier!: string;

  @ApiProperty({ example: "2026-10-24" })
  checkInDate!: string;

  @ApiProperty({ example: "2026-10-27" })
  checkOutDate!: string;

  @ApiProperty({ example: 3 })
  nights!: number;

  @ApiProperty({ example: 2 })
  pax!: number;

  @ApiProperty({
    example: 4400,
    description:
      "Room revenue for this stay line, before service charge and VAT",
  })
  totalThb!: number;

  @ApiProperty({
    example: 6591,
    description: "Whole order incl. extras, service charge and VAT",
  })
  orderTotalThb!: number;

  @ApiProperty({
    example: 6591,
    description: "Order total minus what has been collected",
  })
  balanceDueThb!: number;

  @ApiProperty({
    example: "UNPAID",
    enum: ["UNPAID", "DEPOSIT", "PAID", "REFUNDED"],
  })
  paymentStatus!: string;

  @ApiProperty({ example: "DIRECT_WEB" })
  channel!: string;

  @ApiPropertyOptional({ example: "google" })
  source?: string;

  @ApiPropertyOptional({ example: "SQ 976" })
  flightNumber?: string;

  @ApiPropertyOptional({
    example: "09:40",
    description: "Arrival time in branch local time",
  })
  flightEta?: string;

  @ApiPropertyOptional({ example: 4 })
  meetingDoor?: number;

  @ApiProperty()
  bookedAt!: Date;

  @ApiProperty({
    type: [LiveServiceDto],
    description: "Transfers, tours and treatments on the same order",
  })
  extras!: LiveServiceDto[];

  @ApiProperty({
    type: OrderChargesDto,
    description: "Folio breakdown of the whole order",
  })
  charges!: OrderChargesDto;
}

export class ActiveRoomDispatchDto {
  @ApiProperty()
  dispatchId!: string;

  @ApiProperty()
  severity!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  targetReadyBy?: Date;

  @ApiPropertyOptional({
    description: "Who owns the job; absent while it's in the open pool",
  })
  assigneeName?: string;
}

/** When today's arriving guest gets here and when their room must be inspected by. */
export class RoomArrivalDto {
  @ApiProperty({
    description: "Flight landing time, or standard check-in time",
  })
  etaAt!: Date;

  @ApiProperty({ description: "Room must be inspected by this time" })
  readyBy!: Date;

  @ApiProperty({ enum: ["TRANSFER_FLIGHT", "CHECKIN_TIME"] })
  etaSource!: "TRANSFER_FLIGHT" | "CHECKIN_TIME";

  @ApiPropertyOptional({ example: "TG 930" })
  flightNumber?: string;
}

export class LiveRoomItemDto {
  @ApiProperty()
  _id!: string;

  @ApiProperty()
  roomNumber!: string;

  @ApiProperty()
  floor!: number;

  @ApiProperty({ enum: RoomTypeCode })
  roomType!: RoomTypeCode;

  @ApiProperty()
  baseRateThb!: number;

  @ApiProperty()
  maxOccupancy!: number;

  @ApiProperty({ enum: CleaningStatus })
  cleaningStatus!: CleaningStatus;

  @ApiPropertyOptional()
  cleaningUpdatedAt?: Date;

  @ApiProperty({
    enum: ["OCCUPIED", "ARRIVING_TODAY", "DEPARTING_TODAY", "VACANT"],
  })
  occupancyStatus!: OccupancyStatus;

  @ApiPropertyOptional({
    type: LiveStayDto,
    description:
      "Guest sleeping in the room tonight (includes today's arrival)",
  })
  currentStay?: LiveStayDto;

  @ApiPropertyOptional({
    type: LiveStayDto,
    description: "Guest checking out today",
  })
  departingStay?: LiveStayDto;

  @ApiPropertyOptional({
    type: LiveStayDto,
    description: "Next future arrival",
  })
  nextStay?: LiveStayDto;

  @ApiPropertyOptional({ type: ActiveRoomDispatchDto })
  activeDispatch?: ActiveRoomDispatchDto;

  @ApiPropertyOptional({
    type: RoomArrivalDto,
    description: "Only for a guest arriving on the date",
  })
  arrival?: RoomArrivalDto;
}

export class RoomOccupancySummaryDto {
  @ApiProperty({ example: 40 })
  totalRooms!: number;

  @ApiProperty({
    example: 24,
    description: "Rooms sold for tonight, including today's arrivals",
  })
  occupiedTonight!: number;

  @ApiProperty({ example: 60 })
  occupancyRate!: number;

  @ApiProperty({ example: 4 })
  arrivalsToday!: number;

  @ApiProperty({ example: 2 })
  departuresToday!: number;

  @ApiProperty({ example: 4 })
  dirty!: number;

  @ApiProperty({ example: 3 })
  inProgress!: number;

  @ApiProperty({ example: 8 })
  clean!: number;

  @ApiProperty({ example: 25 })
  inspected!: number;

  @ApiProperty({
    example: 0,
    description: "Stays in the window with no free room of their type",
  })
  unassigned!: number;

  @ApiProperty({
    example: 3,
    description: "Orders created today in branch time",
  })
  bookedToday!: number;

  @ApiProperty({ example: 18450 })
  bookedTodayThb!: number;

  @ApiProperty({
    example: 6,
    description: "Service lines scheduled on the date",
  })
  servicesToday!: number;

  @ApiProperty({
    example: 9600,
    description: "Their revenue before service charge and VAT",
  })
  servicesTodayThb!: number;

  @ApiProperty({ example: 3 })
  pickupsToday!: number;

  @ApiProperty({ example: 1, description: "Transfers missing flight details" })
  servicesNeedingDetails!: number;
}

export class LiveOccupancyResponseDto {
  @ApiProperty()
  branchId!: string;

  @ApiProperty()
  branchName!: string;

  @ApiProperty({ example: "Asia/Bangkok" })
  timezone!: string;

  @ApiProperty({ example: "2026-10-24" })
  date!: string;

  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty({ type: RoomOccupancySummaryDto })
  summary!: RoomOccupancySummaryDto;

  @ApiProperty({ type: [LiveRoomItemDto] })
  rooms!: LiveRoomItemDto[];

  @ApiProperty({
    type: [LiveStayDto],
    description: "Every stay overlapping dateRange, for the timeline",
  })
  stays!: LiveStayDto[];

  @ApiProperty({ type: [LiveStayDto] })
  arrivals!: LiveStayDto[];

  @ApiProperty({ type: [LiveStayDto] })
  departures!: LiveStayDto[];

  @ApiProperty({
    type: [LiveServiceDto],
    description: "Services scheduled on the date, by start time",
  })
  services!: LiveServiceDto[];

  @ApiProperty({
    type: [LiveStayDto],
    description: "Latest bookings across all dates, newest first",
  })
  recentBookings!: LiveStayDto[];

  @ApiProperty()
  dateRange!: {
    from: string;
    to: string;
  };
}
