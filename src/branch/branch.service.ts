import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { BranchRepo } from "./branch.repo";
import { BranchDocument } from "./entity/branch.entity";
import { CreateBranchDto } from "./dto/requests/create-branch.dto";
import { R2Service } from "../storage/r2.service";

@Injectable()
export class BranchService {
  constructor(
    private readonly branchRepo: BranchRepo,
    private readonly r2Service: R2Service,
  ) {}

  private async resolveBranch(idOrCode: string): Promise<BranchDocument> {
    if (Types.ObjectId.isValid(idOrCode)) {
      const b = await this.branchRepo.findById(idOrCode);
      if (b) return b;
    }
    const b = await this.branchRepo.findByCode(idOrCode);
    if (!b) {
      throw new NotFoundException(`Branch ${idOrCode} not found`);
    }
    return b;
  }

  async create(
    dto: CreateBranchDto,
    files?: {
      logo?: Express.Multer.File[];
      heroImage?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ): Promise<BranchDocument> {
    const existing = await this.branchRepo.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Branch code ${dto.code} already exists`);
    }

    let logoUrl = dto.logoUrl;
    let heroImageUrl = dto.heroImageUrl;
    const imageUrls = [...(dto.images || [])];
    const folder = `branches/${dto.code.toLowerCase()}`;

    // 1. Upload logo if provided
    if (files?.logo && files.logo[0]) {
      const uploadRes = await this.r2Service.uploadFile(files.logo[0], folder);
      logoUrl = uploadRes.url;
    }

    // 2. Upload hero image if provided
    if (files?.heroImage && files.heroImage[0]) {
      const uploadRes = await this.r2Service.uploadFile(
        files.heroImage[0],
        folder,
      );
      heroImageUrl = uploadRes.url;
    }

    // 3. Upload gallery images if provided
    if (files?.images && files.images.length > 0) {
      const uploadPromises = files.images.map((file) =>
        this.r2Service.uploadFile(file, folder),
      );
      const results = await Promise.all(uploadPromises);
      imageUrls.push(...results.map((r) => r.url));
    }

    return this.branchRepo.create({
      code: dto.code,
      name: dto.name,
      timezone: dto.timezone || "Asia/Bangkok",
      currency: dto.currency || "THB",
      contactPhoneE164: dto.contactPhoneE164,
      contactEmail: dto.contactEmail,
      logoUrl,
      heroImageUrl,
      images: imageUrls,
      isActive: true,
    });
  }

  async uploadImages(
    idOrCode: string,
    files: Express.Multer.File[],
    isHero: boolean = false,
  ): Promise<BranchDocument> {
    const branch = await this.resolveBranch(idOrCode);
    const folder = `branches/${branch.code.toLowerCase()}`;
    const uploadPromises = files.map((file) =>
      this.r2Service.uploadFile(file, folder),
    );
    const results = await Promise.all(uploadPromises);
    const urls = results.map((r) => r.url);

    const heroUrl = isHero && urls.length > 0 ? urls[0] : undefined;
    const updated = await this.branchRepo.addImages(
      branch._id,
      urls,
      heroUrl,
    );
    return updated!;
  }

  async uploadLogo(
    idOrCode: string,
    file: Express.Multer.File,
  ): Promise<BranchDocument> {
    const branch = await this.resolveBranch(idOrCode);
    const folder = `branches/${branch.code.toLowerCase()}`;
    const uploadRes = await this.r2Service.uploadFile(file, folder);
    const updated = await this.branchRepo.updateLogo(branch._id, uploadRes.url);
    return updated!;
  }

  async removeImage(idOrCode: string, imageUrl: string): Promise<BranchDocument> {
    const branch = await this.resolveBranch(idOrCode);
    const updated = await this.branchRepo.removeImage(branch._id, imageUrl);
    return updated!;
  }

  async findById(id: string): Promise<BranchDocument> {
    const branch = await this.branchRepo.findById(id);
    if (!branch) {
      throw new NotFoundException(`Branch ${id} not found`);
    }
    return branch;
  }

  async findByCode(code: string): Promise<BranchDocument> {
    const branch = await this.branchRepo.findByCode(code);
    if (!branch) {
      throw new NotFoundException(`Branch code ${code} not found`);
    }
    return branch;
  }

  async findAll(): Promise<BranchDocument[]> {
    return this.branchRepo.findAll();
  }
}
