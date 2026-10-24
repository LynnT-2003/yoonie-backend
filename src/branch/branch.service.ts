import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { BranchRepo } from "./branch.repo";
import { BranchDocument } from "./entity/branch.entity";
import { CreateBranchDto } from "./dto/requests/create-branch.dto";
import { R2Service } from "../storage/r2.service";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";

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
    user: ICurrentUser,
    dto: CreateBranchDto,
  ): Promise<BranchDocument> {
    if (!user.isPlatformAdmin) {
      throw new ForbiddenException(
        "Only platform administrators can create a branch",
      );
    }

    const existing = await this.branchRepo.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Branch code ${dto.code} already exists`);
    }

    return this.branchRepo.create({
      code: dto.code,
      name: dto.name,
      timezone: dto.timezone || "Asia/Bangkok",
      currency: dto.currency || "THB",
      contactPhoneE164: dto.contactPhoneE164,
      contactEmail: dto.contactEmail,
      logoUrl: dto.logoUrl,
      heroImageUrl: dto.heroImageUrl,
      images: dto.images || [],
      isActive: true,
    });
  }

  async uploadImages(
    user: ICurrentUser,
    idOrCode: string,
    files: Express.Multer.File[],
    isHero: boolean = false,
  ): Promise<BranchDocument> {
    const branch = await this.resolveBranch(idOrCode);
    validateBranchAccess(user, branch._id);

    const folder = `branches/${branch._id.toString()}`;
    const uploadPromises = files.map((file) =>
      this.r2Service.uploadFile(file, folder),
    );
    const results = await Promise.all(uploadPromises);
    const urls = results.map((r) => r.url);

    const heroUrl = isHero && urls.length > 0 ? urls[0] : undefined;
    const updated = await this.branchRepo.addImages(branch._id, urls, heroUrl);
    return updated!;
  }

  async uploadLogo(
    user: ICurrentUser,
    idOrCode: string,
    file: Express.Multer.File,
  ): Promise<BranchDocument> {
    const branch = await this.resolveBranch(idOrCode);
    validateBranchAccess(user, branch._id);

    const folder = `branches/${branch._id.toString()}`;
    const uploadRes = await this.r2Service.uploadFile(file, folder);
    const updated = await this.branchRepo.updateLogo(branch._id, uploadRes.url);
    return updated!;
  }

  async removeImage(
    user: ICurrentUser,
    idOrCode: string,
    imageUrl: string,
  ): Promise<BranchDocument> {
    const branch = await this.resolveBranch(idOrCode);
    validateBranchAccess(user, branch._id);

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
