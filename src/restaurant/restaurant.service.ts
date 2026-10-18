import { Injectable, NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import { RestaurantRepo } from "./restaurant.repo";
import { RestaurantDocument } from "./entity/restaurant.entity";
import { R2Service } from "../storage/r2.service";
import { CreateRestaurantDto } from "./dto/requests/create-restaurant.dto";

@Injectable()
export class RestaurantService {
  constructor(
    private readonly restaurantRepo: RestaurantRepo,
    private readonly r2Service: R2Service,
  ) {}

  async create(
    dto: CreateRestaurantDto,
    files?: {
      coverImage?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ): Promise<RestaurantDocument> {
    let coverImageUrl = dto.coverImage;
    const imageUrls = [...(dto.images || [])];
    const folder = `restaurants/${dto.branchId}/${dto.code.toLowerCase()}`;

    if (files?.coverImage && files.coverImage[0]) {
      const uploadRes = await this.r2Service.uploadFile(
        files.coverImage[0],
        folder,
      );
      coverImageUrl = uploadRes.url;
    }

    if (files?.images && files.images.length > 0) {
      const uploadPromises = files.images.map((file) =>
        this.r2Service.uploadFile(file, folder),
      );
      const results = await Promise.all(uploadPromises);
      imageUrls.push(...results.map((r) => r.url));
    }

    const totalSeats = (dto.tables || []).reduce((acc, t) => acc + (t.seats || 0), 0);

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
      coverImage: coverImageUrl,
      images: imageUrls,
      isActive: true,
    });
  }

  async uploadImages(
    restaurantId: string,
    files: Express.Multer.File[],
    isCover: boolean = false,
  ): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new NotFoundException(`Restaurant ${restaurantId} not found`);
    }

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

  async removeImage(restaurantId: string, imageUrl: string): Promise<RestaurantDocument> {
    const restaurant = await this.restaurantRepo.findById(restaurantId);
    if (!restaurant) {
      throw new NotFoundException(`Restaurant ${restaurantId} not found`);
    }
    const updated = await this.restaurantRepo.removeImage(restaurant._id, imageUrl);
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
}
