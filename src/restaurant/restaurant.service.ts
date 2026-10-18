import { Injectable, NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import { RestaurantRepo } from "./restaurant.repo";
import { RestaurantDocument } from "./entity/restaurant.entity";

@Injectable()
export class RestaurantService {
  constructor(private readonly restaurantRepo: RestaurantRepo) {}

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
