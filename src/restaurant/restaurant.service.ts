import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { RestaurantRepo } from "./restaurant.repo";
import { RestaurantDocument } from "./entity/restaurant.entity";
import { R2Service } from "../storage/r2.service";
import { CreateRestaurantDto } from "./dto/requests/create-restaurant.dto";
import { UpdateRestaurantDto } from "./dto/requests/update-restaurant.dto";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";

@Injectable()
export class RestaurantService {
  constructor(
    private readonly restaurantRepo: RestaurantRepo,
    private readonly r2Service: R2Service,
  ) {}

  async create(
    user: ICurrentUser,
    dto: CreateRestaurantDto,
  ): Promise<RestaurantDocument> {
    validateBranchAccess(user, dto.branchId);

    const totalSeats = (dto.tables || []).reduce(
      (acc, t) => acc + (t.seats || 0),
      0,
    );

    return this.restaurantRepo.create({
      branchId: new Types.ObjectId(dto.branchId),
      code: dto.code,
      name: dto.name,
      cuisine: dto.cuisine,
      maxSeats: dto.maxSeats,
      totalSeats,
      avgTurnMinutes: dto.avgTurnMinutes || 90,
      tables: (dto.tables || []) as any,
      shifts: (dto.shifts || []) as any,
      coverImage: dto.coverImage,
      images: dto.images || [],
      isActive: true,
    });
  }

  async uploadImages(
    user: ICurrentUser,
    restaurantId: string,
    files: Express.Multer.File[],
    isCover: boolean = false,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new NotFoundException(`Restaurant ${restaurantId} not found`);
    }
    validateBranchAccess(user, restaurant.branchId);

    const folder = `restaurants/${restaurant.branchId.toString()}/${restaurant.code.toLowerCase()}`;
    const uploadPromises = files.map((file) =>
      this.r2Service.uploadFile(file, folder),
    );
    const results = await Promise.all(uploadPromises);
    const urls = results.map((r) => r.url);

    const coverUrl = isCover && urls.length > 0 ? urls[0] : undefined;
    const updated = await this.restaurantRepo.addImages(
      restaurant._id,
      urls,
      coverUrl,
    );
    return updated!;
  }

  async removeImage(
    user: ICurrentUser,
    restaurantId: string,
    imageUrl: string,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new NotFoundException(`Restaurant ${restaurantId} not found`);
    }
    validateBranchAccess(user, restaurant.branchId);

    const updated = await this.restaurantRepo.removeImage(
      restaurant._id,
      imageUrl,
    );
    return updated!;
  }

  async findAllByBranch(branchId: string): Promise<RestaurantDocument[]> {
    return this.restaurantRepo.findAllByBranch(new Types.ObjectId(branchId));
  }

  async findById(id: string): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantRepo.findById(id);
    if (!restaurant) {
      throw new NotFoundException(`Restaurant ${id} not found`);
    }
    return restaurant;
  }

  async findByCode(
    branchId: string,
    code: string,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantRepo.findByCode(
      new Types.ObjectId(branchId),
      code,
    );
    if (!restaurant) {
      throw new NotFoundException(`Restaurant code ${code} not found`);
    }
    return restaurant;
  }

  async update(
    user: ICurrentUser,
    id: string,
    dto: UpdateRestaurantDto,
  ): Promise<RestaurantDocument> {
    const existing = await this.findById(id);
    validateBranchAccess(user, existing.branchId);

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.cuisine !== undefined) updateData.cuisine = dto.cuisine;
    if (dto.maxSeats !== undefined) updateData.maxSeats = dto.maxSeats;
    if (dto.avgTurnMinutes !== undefined)
      updateData.avgTurnMinutes = dto.avgTurnMinutes;
    if (dto.tables !== undefined) {
      updateData.tables = dto.tables;
      updateData.totalSeats = (dto.tables || []).reduce(
        (acc, t) => acc + (t.seats || 0),
        0,
      );
    }
    if (dto.shifts !== undefined) updateData.shifts = dto.shifts;
    if (dto.coverImage !== undefined) updateData.coverImage = dto.coverImage;
    if (dto.images !== undefined) updateData.images = dto.images;

    const updated = await this.restaurantRepo.update(
      new Types.ObjectId(id),
      updateData as any,
    );
    if (!updated) {
      throw new NotFoundException(`Restaurant ${id} not found`);
    }
    return updated;
  }
}
