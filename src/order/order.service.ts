import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { OrderRepo } from "./order.repo";
import { Order, OrderDocument } from "./entity/order.entity";
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
  ) {}

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
