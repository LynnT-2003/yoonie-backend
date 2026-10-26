import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { Types } from "mongoose";
import * as bcrypt from "bcrypt";
import { BranchRepo } from "./branch.repo";
import { BranchDocument } from "./entity/branch.entity";
import { CreateBranchDto } from "./dto/requests/create-branch.dto";
import { OnboardBranchDto } from "./dto/requests/onboard-branch.dto";
import { R2Service } from "../storage/r2.service";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";
import { UserRepo } from "../user/user.repo";
import { UserService } from "../user/user.service";
import { AuthService } from "../auth/auth.service";
import { UserRole } from "../common/enums/user-role.enum";
import { Permission } from "../common/enums/permission.enum";

@Injectable()
export class BranchService {
  constructor(
    private readonly branchRepo: BranchRepo,
    private readonly r2Service: R2Service,
    private readonly userRepo: UserRepo,
    private readonly userService: UserService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  async onboard(dto: OnboardBranchDto) {
    const slug = dto.slug.toLowerCase().trim();
    const code = slug.toUpperCase();

    // 1. Verify property slug is unique
    const existing = await this.branchRepo.findByCode(code);
    if (existing) {
      throw new ConflictException(
        `Property slug "${slug}" is already taken. Please choose another unique slug.`,
      );
    }

    // 2. Verify owner email is not already registered
    const existingUser = await this.userService.findByEmail(
      dto.ownerEmail.toLowerCase().trim(),
    );
    if (existingUser) {
      throw new ConflictException(
        `An account with email "${dto.ownerEmail}" already exists. Please log in with your existing account.`,
      );
    }

    // 3. Create Branch property in database
    const branch = await this.branchRepo.create({
      code,
      name: dto.hotelName.trim(),
      timezone: dto.timezone || "Asia/Bangkok",
      currency: dto.currency || "THB",
      contactPhoneE164: dto.contactPhoneE164,
      contactEmail: dto.contactEmail || dto.ownerEmail.trim(),
      logoUrl: dto.logoUrl,
      heroImageUrl: dto.heroImageUrl,
      images: [],
      isActive: true,
      settings: {
        checkInTime: "14:00",
        checkOutTime: "12:00",
        vatRate: 0.07,
        serviceChargeRate: 0.1,
        holdTtlMinutes: 15,
        consolidationThreshold: 0.4,
        dispatchGenerationTime: "05:30",
      },
    });

    // 4. Create Owner user account as ADMIN scoped to this branch
    const hashedPassword = await bcrypt.hash(dto.ownerPassword, 10);
    const createdUser = await this.userRepo.create({
      displayName: dto.ownerName.trim(),
      email: dto.ownerEmail.toLowerCase().trim(),
      password: hashedPassword,
      role: UserRole.ADMIN,
      branchIds: [branch._id.toString()],
      permissions: [
        Permission.HOUSEKEEPING_INSPECT,
        Permission.HOUSEKEEPING_STATUS,
        Permission.DISPATCH_MANAGE,
        Permission.PICKUP_EXECUTE,
        Permission.STAFF_MANAGE,
        Permission.NOTIFICATIONS_READ,
      ],
      isEmailVerified: true,
      isSuspended: false,
    });

    // 5. Generate authenticated session tokens for immediate login
    const authResult = await this.authService.login(createdUser);

    return {
      branch,
      user: authResult.user,
      tokens: authResult.tokens,
    };
  }

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
