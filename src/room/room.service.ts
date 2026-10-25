import {
  Injectable,
  NotFoundException,
  Optional,
  Logger,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { RoomRepo } from "./room.repo";
import { RoomDocument } from "./entity/room.entity";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";
import { R2Service } from "../storage/r2.service";
import { CreateRoomDto } from "./dto/requests/create-room.dto";
import { UpdateRoomDto } from "./dto/requests/update-room.dto";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";
import { Order, OrderDocument, OrderLine } from "../order/entity/order.entity";
import { LineKind, LineStatus, OrderStatus } from "../common/enums/order.enum";
import { DispatchStatus } from "../common/enums/dispatch.enum";
import { ServiceKind } from "../common/enums/service.enum";
import { buildOrderCharges } from "../order/helpers/order-charges.helper";
import {
  OperationalDispatch,
  OperationalDispatchDocument,
} from "../dispatch/entity/operational-dispatch.entity";
import { User, UserDocument, vipTierFor } from "../user/entity/user.entity";
import { Branch, BranchDocument } from "../branch/entity/branch.entity";
import {
  addDays,
  toBranchBusinessDate,
  zonedAt,
} from "../common/helpers/time.helper";
import {
  LiveOccupancyResponseDto,
  LiveRoomItemDto,
  LiveServiceDto,
  LiveStayDto,
  OccupancyStatus,
} from "./dto/responses/live-occupancy-response.dto";
import { currentPickupStage } from "../staff/staff.service";

const LIVE_ORDER_STATUSES = [OrderStatus.CONFIRMED, OrderStatus.COMPLETED];
const DEAD_LINE_STATUSES = [LineStatus.CANCELLED, LineStatus.NO_SHOW];

type LeanOrder = Order & { _id: Types.ObjectId };

/** Orders holding at least one live stay line that overlaps [from, to). */
const liveStayFilter = (
  branchId: Types.ObjectId,
  from: string,
  to: string,
) => ({
  branchId,
  status: { $in: LIVE_ORDER_STATUSES },
  items: {
    $elemMatch: {
      kind: LineKind.STAY,
      status: { $nin: DEAD_LINE_STATUSES },
      "stay.checkInDate": { $lt: to },
      "stay.checkOutDate": { $gt: from },
    },
  },
});

const isLiveStayLine = (line: OrderLine): boolean =>
  line.kind === LineKind.STAY &&
  Boolean(line.stay) &&
  !DEAD_LINE_STATUSES.includes(line.status);

const sortRooms = <T extends { floor: number; roomNumber: string }>(
  rooms: T[],
): T[] =>
  [...rooms].sort(
    (a, b) =>
      a.floor - b.floor ||
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
  );

const localHhmm = (
  d: Date | undefined,
  timeZone: string,
): string | undefined =>
  d
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(d))
    : undefined;

export interface RoomTypeCatalogItem {
  roomType: string;
  name: string;
  baseRateThb: number;
  maxOccupancy: number;
  amenities: string[];
  coverImage?: string;
  images: string[];
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  constructor(
    private readonly roomRepo: RoomRepo,
    private readonly r2Service: R2Service,
    @Optional()
    @InjectModel(Order.name)
    private readonly orderModel?: Model<OrderDocument>,
    @Optional()
    @InjectModel(OperationalDispatch.name)
    private readonly dispatchModel?: Model<OperationalDispatchDocument>,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel?: Model<UserDocument>,
    @Optional()
    @InjectModel(Branch.name)
    private readonly branchModel?: Model<BranchDocument>,
  ) {}

  async create(user: ICurrentUser, dto: CreateRoomDto): Promise<RoomDocument> {
    validateBranchAccess(user, dto.branchId);

    return this.roomRepo.create({
      branchId: new Types.ObjectId(dto.branchId),
      roomNumber: dto.roomNumber,
      floor: dto.floor,
      roomType: dto.roomType,
      maxOccupancy: dto.maxOccupancy,
      baseRateThb: dto.baseRateThb,
      amenities: dto.amenities || [],
      coverImage: dto.coverImage,
      images: dto.images || [],
      cleaningStatus: CleaningStatus.INSPECTED,
      isActive: true,
    });
  }

  async uploadImages(
    user: ICurrentUser,
    roomId: string,
    files: Express.Multer.File[],
    isCover: boolean = false,
  ): Promise<RoomDocument> {
    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    validateBranchAccess(user, room.branchId);

    const folder = `rooms/${room.branchId.toString()}/${room.roomType.toLowerCase()}`;
    const uploadPromises = files.map((file) =>
      this.r2Service.uploadFile(file, folder),
    );
    const results = await Promise.all(uploadPromises);
    const urls = results.map((r) => r.url);

    const coverUrl = isCover && urls.length > 0 ? urls[0] : undefined;
    const updated = await this.roomRepo.addImages(room._id, urls, coverUrl);
    return updated!;
  }

  async removeImage(
    user: ICurrentUser,
    roomId: string,
    imageUrl: string,
  ): Promise<RoomDocument> {
    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    validateBranchAccess(user, room.branchId);

    const updated = await this.roomRepo.removeImage(room._id, imageUrl);
    return updated!;
  }

  async getRoomTypesCatalog(branchId: string): Promise<RoomTypeCatalogItem[]> {
    const rooms = await this.roomRepo.findAllByBranch(
      new Types.ObjectId(branchId),
    );
    const activeRooms = rooms.filter((r) => r.isActive !== false);
    const map = new Map<string, RoomTypeCatalogItem>();
    for (const r of activeRooms) {
      if (!map.has(r.roomType)) {
        map.set(r.roomType, {
          roomType: r.roomType,
          name: r.roomType.replace(/_/g, " "),
          baseRateThb: r.baseRateThb,
          maxOccupancy: r.maxOccupancy,
          amenities: r.amenities || [],
          coverImage: r.coverImage,
          images: r.images || [],
        });
      }
    }
    return Array.from(map.values());
  }

  async getRoomTypeCatalogById(id: string): Promise<RoomTypeCatalogItem> {
    const room = await this.roomRepo.findById(new Types.ObjectId(id));
    if (!room || room.isActive === false) {
      throw new NotFoundException(`Room type ${id} not found`);
    }
    return {
      roomType: room.roomType,
      name: room.roomType.replace(/_/g, " "),
      baseRateThb: room.baseRateThb,
      maxOccupancy: room.maxOccupancy,
      amenities: room.amenities || [],
      coverImage: room.coverImage,
      images: room.images || [],
    };
  }

  async findAllByBranch(branchId: string): Promise<RoomDocument[]> {
    return this.roomRepo.findAllByBranch(new Types.ObjectId(branchId));
  }

  async findByRoomNumber(
    branchId: string,
    roomNumber: string,
  ): Promise<RoomDocument> {
    const room = await this.roomRepo.findByRoomNumber(
      new Types.ObjectId(branchId),
      roomNumber,
    );
    if (!room) {
      throw new NotFoundException(`Room ${roomNumber} not found`);
    }
    return room;
  }

  async getHousekeepingBoard(branchId: string): Promise<{
    inspected: RoomDocument[];
    clean: RoomDocument[];
    inProgress: RoomDocument[];
    dirty: RoomDocument[];
  }> {
    const rooms = await this.findAllByBranch(branchId);
    return {
      inspected: rooms.filter(
        (r) => r.cleaningStatus === CleaningStatus.INSPECTED,
      ),
      clean: rooms.filter((r) => r.cleaningStatus === CleaningStatus.CLEAN),
      inProgress: rooms.filter(
        (r) => r.cleaningStatus === CleaningStatus.IN_PROGRESS,
      ),
      dirty: rooms.filter((r) => r.cleaningStatus === CleaningStatus.DIRTY),
    };
  }

  async findById(id: string): Promise<RoomDocument> {
    const room = await this.roomRepo.findById(new Types.ObjectId(id));
    if (!room) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    return room;
  }

  async update(
    user: ICurrentUser,
    id: string,
    dto: UpdateRoomDto,
  ): Promise<RoomDocument> {
    const existing = await this.findById(id);
    validateBranchAccess(user, existing.branchId);

    const updateData: Record<string, unknown> = {};
    if (dto.roomNumber !== undefined) updateData.roomNumber = dto.roomNumber;
    if (dto.floor !== undefined) updateData.floor = dto.floor;
    if (dto.roomType !== undefined) updateData.roomType = dto.roomType;
    if (dto.maxOccupancy !== undefined)
      updateData.maxOccupancy = dto.maxOccupancy;
    if (dto.baseRateThb !== undefined) updateData.baseRateThb = dto.baseRateThb;
    if (dto.amenities !== undefined) updateData.amenities = dto.amenities;
    if (dto.coverImage !== undefined) updateData.coverImage = dto.coverImage;
    if (dto.images !== undefined) updateData.images = dto.images;

    const updated = await this.roomRepo.update(
      new Types.ObjectId(id),
      updateData as any,
    );
    if (!updated) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    return updated;
  }

  /** First active room of the type with no live stay overlapping [checkIn, checkOut). */
  async findFreeRoom(
    branchId: Types.ObjectId,
    roomType: string,
    checkIn: string,
    checkOut: string,
  ): Promise<RoomDocument | null> {
    const candidates = sortRooms(
      (await this.roomRepo.findAllByBranch(branchId)).filter(
        (r) => String(r.roomType) === roomType && r.isActive !== false,
      ),
    );
    if (!candidates.length || !this.orderModel) return candidates[0] ?? null;

    const orders = await this.orderModel
      .find(liveStayFilter(branchId, checkIn, checkOut))
      .select("items")
      .lean()
      .exec();
    const busy = new Set<string>();
    for (const order of orders) {
      for (const line of order.items) {
        if (
          isLiveStayLine(line) &&
          line.stay!.assignedRoomId &&
          line.stay!.checkInDate < checkOut &&
          line.stay!.checkOutDate > checkIn
        ) {
          busy.add(String(line.stay!.assignedRoomId));
        }
      }
    }
    return candidates.find((r) => !busy.has(String(r._id))) ?? null;
  }

  async getLiveOccupancy(
    branchId: string,
    date?: string,
    from?: string,
    to?: string,
  ): Promise<LiveOccupancyResponseDto> {
    const branchOid = new Types.ObjectId(branchId);
    const branch = this.branchModel
      ? await this.branchModel.findById(branchOid).lean().exec()
      : null;
    const timezone = branch?.timezone || "Asia/Bangkok";
    const now = new Date();
    const today = date || toBranchBusinessDate(now, timezone);
    const rangeFrom = from || addDays(today, -2);
    const rangeTo = to || addDays(today, 12);
    // the window always covers today so the KPIs stay correct when the timeline is scrolled away
    const windowFrom = rangeFrom < today ? rangeFrom : today;
    const windowTo = rangeTo > addDays(today, 1) ? rangeTo : addDays(today, 1);

    const rooms = sortRooms(
      (await this.findAllByBranch(branchId)).filter(
        (r) => r.isActive !== false,
      ),
    );
    const roomById = new Map(rooms.map((r) => [String(r._id), r]));

    const [windowOrders, recentOrders, todaysDispatches, serviceOrders] =
      await Promise.all([
        this.orderModel
          ? this.orderModel
              .find(liveStayFilter(branchOid, windowFrom, windowTo))
              .lean()
              .exec()
          : [],
        this.orderModel
          ? this.orderModel
              .find({
                branchId: branchOid,
                status: { $in: LIVE_ORDER_STATUSES },
                "items.kind": LineKind.STAY,
              })
              .sort({ createdAt: -1 })
              .limit(40)
              .lean()
              .exec()
          : [],
        this.dispatchModel
          ? this.dispatchModel
              .find({ branchId: branchOid, serviceDate: today })
              .lean()
              .exec()
          : ([] as (OperationalDispatch & { _id: Types.ObjectId })[]),
        this.orderModel
          ? this.orderModel
              .find({
                branchId: branchOid,
                status: { $in: LIVE_ORDER_STATUSES },
                items: {
                  $elemMatch: {
                    kind: LineKind.SERVICE,
                    businessDate: today,
                    status: { $nin: DEAD_LINE_STATUSES },
                  },
                },
              })
              .lean()
              .exec()
          : [],
      ]);
    const dispatches = todaysDispatches.filter(
      (d) =>
        d.status !== DispatchStatus.DONE &&
        d.status !== DispatchStatus.DISMISSED,
    );
    const pickupByLine = new Map(
      todaysDispatches
        .filter((d) => d.pickup?.lineId)
        .map((d) => [d.pickup!.lineId, d]),
    );
    // names for pickup drivers and anyone who owns a task today
    const driverIds = [
      ...new Set(
        todaysDispatches
          .flatMap((d) => [d.pickup?.driverUserId, d.assigneeUserId])
          .filter(Boolean)
          .map(String),
      ),
    ];
    const drivers =
      this.userModel && driverIds.length
        ? await this.userModel
            .find({
              _id: { $in: driverIds.map((id) => new Types.ObjectId(id)) },
            })
            .select("displayName")
            .lean()
            .exec()
        : [];
    const driverName = new Map(
      drivers.map((u) => [String(u._id), u.displayName]),
    );

    const toService = (order: LeanOrder, line: OrderLine): LiveServiceDto => {
      const svc = line.service!;
      const stayLine = order.items.find(
        (it) => it.kind === LineKind.STAY && it.stay?.assignedRoomNumber,
      );
      const pickup = pickupByLine.get(line.lineId);
      const isTransfer = svc.serviceKind === ServiceKind.AIRPORT_TRANSFER;
      return {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        lineId: line.lineId,
        guestName: order.guestSnapshot?.fullName || "Guest",
        roomNumber: stayLine?.stay?.assignedRoomNumber,
        serviceId: String(svc.serviceId),
        serviceKind: svc.serviceKind,
        serviceName: svc.serviceName,
        date: line.businessDate,
        time: localHhmm(line.startsAt, timezone) ?? "",
        startsAt: line.startsAt,
        pax: svc.pax,
        totalThb: line.totalThb,
        status: line.status,
        paymentStatus: order.payment?.status || "UNPAID",
        flightNumber: svc.flight?.number,
        meetingDoor: svc.flight?.meetingDoor,
        needsDetails: isTransfer && !svc.flight,
        dispatch: pickup
          ? {
              dispatchId: String(pickup._id),
              status: pickup.status,
              stage: currentPickupStage(pickup),
              hasIssue: Boolean(
                pickup.pickup?.issue && !pickup.pickup.issue.resolvedAt,
              ),
              driverName: pickup.pickup?.driverUserId
                ? driverName.get(String(pickup.pickup.driverUserId))
                : undefined,
              vehiclePlate: pickup.pickup?.vehiclePlate,
            }
          : undefined,
      };
    };
    const servicesOf = (order: LeanOrder) =>
      order.items
        .filter(
          (it) =>
            it.kind === LineKind.SERVICE &&
            it.service &&
            !DEAD_LINE_STATUSES.includes(it.status),
        )
        .map((it) => toService(order, it))
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

    const guestIds = [
      ...new Set(
        [...windowOrders, ...recentOrders].map((o) => String(o.guestId)),
      ),
    ];
    const guests = this.userModel
      ? await this.userModel
          .find({ _id: { $in: guestIds.map((id) => new Types.ObjectId(id)) } })
          .select("vipScore")
          .lean()
          .exec()
      : [];
    const vipScoreByGuest = new Map(
      guests.map((g) => [String(g._id), g.vipScore || 0]),
    );

    const toStay = (order: LeanOrder, line: OrderLine): LiveStayDto => {
      const stay = line.stay!;
      const arrival = order.items.find(
        (it) =>
          it.kind === LineKind.SERVICE &&
          it.service?.flight?.direction === "ARRIVAL",
      )?.service?.flight;
      const room = stay.assignedRoomId
        ? roomById.get(String(stay.assignedRoomId))
        : undefined;
      return {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        lineId: line.lineId,
        roomId: room ? String(room._id) : undefined,
        roomNumber: room?.roomNumber,
        roomType: stay.roomType,
        guestName: order.guestSnapshot?.fullName || "Guest",
        guestEmail: order.guestSnapshot?.email,
        guestPhone: order.guestSnapshot?.phoneE164,
        vipTier: vipTierFor(vipScoreByGuest.get(String(order.guestId))),
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDate,
        nights: stay.nights,
        pax: stay.adults + (stay.children || 0),
        totalThb: line.totalThb,
        orderTotalThb: order.totals?.grandTotalThb || 0,
        balanceDueThb: Math.max(
          0,
          (order.totals?.grandTotalThb || 0) - (order.payment?.paidThb || 0),
        ),
        paymentStatus: order.payment?.status || "UNPAID",
        channel: order.attribution?.channel || "DIRECT_WEB",
        source: order.attribution?.utmSource,
        flightNumber: arrival?.number,
        flightEta: arrival
          ? localHhmm(arrival.estimatedAt || arrival.scheduledAt, timezone)
          : undefined,
        meetingDoor: arrival?.meetingDoor,
        bookedAt: (order as LeanOrder & { createdAt: Date }).createdAt,
        extras: servicesOf(order),
        charges: buildOrderCharges(order, timezone),
      };
    };

    // Stays in the window. Legacy stays without a room are placed on a free room of their
    // type for display only; stays that fit nowhere are reported as unassigned.
    const stays: LiveStayDto[] = [];
    for (const order of windowOrders) {
      for (const line of order.items) {
        if (
          isLiveStayLine(line) &&
          line.stay!.checkInDate < windowTo &&
          line.stay!.checkOutDate > windowFrom
        ) {
          stays.push(toStay(order, line));
        }
      }
    }
    stays.sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));

    const staysByRoom = new Map<string, LiveStayDto[]>();
    const place = (roomId: string, s: LiveStayDto) => {
      const list = staysByRoom.get(roomId) ?? [];
      list.push(s);
      staysByRoom.set(roomId, list);
    };
    for (const s of stays) if (s.roomId) place(s.roomId, s);
    for (const s of stays) {
      if (s.roomId) continue;
      const free = rooms.find(
        (r) =>
          r.roomType === s.roomType &&
          !(staysByRoom.get(String(r._id)) ?? []).some(
            (o) =>
              o.checkInDate < s.checkOutDate && o.checkOutDate > s.checkInDate,
          ),
      );
      if (free) {
        s.roomId = String(free._id);
        s.roomNumber = free.roomNumber;
        place(s.roomId, s);
      }
    }

    // Same deadline rule as the dispatch planner: ready an hour after the guest's ETA.
    const checkInTime = branch?.settings?.checkInTime || "14:00";
    const arrivalFor = (
      stay: LiveStayDto | undefined,
      dispatch: (typeof dispatches)[number] | undefined,
    ): LiveRoomItemDto["arrival"] => {
      if (!stay || stay.checkInDate !== today) return undefined;
      const hk = dispatch?.housekeeping;
      if (hk?.etaAt && hk.targetReadyBy) {
        return {
          etaAt: hk.etaAt,
          readyBy: hk.targetReadyBy,
          etaSource: hk.etaSource as "TRANSFER_FLIGHT" | "CHECKIN_TIME",
          flightNumber: hk.flightNumber,
        };
      }
      const flight = stay.extras.find(
        (x) =>
          x.serviceKind === String(ServiceKind.AIRPORT_TRANSFER) &&
          x.flightNumber &&
          x.date === today,
      );
      const etaAt = flight
        ? new Date(flight.startsAt)
        : zonedAt(today, checkInTime);
      return {
        etaAt,
        readyBy: new Date(etaAt.getTime() + 3_600_000),
        etaSource: flight ? "TRANSFER_FLIGHT" : "CHECKIN_TIME",
        flightNumber: flight?.flightNumber,
      };
    };

    const liveRooms: LiveRoomItemDto[] = rooms.map((r) => {
      const roomStays = staysByRoom.get(String(r._id)) ?? [];
      const currentStay = roomStays.find(
        (s) => s.checkInDate <= today && today < s.checkOutDate,
      );
      const departingStay = roomStays.find((s) => s.checkOutDate === today);
      const nextStay = roomStays.find((s) => s.checkInDate > today);
      const occupancyStatus: OccupancyStatus = currentStay
        ? currentStay.checkInDate === today
          ? "ARRIVING_TODAY"
          : "OCCUPIED"
        : departingStay
          ? "DEPARTING_TODAY"
          : "VACANT";

      const dispatch = dispatches.find(
        (d) =>
          String(d.housekeeping?.roomId) === String(r._id) ||
          d.housekeeping?.roomNumber === r.roomNumber,
      );

      return {
        _id: String(r._id),
        roomNumber: r.roomNumber,
        floor: r.floor,
        roomType: r.roomType,
        baseRateThb: r.baseRateThb,
        maxOccupancy: r.maxOccupancy,
        cleaningStatus: r.cleaningStatus,
        cleaningUpdatedAt: r.cleaningUpdatedAt,
        occupancyStatus,
        currentStay,
        departingStay,
        nextStay,
        arrival: arrivalFor(currentStay, dispatch),
        activeDispatch: dispatch
          ? {
              dispatchId: String(dispatch._id),
              severity: dispatch.severity,
              status: dispatch.status,
              title: dispatch.title,
              targetReadyBy: dispatch.housekeeping?.targetReadyBy,
              assigneeName: dispatch.assigneeUserId
                ? driverName.get(String(dispatch.assigneeUserId))
                : undefined,
            }
          : undefined,
      };
    });

    const recentBookings: LiveStayDto[] = [];
    for (const order of recentOrders) {
      for (const line of order.items) {
        if (isLiveStayLine(line)) recentBookings.push(toStay(order, line));
      }
    }
    const placedRoom = new Map(
      stays.filter((s) => s.roomId).map((s) => [s.lineId, s]),
    );
    for (const b of recentBookings) {
      const placed = placedRoom.get(b.lineId);
      if (!b.roomId && placed) {
        b.roomId = placed.roomId;
        b.roomNumber = placed.roomNumber;
      }
    }
    const bookedTodayOrders = recentOrders.filter(
      (o) =>
        toBranchBusinessDate(
          (o as LeanOrder & { createdAt: Date }).createdAt,
          timezone,
        ) === today,
    );

    const services = serviceOrders
      .flatMap(servicesOf)
      .filter((sv) => sv.date === today)
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

    const count = (status: CleaningStatus) =>
      rooms.filter((r) => r.cleaningStatus === status).length;
    const occupiedTonight = liveRooms.filter((r) => r.currentStay).length;

    return {
      branchId,
      branchName: branch?.name || "",
      timezone,
      date: today,
      generatedAt: now,
      summary: {
        totalRooms: rooms.length,
        occupiedTonight,
        occupancyRate: rooms.length
          ? Math.round((occupiedTonight / rooms.length) * 100)
          : 0,
        arrivalsToday: stays.filter((s) => s.checkInDate === today).length,
        departuresToday: stays.filter((s) => s.checkOutDate === today).length,
        dirty: count(CleaningStatus.DIRTY),
        inProgress: count(CleaningStatus.IN_PROGRESS),
        clean: count(CleaningStatus.CLEAN),
        inspected: count(CleaningStatus.INSPECTED),
        unassigned: stays.filter((s) => !s.roomId).length,
        bookedToday: bookedTodayOrders.length,
        bookedTodayThb: bookedTodayOrders.reduce(
          (sum, o) => sum + (o.totals?.grandTotalThb || 0),
          0,
        ),
        servicesToday: services.length,
        servicesTodayThb: services.reduce((sum, sv) => sum + sv.totalThb, 0),
        pickupsToday: services.filter(
          (sv) => sv.serviceKind === String(ServiceKind.AIRPORT_TRANSFER),
        ).length,
        servicesNeedingDetails: services.filter((sv) => sv.needsDetails).length,
      },
      rooms: liveRooms,
      stays: stays.filter(
        (s) => s.checkInDate < rangeTo && s.checkOutDate > rangeFrom,
      ),
      arrivals: stays.filter((s) => s.checkInDate === today),
      departures: stays.filter((s) => s.checkOutDate === today),
      services,
      recentBookings: recentBookings.slice(0, 8),
      dateRange: { from: rangeFrom, to: rangeTo },
    };
  }
}
