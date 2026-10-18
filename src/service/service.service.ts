import { Injectable, NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import { ServiceRepo } from "./service.repo";
import { ServiceDocument } from "./entity/service.entity";
import { ServiceCategory } from "../common/enums/service.enum";
import { R2Service } from "../storage/r2.service";
import { CreateServiceDto } from "./dto/requests/create-service.dto";

@Injectable()
export class ServiceService {
  constructor(
    private readonly serviceRepo: ServiceRepo,
    private readonly r2Service: R2Service,
  ) {}

  async create(dto: CreateServiceDto): Promise<ServiceDocument> {
    return this.serviceRepo.create({
      branchId: new Types.ObjectId(dto.branchId),
      code: dto.code,
      category: dto.category,
      kind: dto.kind,
      name: dto.name,
      description: dto.description,
      coverImage: dto.coverImage,
      images: dto.images || [],
      basePriceThb: dto.basePriceThb,
      pricingModel: dto.pricingModel,
      tour: dto.tour as any,
      wellness: dto.wellness as any,
      transfer: dto.transfer as any,
      isActive: true,
    });
  }

  async uploadImages(
    serviceId: string,
    files: Express.Multer.File[],
    isCover: boolean = false,
  ): Promise<ServiceDocument> {
    const service = await this.serviceRepo.findById(serviceId);
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found`);
    }

    const folder = `services/${service.branchId.toString()}/${service.category.toLowerCase()}`;
    const uploadPromises = files.map((file) =>
      this.r2Service.uploadFile(file, folder),
    );
    const results = await Promise.all(uploadPromises);
    const urls = results.map((r) => r.url);

    const coverUrl = isCover && urls.length > 0 ? urls[0] : undefined;
    const updated = await this.serviceRepo.addImages(
      service._id,
      urls,
      coverUrl,
    );
    return updated!;
  }

  async removeImage(serviceId: string, imageUrl: string): Promise<ServiceDocument> {
    const service = await this.serviceRepo.findById(serviceId);
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found`);
    }
    const updated = await this.serviceRepo.removeImage(service._id, imageUrl);
    return updated!;
  }

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
