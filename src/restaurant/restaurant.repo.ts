import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Restaurant, RestaurantDocument } from "./entity/restaurant.entity";

@Injectable()
export class RestaurantRepo {
  constructor(
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
  ) {}

  async create(data: Partial<Restaurant>): Promise<RestaurantDocument> {
    const restaurant = new this.restaurantModel(data);
    return restaurant.save();
  }

  async findById(
    id: string | Types.ObjectId,
  ): Promise<RestaurantDocument | null> {
    return this.restaurantModel.findById(id).exec();
  }

  async findByCode(
    branchId: Types.ObjectId,
    code: string,
  ): Promise<RestaurantDocument | null> {
    return this.restaurantModel.findOne({ branchId, code }).exec();
  }

  async findAllByBranch(
    branchId: Types.ObjectId,
  ): Promise<RestaurantDocument[]> {
    return this.restaurantModel.find({ branchId, isActive: true }).exec();
  }
}
