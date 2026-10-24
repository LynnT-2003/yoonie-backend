import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { ServiceRepo } from "./service.repo";
import { ServiceDocument } from "./entity/service.entity";
import { ServiceCategory } from "../common/enums/service.enum";
import { R2Service } from "../storage/r2.service";
import { CreateServiceDto } from "./dto/requests/create-service.dto";
import { UpdateServiceDto } from "./dto/requests/update-service.dto";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";

@Injectable()
export class ServiceService {
  constructor(
    private readonly serviceRepo: ServiceRepo,
    private readonly r2Service: R2Service,
  ) {}

  async create(
    user: ICurrentUser,
    dto: CreateServiceDto,
  ): Promise<ServiceDocument> {
    validateBranchAccess(user, dto.branchId);

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
    user: ICurrentUser,
    serviceId: string,
    files: Express.Multer.File[],
    isCover: boolean = false,
  ): Promise<ServiceDocument> {
    const service = await this.serviceRepo.findById(serviceId);
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found`);
    }
    validateBranchAccess(user, service.branchId);

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

  async removeImage(
    user: ICurrentUser,
    serviceId: string,
    imageUrl: string,
  ): Promise<ServiceDocument> {
    const service = await this.serviceRepo.findById(serviceId);
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found`);
    }
    validateBranchAccess(user, service.branchId);

    const updated = await this.serviceRepo.removeImage(service._id, imageUrl);
    return updated!;
  }

  async findAllByBranch(
    branchId: string,
    category?: ServiceCategory,
  ): Promise<ServiceDocument[]> {
    const list = await this.serviceRepo.findAllByBranch(
      new Types.ObjectId(branchId),
      category,
    );
    return list.filter((s) => s.isActive !== false);
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

  async update(
    user: ICurrentUser,
    id: string,
    dto: UpdateServiceDto,
  ): Promise<ServiceDocument> {
    const existing = await this.findById(id);
    validateBranchAccess(user, existing.branchId);

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.kind !== undefined) updateData.kind = dto.kind;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.basePriceThb !== undefined)
      updateData.basePriceThb = dto.basePriceThb;
    if (dto.pricingModel !== undefined)
      updateData.pricingModel = dto.pricingModel;
    if (dto.coverImage !== undefined) updateData.coverImage = dto.coverImage;
    if (dto.images !== undefined) updateData.images = dto.images;
    if (dto.tour !== undefined) updateData.tour = dto.tour;
    if (dto.wellness !== undefined) updateData.wellness = dto.wellness;
    if (dto.transfer !== undefined) updateData.transfer = dto.transfer;

    const updated = await this.serviceRepo.update(id, updateData as any);
    if (!updated) {
      throw new NotFoundException(`Service ${id} not found`);
    }
    return updated;
  }
}
