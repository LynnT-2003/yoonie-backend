import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Order, OrderDocument } from "./entity/order.entity";
import { OrderStatus } from "../common/enums/order.enum";

@Injectable()
export class OrderRepo {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  async create(data: Partial<Order>): Promise<OrderDocument> {
    const order = new this.orderModel(data);
    return order.save();
  }

  async findById(id: string | Types.ObjectId): Promise<OrderDocument | null> {
    return this.orderModel.findById(id).exec();
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderDocument | null> {
    return this.orderModel.findOne({ orderNumber }).exec();
  }

  async findAllByBranch(
    branchId: Types.ObjectId,
    status?: OrderStatus,
    limit = 50,
  ): Promise<OrderDocument[]> {
    const filter: Record<string, unknown> = { branchId };
    if (status) filter.status = status;
    return this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}
