import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Branch, BranchDocument } from "../branch/entity/branch.entity";
import { Room, RoomDocument } from "../room/entity/room.entity";
import { Service, ServiceDocument } from "../service/entity/service.entity";
import {
  Restaurant,
  RestaurantDocument,
} from "../restaurant/entity/restaurant.entity";
import { Order, OrderDocument } from "../order/entity/order.entity";
import { User, UserDocument } from "../user/entity/user.entity";
import { InventoryService } from "../inventory/inventory.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { NotificationSeverity } from "../notifications/enums/notification-severity.enum";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/enums/audit-action.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { LineKind, LineStatus, OrderStatus } from "../common/enums/order.enum";
import { ServiceKind } from "../common/enums/service.enum";
import { buildOrderCharges } from "../order/helpers/order-charges.helper";
import {
  ConciergeBookingDto,
  ConciergeRequestDto,
  GuestRequestCategory,
} from "./dto/concierge.dto";

const ROOM_TYPE_NAME: Record<string, string> = {
  STANDARD_KING: "Standard King",
  DELUXE_BALCONY: "Deluxe Balcony",
  POOL_VILLA: "Pool Villa",
};
const roomTypeName = (t: string) =>
  ROOM_TYPE_NAME[t] ?? t.replace(/_/g, " ").toLowerCase();

/** Requests that someone has to carry to the room go to housekeeping as well as the desk. */
const HOUSEKEEPING_CATEGORIES = [
  GuestRequestCategory.HOUSEKEEPING,
  GuestRequestCategory.AMENITY,
];

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * What the guest-facing AI concierge may read and do. Everything here is guest-safe:
 * no internal ids, no staff names, no statuses in system language, and a booking is only
 * shown to someone who knows both its number and the email or phone on it.
 */
@Injectable()
export class ConciergeService {
  private readonly logger = new Logger(ConciergeService.name);

  constructor(
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Service.name)
    private readonly serviceModel: Model<ServiceDocument>,
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly inventoryService: InventoryService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private async branch(code: string): Promise<BranchDocument> {
    const branch = await this.branchModel
      .findOne({ code: code.trim().toUpperCase(), isActive: { $ne: false } })
      .exec();
    if (!branch) throw new NotFoundException("Hotel not found");
    return branch;
  }

  private clock(d: Date | string, timeZone: string) {
    const date = new Date(d);
    return {
      date: date.toLocaleDateString("en-CA", { timeZone }),
      time: date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }),
    };
  }

  /** Room types with prices, services, dining and house policies. */
  async hotel(branchCode: string) {
    const branch = await this.branch(branchCode);
    const [rooms, services, restaurants] = await Promise.all([
      this.roomModel
        .find({ branchId: branch._id, isActive: { $ne: false } })
        .select("roomType baseRateThb maxOccupancy amenities")
        .lean()
        .exec(),
      this.serviceModel
        .find({ branchId: branch._id, isActive: { $ne: false } })
        .lean()
        .exec(),
      this.restaurantModel
        .find({ branchId: branch._id, isActive: { $ne: false } })
        .select("name cuisine shifts")
        .lean()
        .exec(),
    ]);

    const byType = new Map<
      string,
      { fromThb: number; maxGuests: number; amenities: Set<string> }
    >();
    for (const r of rooms) {
      const t = byType.get(r.roomType) ?? {
        fromThb: Infinity,
        maxGuests: 0,
        amenities: new Set<string>(),
      };
      t.fromThb = Math.min(t.fromThb, r.baseRateThb);
      t.maxGuests = Math.max(t.maxGuests, r.maxOccupancy);
      (r.amenities ?? []).forEach((a: string) => t.amenities.add(a));
      byType.set(r.roomType, t);
    }

    const a = branch.address;
    return {
      hotel: {
        name: branch.name,
        address: a
          ? [a.line1, a.district, a.city, a.postalCode]
              .filter(Boolean)
              .join(", ")
          : undefined,
        email: branch.contactEmail,
        checkInTime: branch.settings?.checkInTime,
        checkOutTime: branch.settings?.checkOutTime,
        currency: branch.currency,
        pricesInclude: `Room rates are per night before ${Math.round((branch.settings?.serviceChargeRate ?? 0.1) * 100)}% service charge and ${Math.round((branch.settings?.vatRate ?? 0.07) * 100)}% VAT`,
      },
      roomTypes: [...byType.entries()].map(([type, t]) => ({
        roomType: type,
        name: roomTypeName(type),
        fromThbPerNight: t.fromThb,
        maxGuests: t.maxGuests,
        amenities: [...t.amenities],
      })),
      services: services.map((s) => ({
        code: s.code,
        name: s.name,
        kind: s.kind,
        description: s.description,
        priceThb: s.basePriceThb,
        pricing: s.pricingModel,
        departures: s.tour?.departureTimes,
        durationMin: s.tour?.durationMin ?? s.wellness?.durationMin,
        meetingPoint: s.tour?.meetingPoint,
        startTimes: s.wellness?.startTimes,
        airport: s.transfer?.airportName,
      })),
      dining: restaurants.map((r) => ({
        name: r.name,
        cuisine: r.cuisine,
        hours: (r.shifts ?? []).map(
          (sh: { label: string; startTime: string; endTime: string }) =>
            `${sh.label} ${sh.startTime}–${sh.endTime}`,
        ),
      })),
    };
  }

  /** Rooms left per type for the dates, with the nightly price. */
  async availability(branchCode: string, checkIn: string, checkOut: string) {
    const branch = await this.branch(branchCode);
    const nights = Math.round(
      (Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000,
    );
    if (!(nights > 0)) {
      throw new NotFoundException("Check-out must be after check-in");
    }
    const { roomTypes } = await this.hotel(branchCode);
    const rows = await Promise.all(
      roomTypes.map(async (t) => {
        const available = await this.inventoryService.roomTypeAvailability(
          branch._id,
          t.roomType,
          checkIn,
          checkOut,
        );
        return {
          name: t.name,
          roomsLeft: available,
          fromThbPerNight: t.fromThbPerNight,
          fromThbTotal: t.fromThbPerNight * nights,
          maxGuests: t.maxGuests,
        };
      }),
    );
    return { checkIn, checkOut, nights, roomTypes: rows };
  }

  /** Same answer for "no such booking" and "wrong contact", so booking numbers can't be probed. */
  private async ownedOrder(dto: ConciergeBookingDto): Promise<OrderDocument> {
    const notFound = new NotFoundException(
      "We couldn't find a booking with those details",
    );
    const order = await this.orderModel
      .findOne({ orderNumber: dto.orderNumber.trim().toUpperCase() })
      .exec();
    if (!order) throw notFound;

    const contact = dto.contact.trim().toLowerCase();
    const email = order.guestSnapshot?.email?.toLowerCase();
    const phone = digits(order.guestSnapshot?.phoneE164 ?? "");
    const sent = digits(contact);
    const emailMatches = Boolean(email) && contact === email;
    // compare the last 8 digits so "+66 81 234 5678" and "081-234-5678" both match
    const phoneMatches =
      phone.length >= 8 &&
      sent.length >= 8 &&
      phone.slice(-8) === sent.slice(-8);
    if (!emailMatches && !phoneMatches) throw notFound;
    return order;
  }

  async lookupBooking(dto: ConciergeBookingDto) {
    const order = await this.ownedOrder(dto);
    const branch = await this.branchModel.findById(order.branchId).exec();
    const tz = branch?.timezone ?? "Asia/Bangkok";
    const live = order.items.filter((l) => l.status !== LineStatus.CANCELLED);
    const charges = buildOrderCharges(order, tz);
    return {
      bookingNumber: order.orderNumber,
      guestName: order.guestSnapshot?.fullName,
      hotel: branch?.name,
      status:
        order.status === OrderStatus.CANCELLED ? "cancelled" : "confirmed",
      stays: live
        .filter((l) => l.kind === LineKind.STAY && l.stay)
        .map((l) => ({
          room: roomTypeName(l.stay!.roomType),
          checkIn: l.stay!.checkInDate,
          checkOut: l.stay!.checkOutDate,
          nights: l.stay!.nights,
          roomNumber: l.stay!.assignedRoomNumber,
          checkInFrom: branch?.settings?.checkInTime,
          checkOutBy: branch?.settings?.checkOutTime,
        })),
      extras: live
        .filter((l) => l.kind !== LineKind.STAY)
        .map((l) => {
          const when = this.clock(l.startsAt, tz);
          const flight = l.service?.flight;
          return {
            name: l.service?.serviceName ?? l.title,
            date: when.date,
            time: when.time,
            guests: l.service?.pax,
            flight: flight?.number,
            meetingPoint: flight?.meetingDoor
              ? `Arrivals, door ${flight.meetingDoor}`
              : undefined,
            needsFlightDetails:
              l.service?.serviceKind === ServiceKind.AIRPORT_TRANSFER &&
              !flight,
          };
        }),
      bill: {
        totalThb: charges.totalThb,
        paidThb: charges.paidThb,
        dueThb: charges.dueThb,
        payAt: "the hotel",
      },
    };
  }

  /** Front desk and duty managers. */
  private async deskIds(branchId: Types.ObjectId) {
    const users = await this.userModel
      .find({
        branchIds: branchId,
        isSuspended: { $ne: true },
        $or: [
          { role: { $in: [UserRole.BRANCH_MGR, UserRole.DISPATCHER] } },
          { role: UserRole.STAFF, jobTitle: /front|recep|concierge/i },
        ],
      })
      .select("_id")
      .lean()
      .exec();
    return users.map((u) => String(u._id));
  }

  private async housekeeperIds(branchId: Types.ObjectId) {
    const users = await this.userModel
      .find({
        branchIds: branchId,
        isSuspended: { $ne: true },
        role: UserRole.STAFF,
        jobTitle: /housekeep/i,
      })
      .select("_id")
      .lean()
      .exec();
    return users.map((u) => String(u._id));
  }

  /** A guest asks for something; the desk (and housekeeping, for in-room items) is pinged. */
  async request(dto: ConciergeRequestDto) {
    const order = await this.ownedOrder(dto);
    const room = order.items.find(
      (l) => l.kind === LineKind.STAY && l.stay?.assignedRoomNumber,
    )?.stay?.assignedRoomNumber;
    const where = room ? `Room ${room}` : order.orderNumber;
    const label = dto.category.toLowerCase().replace(/_/g, " ");

    const recipients = new Set([
      ...(await this.deskIds(order.branchId)),
      ...(HOUSEKEEPING_CATEGORIES.includes(dto.category)
        ? await this.housekeeperIds(order.branchId)
        : []),
    ]);
    for (const userId of recipients) {
      await this.notificationsService.createNotification({
        userId,
        branchId: order.branchId.toString(),
        type: NotificationType.GENERAL,
        severity: NotificationSeverity.WARN,
        title: `Guest request · ${where}: ${label}`,
        body: `${order.guestSnapshot?.fullName ?? "Guest"} (${order.orderNumber}) via the AI concierge: "${dto.details.trim()}"`,
        data: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          roomNumber: room ?? "",
          category: dto.category,
          source: "AI_CONCIERGE",
        },
      });
    }

    await this.auditService?.log({
      who: { userId: null, email: null, role: null, isPlatformAdmin: false },
      action: AuditAction.GUEST_REQUEST,
      targetType: "order",
      targetId: order._id.toString(),
      branchId: order.branchId.toString(),
      from: {},
      to: { category: dto.category },
      metadata: {
        source: "AI_CONCIERGE",
        details: dto.details.trim(),
        notifiedCount: recipients.size,
      },
    });
    if (!recipients.size) {
      this.logger.warn(`Guest request on ${order.orderNumber} reached nobody`);
    }

    return {
      received: true,
      forwardedTo: HOUSEKEEPING_CATEGORIES.includes(dto.category)
        ? "front desk and housekeeping"
        : "front desk",
      teamsNotified: recipients.size > 0,
    };
  }
}
