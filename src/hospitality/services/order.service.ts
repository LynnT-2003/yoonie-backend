import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Order, OrderDocument } from "../schemas/order.schema";
import { InventoryService } from "./inventory.service";
import { LineStatus, OrderStatus } from "../common/hospitality.enums";

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(orderData: Partial<Order>): Promise<OrderDocument> {
    const order = new this.orderModel(orderData);
    return order.save();
  }

  async findById(id: string | Types.ObjectId): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException(`Order ${String(id)} not found`);
    }
    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderDocument> {
    const order = await this.orderModel.findOne({ orderNumber }).exec();
    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }
    return order;
  }

  async confirmOrderPayment(
    orderId: string | Types.ObjectId,
    paymentRef?: string,
    paidThb?: number,
  ): Promise<OrderDocument> {
    const order = await this.findById(orderId);
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is already ${order.status}`,
      );
    }

    // Convert inventory hold if order has holdId
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
    orderId: string | Types.ObjectId,
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

    // Return inventory slots if previously confirmed
    if (order.status === OrderStatus.CONFIRMED && line.slotRefs?.length) {
      await this.inventoryService.returnBooked(
        line.slotRefs.map((r) => ({ slotKey: r.slotKey, qty: r.qty })),
      );
    }

    return order.save();
  }

  async listOrdersByBranch(
    branchId: string | Types.ObjectId,
    status?: OrderStatus,
    limit = 50,
  ): Promise<OrderDocument[]> {
    const filter: Record<string, unknown> = {
      branchId: new Types.ObjectId(branchId),
    };
    if (status) filter.status = status;
    return this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}
