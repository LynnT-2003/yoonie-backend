import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { OrderRepo } from "./order.repo";
import { Order, OrderDocument } from "./entity/order.entity";
import { InventoryService } from "../inventory/inventory.service";
import { LineStatus, OrderStatus } from "../common/enums/order.enum";

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepo: OrderRepo,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(orderData: Partial<Order>): Promise<OrderDocument> {
    return this.orderRepo.create(orderData);
  }

  async findById(id: string): Promise<OrderDocument> {
    const order = await this.orderRepo.findById(id);
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
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
    paymentRef?: string,
    paidThb?: number,
  ): Promise<OrderDocument> {
    const order = await this.findById(orderId);
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is already ${order.status}`,
      );
    }

    if (order.holdId) {
      await this.inventoryService.confirm(order.holdId, order._id);
    }

    order.status = OrderStatus.CONFIRMED;
    order.payment.status = "PAID";
    if (paymentRef) order.payment.providerRef = paymentRef;
    if (paidThb !== undefined) order.payment.paidThb = paidThb;

    for (const item of order.items) {
      if (item.status === LineStatus.PENDING) {
        item.status = LineStatus.CONFIRMED;
      }
    }

    return order.save();
  }

  async cancelOrderLine(
    orderId: string,
    lineId: string,
    reason: string,
    refundThb = 0,
  ): Promise<OrderDocument> {
    const order = await this.findById(orderId);
    const line = order.items.find((item) => item.lineId === lineId);
    if (!line) {
      throw new NotFoundException(`Order line ${lineId} not found`);
    }
    if (line.status === LineStatus.CANCELLED) {
      throw new BadRequestException(`Line ${lineId} is already cancelled`);
    }

    line.status = LineStatus.CANCELLED;
    line.cancelledAt = new Date();
    line.cancelReason = reason;
    line.refundThb = refundThb;

    if (order.status === OrderStatus.CONFIRMED && line.slotRefs?.length) {
      await this.inventoryService.returnBooked(
        line.slotRefs.map((r) => ({ slotKey: r.slotKey, qty: r.qty })),
      );
    }

    return order.save();
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
