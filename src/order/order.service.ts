import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { OrderRepo } from "./order.repo";
import { Order, OrderDocument, OrderLine } from "./entity/order.entity";
import { CreateOrderDto } from "./dto/requests/create-order.dto";
import { RecordPaymentDto } from "./dto/requests/record-payment.dto";
import { UpdateFlightDto } from "./dto/requests/update-flight.dto";
import { SlotUnavailableError } from "../inventory/inventory.service";
import { RoomService } from "../room/room.service";
import { User, UserDocument } from "../user/entity/user.entity";
import { buildSlotKey } from "../inventory/entity/inventory-slot.entity";
import { SlotKind } from "../common/enums/inventory.enum";
import {
  eachNight,
  toBusinessDate,
  zonedAt,
} from "../common/helpers/time.helper";
import { ServiceKind } from "../common/enums/service.enum";
import { DispatchPlannerService } from "../dispatch/dispatch-planner.service";
import { InventoryService } from "../inventory/inventory.service";
import { InventoryRepo } from "../inventory/inventory.repo";
import { BranchRepo } from "../branch/branch.repo";
import { RoomRepo } from "../room/room.repo";
import { ServiceRepo } from "../service/service.repo";
import { LineKind, LineStatus, OrderStatus } from "../common/enums/order.enum";
import { HoldStatus } from "../common/enums/inventory.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";
import {
  generateOrderToken,
  verifyOrderToken,
} from "../common/helpers/order-token.helper";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/enums/audit-action.enum";

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepo: OrderRepo,
    private readonly inventoryService: InventoryService,
    private readonly inventoryRepo: InventoryRepo,
    private readonly branchRepo: BranchRepo,
    private readonly roomRepo: RoomRepo,
    private readonly serviceRepo: ServiceRepo,
    private readonly auditService?: AuditService,
    @Optional()
    private readonly roomService?: RoomService,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel?: Model<UserDocument>,
    @Optional()
    private readonly dispatchPlanner?: DispatchPlannerService,
  ) {}

  /**
   * Public guest checkout. Maps the checkout DTO onto the order entity, links the guest profile,
   * converts the inventory hold into booked stock and assigns a physical room to every stay.
   * There is no online payment provider yet, so direct bookings are confirmed as pay-at-hotel.
   */
  async createFromCheckout(
    dto: CreateOrderDto,
  ): Promise<{ order: OrderDocument; orderToken: string }> {
    const branchId = new Types.ObjectId(dto.branchId);
    const needsHold = dto.lines.some(
      (l) => l.kind === LineKind.STAY || l.kind === LineKind.SERVICE,
    );
    if (needsHold && !dto.holdId) {
      throw new BadRequestException(
        "Rooms and services require an inventory hold",
      );
    }

    const items: Partial<OrderLine>[] = [];
    for (const line of dto.lines) {
      items.push(await this.mapCheckoutLine(branchId, line));
    }

    const { order, orderToken } = await this.create({
      branchId,
      guestId: await this.resolveGuestId(dto),
      guestSnapshot: {
        fullName: dto.guest.fullName,
        email: dto.guest.email,
        phoneE164: dto.guest.phoneE164 || undefined,
        lineUserId: dto.guest.lineUserId || undefined,
        preferredLanguage: dto.guest.preferredLanguage ?? "en",
      },
      items: items as OrderLine[],
      attribution: {
        channel: "DIRECT_WEB",
        ...dto.attribution,
      } as Order["attribution"],
      holdId: dto.holdId ? new Types.ObjectId(dto.holdId) : undefined,
    });

    if (order.holdId) {
      try {
        await this.inventoryService.confirm(order.holdId, order._id);
      } catch {
        order.status = OrderStatus.CANCELLED;
        order.cancelledAt = new Date();
        await order.save();
        throw new ConflictException(
          "Your rate hold expired before checkout completed. Please search again.",
        );
      }
    }

    order.status = OrderStatus.CONFIRMED;
    order.payment.status = "UNPAID";
    order.payment.method = "PAY_AT_HOTEL";
    for (const item of order.items) {
      item.status = LineStatus.CONFIRMED;
      if (item.kind === LineKind.STAY && item.stay && this.roomService) {
        const room = await this.roomService.findFreeRoom(
          branchId,
          item.stay.roomType,
          item.stay.checkInDate,
          item.stay.checkOutDate,
        );
        if (room) {
          item.stay.assignedRoomId = room._id;
          item.stay.assignedRoomNumber = room.roomNumber;
        }
      }
    }
    await order.save();
    await this.dispatchPlanner?.planOrder(order);

    return { order, orderToken };
  }

  private async mapCheckoutLine(
    branchId: Types.ObjectId,
    line: CreateOrderDto["lines"][number],
  ): Promise<Partial<OrderLine>> {
    const base: Partial<OrderLine> = {
      kind: line.kind,
      title: line.title,
      quantity: line.quantity ?? 1,
      unitPriceThb: line.unitPriceThb,
      startsAt: line.startsAt,
      endsAt: line.endsAt,
      businessDate: line.businessDate,
    };

    if (line.kind === LineKind.STAY && line.stay) {
      const { checkInDate, checkOutDate, roomType } = line.stay;
      const nights = eachNight(checkInDate, checkOutDate);
      if (!nights.length) {
        throw new BadRequestException("Check-out must be after check-in");
      }
      return {
        ...base,
        startsAt: zonedAt(checkInDate, "14:00"),
        endsAt: zonedAt(checkOutDate, "12:00"),
        businessDate: checkInDate,
        slotRefs: nights.map((night) => ({
          slotKey: buildSlotKey(
            branchId,
            SlotKind.ROOM_NIGHT,
            roomType,
            zonedAt(night, "00:00"),
          ),
          qty: 1,
        })),
        stay: {
          roomType,
          checkInDate,
          checkOutDate,
          nights: nights.length,
          adults: line.stay.adults,
          children: line.stay.children ?? 0,
          nightlyRates: [],
        },
      } as Partial<OrderLine>;
    }

    if (line.kind === LineKind.DINING && line.dining) {
      return {
        ...base,
        dining: {
          ...line.dining,
          restaurantId: new Types.ObjectId(line.dining.restaurantId),
        },
      } as unknown as Partial<OrderLine>;
    }

    if (line.kind === LineKind.SERVICE && line.service) {
      return this.mapServiceLine(branchId, base, line.service);
    }

    return base;
  }

  /**
   * Schedules a service line from the catalogue, never from client numbers:
   * transfers start at the flight's landing time and count once, tours and treatments are
   * priced per guest, and every line carries the capacity slot it consumes.
   */
  private async mapServiceLine(
    branchId: Types.ObjectId,
    base: Partial<OrderLine>,
    input: NonNullable<CreateOrderDto["lines"][number]["service"]>,
  ): Promise<Partial<OrderLine>> {
    const svc = await this.serviceRepo.findById(input.serviceId);
    if (!svc || svc.isActive === false) {
      throw new BadRequestException(
        `Service ${input.serviceName} is unavailable`,
      );
    }
    const isTransfer = svc.kind === ServiceKind.AIRPORT_TRANSFER;
    if (isTransfer && !input.flight) {
      throw new BadRequestException(
        "Airport transfers need the arrival flight number and landing time",
      );
    }

    const startsAt = isTransfer
      ? new Date(input.flight!.scheduledAt)
      : new Date(base.startsAt!);
    const durationMin =
      svc.tour?.durationMin ?? svc.wellness?.durationMin ?? 60;
    const slotRef = await this.inventoryService.ensureServiceSlot(
      branchId,
      String(svc._id),
      startsAt,
      input.pax,
    );

    return {
      ...base,
      title: svc.name,
      quantity: isTransfer ? 1 : input.pax,
      unitPriceThb: svc.basePriceThb,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
      businessDate: toBusinessDate(startsAt),
      slotRefs: [slotRef],
      service: {
        serviceId: svc._id,
        serviceName: svc.name,
        serviceKind: svc.kind,
        pax: input.pax,
        ...(input.flight && {
          flight: {
            number: input.flight.number
              .toUpperCase()
              .replace(/\s+/g, " ")
              .trim(),
            direction: input.flight.direction,
            scheduledAt: startsAt,
            meetingDoor:
              input.flight.meetingDoor ?? svc.transfer?.meetingDoors?.[0],
          },
        }),
      },
    } as unknown as Partial<OrderLine>;
  }

  /** Staff record money collected. Appends to the payment ledger; never accepts more than is owed. */
  async recordPayment(
    orderId: string,
    user: ICurrentUser,
    dto: RecordPaymentDto,
  ): Promise<OrderDocument> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    validateBranchAccess(user, order.branchId);
    if (
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.COMPLETED
    ) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is ${order.status}; payments can only be taken on confirmed bookings`,
      );
    }

    const before = {
      status: order.payment.status,
      paidThb: order.payment.paidThb,
    };
    const due = order.totals.grandTotalThb - order.payment.paidThb;
    if (due <= 0) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is already settled`,
      );
    }
    if (dto.amountThb > due) {
      throw new BadRequestException(
        `Amount exceeds the balance due of ฿${due.toLocaleString("en-US")}`,
      );
    }

    order.payment.entries.push({
      amountThb: dto.amountThb,
      method: dto.method,
      reference: dto.reference?.trim() || undefined,
      receivedAt: new Date(),
      receivedBy: new Types.ObjectId(user.userId),
      receivedByName: user.email ?? undefined,
    });
    order.payment.paidThb += dto.amountThb;
    order.payment.method = dto.method;
    order.payment.status =
      order.payment.paidThb >= order.totals.grandTotalThb ? "PAID" : "DEPOSIT";
    const saved = await order.save();

    await this.auditService?.log({
      who: AuditService.fromCurrentUser(user),
      action: AuditAction.PAYMENT_RECORD,
      targetType: "order",
      targetId: order._id.toString(),
      branchId: order.branchId.toString(),
      from: before,
      to: { status: order.payment.status, paidThb: order.payment.paidThb },
      metadata: {
        amountThb: dto.amountThb,
        method: dto.method,
        reference: dto.reference,
      },
    });
    return saved;
  }

  /**
   * Sets or corrects the arrival flight on a transfer: moves the van slot if the hour changed,
   * re-times the line and re-plans the pickup and room turnaround around the new landing time.
   */
  async updateTransferFlight(
    orderId: string,
    lineId: string,
    user: ICurrentUser,
    dto: UpdateFlightDto,
  ): Promise<OrderDocument> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    validateBranchAccess(user, order.branchId);

    const line = order.items.find((l) => l.lineId === lineId);
    if (
      !line?.service ||
      line.service.serviceKind !== ServiceKind.AIRPORT_TRANSFER ||
      line.status === LineStatus.CANCELLED
    ) {
      throw new BadRequestException(
        "That line is not an active airport transfer",
      );
    }

    const landingAt = new Date(dto.landingAt);
    const before = {
      flight: line.service.flight?.number,
      landingAt: line.service.flight?.scheduledAt,
    };
    const svc = await this.serviceRepo.findById(
      line.service.serviceId.toString(),
    );

    let slotRef;
    try {
      slotRef = await this.inventoryService.moveServiceBooking(
        order.branchId,
        line.service.serviceId.toString(),
        line.slotRefs?.[0],
        landingAt,
        line.service.pax,
      );
    } catch (err) {
      if (err instanceof SlotUnavailableError) {
        throw new ConflictException(
          "Every van is already booked in that hour. Pick another time or add a vehicle.",
        );
      }
      throw err;
    }

    line.service.flight = {
      number: dto.number
        .toUpperCase()
        .replace(/^([A-Z0-9]{2})\s*/, "$1 ")
        .trim(),
      direction: "ARRIVAL",
      scheduledAt: landingAt,
      estimatedAt: undefined,
      meetingDoor:
        dto.meetingDoor ??
        line.service.flight?.meetingDoor ??
        svc?.transfer?.meetingDoors?.[0],
    } as typeof line.service.flight;
    line.startsAt = landingAt;
    line.endsAt = new Date(landingAt.getTime() + 3_600_000);
    line.businessDate = toBusinessDate(landingAt);
    line.slotRefs = [slotRef];
    order.markModified("items");
    const saved = await order.save();

    await this.auditService?.log({
      who: AuditService.fromCurrentUser(user),
      action: AuditAction.ORDER_LINE_UPDATE,
      targetType: "order",
      targetId: order._id.toString(),
      branchId: order.branchId.toString(),
      from: before,
      to: { flight: line.service.flight?.number, landingAt },
      metadata: { lineId },
    });
    await this.dispatchPlanner?.planOrder(saved);
    return saved;
  }

  /** Links the order to an existing guest profile by email, or creates a lightweight one. */
  private async resolveGuestId(dto: CreateOrderDto): Promise<Types.ObjectId> {
    if (!this.userModel) {
      throw new BadRequestException("Guest profiles are unavailable");
    }
    const email = dto.guest.email?.toLowerCase().trim();
    if (email) {
      const existing = await this.userModel
        .findOne({ email })
        .select("_id")
        .lean()
        .exec();
      if (existing) return existing._id;
    }
    const created = await this.userModel.create({
      role: UserRole.GUEST,
      displayName: dto.guest.fullName,
      email: email || null,
      phoneE164: dto.guest.phoneE164 || null,
      lineUserId: dto.guest.lineUserId || null,
      preferredLanguage: dto.guest.preferredLanguage ?? "en",
    });
    return created._id;
  }

  async create(
    orderData: Partial<Order>,
  ): Promise<{ order: OrderDocument; orderToken: string }> {
    if (!orderData.branchId) {
      throw new BadRequestException("branchId is required");
    }

    // 1. Validate branch is active
    const branch = await this.branchRepo.findById(orderData.branchId);
    if (!branch || !branch.isActive) {
      throw new BadRequestException("Branch is inactive or not found");
    }

    // 2. Validate hold belongs to cart
    if (orderData.holdId) {
      const hold = await this.inventoryRepo.findHoldById(orderData.holdId);
      if (
        !hold ||
        hold.status !== HoldStatus.ACTIVE ||
        hold.expiresAt <= new Date() ||
        hold.branchId.toString() !== branch._id.toString()
      ) {
        throw new BadRequestException(
          "Invalid or expired inventory hold for this cart",
        );
      }
    }

    // 3. Compute every price server-side from catalog (ignore client prices)
    let subtotal = 0;
    const items = orderData.items || [];
    for (const item of items) {
      if (item.kind === LineKind.STAY && item.stay) {
        const rooms = await this.roomRepo.findAllByBranch(branch._id);
        const matching = rooms.find(
          (r) => r.roomType === item.stay?.roomType && r.isActive !== false,
        );
        const ratePerNight = matching
          ? matching.baseRateThb
          : item.unitPriceThb || 2000;
        const nights = item.stay.nights || 1;
        // the schema prices a stay from its nightly rates, so they must cover every night
        item.stay.nightlyRates = eachNight(
          item.stay.checkInDate,
          item.stay.checkOutDate,
        ).map((date) => ({ date, rateThb: ratePerNight }));
        item.unitPriceThb = ratePerNight * nights;
        item.totalThb = item.unitPriceThb * (item.quantity || 1);
      } else if (item.kind === LineKind.SERVICE && item.service) {
        const s = await this.serviceRepo.findById(
          item.service.serviceId.toString(),
        );
        const rate =
          s && s.isActive !== false
            ? s.basePriceThb
            : item.unitPriceThb || 1000;
        item.unitPriceThb = rate;
        item.totalThb = item.unitPriceThb * (item.quantity || 1);
      } else {
        item.totalThb = (item.unitPriceThb || 0) * (item.quantity || 1);
      }
      subtotal += item.totalThb;
    }

    const serviceChargeRate = 0.1;
    const serviceChargeThb = Math.round(subtotal * serviceChargeRate);
    const vatRate = 0.07;
    const vatThb = Math.round((subtotal + serviceChargeThb) * vatRate);
    const grandTotalThb = subtotal + serviceChargeThb + vatThb;

    orderData.totals = {
      subtotalThb: subtotal,
      discountThb: 0,
      serviceChargeRate,
      serviceChargeThb,
      vatRate,
      vatThb,
      grandTotalThb,
    };

    const savedOrder = await this.orderRepo.create(orderData);
    const orderToken = generateOrderToken(savedOrder._id.toString());

    return { order: savedOrder, orderToken };
  }

  async findById(
    id: string,
    actor?: { user?: ICurrentUser; token?: string },
  ): Promise<OrderDocument> {
    const order = await this.orderRepo.findById(id);
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (actor) {
      const isStaffWithBranchAccess =
        actor.user &&
        (actor.user.role === UserRole.ADMIN ||
          actor.user.role === UserRole.BRANCH_MGR ||
          actor.user.role === UserRole.DISPATCHER);

      if (isStaffWithBranchAccess) {
        validateBranchAccess(actor.user!, order.branchId);
      } else {
        // Guest or unauthenticated must provide signed order token
        if (!verifyOrderToken(actor.token, order._id.toString())) {
          throw new ForbiddenException(
            "Access denied: valid order token required",
          );
        }
      }
    }

    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderDocument> {
    const order = await this.orderRepo.findByOrderNumber(orderNumber);
    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }
    return order;
  }

  async confirmOrderPayment(
    orderId: string,
    actor: { user?: ICurrentUser; isWebhook?: boolean },
    paymentRef?: string,
    paidThb?: number,
  ): Promise<OrderDocument> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (!actor.isWebhook) {
      if (!actor.user) {
        throw new ForbiddenException(
          "Order confirmation requires authorization",
        );
      }
      if (
        actor.user.role !== UserRole.ADMIN &&
        actor.user.role !== UserRole.BRANCH_MGR
      ) {
        throw new ForbiddenException(
          "Only admin or branch manager can manually confirm orders",
        );
      }
      validateBranchAccess(actor.user, order.branchId);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is already ${order.status}`,
      );
    }

    if (order.holdId) {
      await this.inventoryService.confirm(order.holdId, order._id);
    }

    const previousStatus = order.status;
    order.status = OrderStatus.CONFIRMED;
    order.payment.status = "PAID";
    if (paymentRef) order.payment.providerRef = paymentRef;
    if (paidThb !== undefined) order.payment.paidThb = paidThb;

    for (const item of order.items) {
      if (item.status === LineStatus.PENDING) {
        item.status = LineStatus.CONFIRMED;
      }
    }

    const saved = await order.save();

    if (this.auditService) {
      await this.auditService.log({
        who: actor.user
          ? AuditService.fromCurrentUser(actor.user)
          : {
              userId: null,
              email: "webhook@payment",
              role: "WEBHOOK",
              isPlatformAdmin: false,
            },
        action: AuditAction.ORDER_CONFIRM,
        targetType: "order",
        targetId: order._id.toString(),
        branchId: order.branchId.toString(),
        from: { status: previousStatus },
        to: {
          status: OrderStatus.CONFIRMED,
          paymentStatus: "PAID",
          paymentRef,
        },
        metadata: { manual: !actor.isWebhook, paidThb },
      });
    }

    return saved;
  }

  async cancelOrderLine(
    orderId: string,
    lineId: string,
    actor: { user?: ICurrentUser; token?: string },
    reason: string,
    refundThb = 0,
  ): Promise<OrderDocument> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const isStaff =
      actor.user &&
      (actor.user.role === UserRole.ADMIN ||
        actor.user.role === UserRole.BRANCH_MGR);

    if (isStaff) {
      validateBranchAccess(actor.user!, order.branchId);
    } else {
      if (!verifyOrderToken(actor.token, order._id.toString())) {
        throw new ForbiddenException(
          "Access denied: valid order token required",
        );
      }
    }

    const line = order.items.find((item) => item.lineId === lineId);
    if (!line) {
      throw new NotFoundException(`Order line ${lineId} not found`);
    }
    if (line.status === LineStatus.CANCELLED) {
      throw new BadRequestException(`Line ${lineId} is already cancelled`);
    }

    // Cancellation policy check for guests: cannot cancel if already started
    if (!isStaff && line.startsAt && new Date(line.startsAt) <= new Date()) {
      throw new BadRequestException(
        "Line cannot be cancelled after scheduled start time",
      );
    }

    const previousLineStatus = line.status;
    line.status = LineStatus.CANCELLED;
    line.cancelledAt = new Date();
    line.cancelReason = reason;
    line.refundThb = refundThb;

    if (order.status === OrderStatus.CONFIRMED && line.slotRefs?.length) {
      await this.inventoryService.returnBooked(
        line.slotRefs.map((r) => ({ slotKey: r.slotKey, qty: r.qty })),
      );
    }

    const saved = await order.save();

    if (this.auditService) {
      await this.auditService.log({
        who: actor.user
          ? AuditService.fromCurrentUser(actor.user)
          : {
              userId: null,
              email: "guest@order-token",
              role: "GUEST",
              isPlatformAdmin: false,
            },
        action: AuditAction.ORDER_LINE_CANCEL,
        targetType: "order_line",
        targetId: lineId,
        branchId: order.branchId.toString(),
        from: { status: previousLineStatus },
        to: { status: LineStatus.CANCELLED, reason, refundThb },
        metadata: { orderId: order._id.toString(), lineKind: line.kind },
      });
    }

    return saved;
  }

  async listOrdersByBranch(
    branchId: string,
    status?: OrderStatus,
    limit = 50,
  ): Promise<OrderDocument[]> {
    return this.orderRepo.findAllByBranch(
      new Types.ObjectId(branchId),
      status,
      limit,
    );
  }
}
