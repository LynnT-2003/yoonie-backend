import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Restaurant, RestaurantSchema } from "./entity/restaurant.entity";
import { RestaurantRepo } from "./restaurant.repo";
import { RestaurantService } from "./restaurant.service";
import { RestaurantController } from "./restaurant.controller";
import { R2Module } from "../storage/r2.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Restaurant.name, schema: RestaurantSchema },
    ]),
    R2Module,
  ],
  controllers: [RestaurantController],
  providers: [RestaurantService, RestaurantRepo],
  exports: [RestaurantService, RestaurantRepo, MongooseModule],
})
export class RestaurantModule {}
