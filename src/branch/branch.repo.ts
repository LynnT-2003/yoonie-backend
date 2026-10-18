import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Branch, BranchDocument } from "./entity/branch.entity";

@Injectable()
export class BranchRepo {
  constructor(
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
  ) {}

  async create(data: Partial<Branch>): Promise<BranchDocument> {
    const branch = new this.branchModel(data);
    return branch.save();
  }

  async findById(id: string | Types.ObjectId): Promise<BranchDocument | null> {
    return this.branchModel.findById(id).exec();
  }

  async findByCode(code: string): Promise<BranchDocument | null> {
    return this.branchModel.findOne({ code }).exec();
  }

  async findAll(activeOnly = true): Promise<BranchDocument[]> {
    const filter = activeOnly ? { isActive: true } : {};
    return this.branchModel.find(filter).exec();
  }

  async addImages(
    id: string | Types.ObjectId,
    images: string[],
    heroImageUrl?: string,
  ): Promise<BranchDocument | null> {
    const update: Record<string, unknown> = {
      $push: { images: { $each: images } },
    };
    if (heroImageUrl) {
      update.heroImageUrl = heroImageUrl;
    }
    return this.branchModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
  }

  async removeImage(
    id: string | Types.ObjectId,
    imageUrl: string,
  ): Promise<BranchDocument | null> {
    return this.branchModel
      .findByIdAndUpdate(
        id,
        { $pull: { images: imageUrl } },
        { new: true },
      )
      .exec();
  }

  async updateLogo(
    id: string | Types.ObjectId,
    logoUrl: string,
  ): Promise<BranchDocument | null> {
    return this.branchModel
      .findByIdAndUpdate(id, { logoUrl }, { new: true })
      .exec();
  }
}
