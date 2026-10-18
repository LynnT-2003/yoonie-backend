import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Service, ServiceDocument } from "./entity/service.entity";
import { ServiceCategory } from "../common/enums/service.enum";

@Injectable()
export class ServiceRepo {
  constructor(
    @InjectModel(Service.name)
    private readonly serviceModel: Model<ServiceDocument>,
  ) {}

  async create(data: Partial<Service>): Promise<ServiceDocument> {
    const service = new this.serviceModel(data);
    return service.save();
  }

  async findById(id: string | Types.ObjectId): Promise<ServiceDocument | null> {
    return this.serviceModel.findById(id).exec();
  }

  async findByCode(
    branchId: Types.ObjectId,
    code: string,
  ): Promise<ServiceDocument | null> {
    return this.serviceModel.findOne({ branchId, code }).exec();
  }

  async findAllByBranch(
    branchId: Types.ObjectId,
    category?: ServiceCategory,
  ): Promise<ServiceDocument[]> {
    const filter: Record<string, unknown> = { branchId, isActive: true };
    if (category) filter.category = category;
    return this.serviceModel.find(filter).exec();
  }
}
