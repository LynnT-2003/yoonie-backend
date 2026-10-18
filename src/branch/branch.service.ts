import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { BranchRepo } from "./branch.repo";
import { BranchDocument } from "./entity/branch.entity";
import { CreateBranchDto } from "./dto/requests/create-branch.dto";

@Injectable()
export class BranchService {
  constructor(private readonly branchRepo: BranchRepo) {}

  async create(dto: CreateBranchDto): Promise<BranchDocument> {
    const existing = await this.branchRepo.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Branch code ${dto.code} already exists`);
    }
    return this.branchRepo.create(dto);
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
