import { Injectable, NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import { ServiceRepo } from "./service.repo";
import { ServiceDocument } from "./entity/service.entity";
import { ServiceCategory } from "../common/enums/service.enum";

@Injectable()
export class ServiceService {
  constructor(private readonly serviceRepo: ServiceRepo) {}

  async findAllByBranch(
    branchId: string,
    category?: ServiceCategory,
  ): Promise<ServiceDocument[]> {
    return this.serviceRepo.findAllByBranch(
      new Types.ObjectId(branchId),
      category,
    );
  }

  async findById(id: string): Promise<ServiceDocument> {
    const service = await this.serviceRepo.findById(id);
    if (!service) {
      throw new NotFoundException(`Service ${id} not found`);
    }
    return service;
  }

  async findByCode(branchId: string, code: string): Promise<ServiceDocument> {
    const service = await this.serviceRepo.findByCode(
      new Types.ObjectId(branchId),
      code,
    );
    if (!service) {
      throw new NotFoundException(`Service code ${code} not found`);
    }
    return service;
  }
}
