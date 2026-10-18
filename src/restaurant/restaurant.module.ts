import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Restaurant, RestaurantSchema } from "./entity/restaurant.entity";
import { RestaurantRepo } from "./restaurant.repo";
import { RestaurantService } from "./restaurant.service";
import { RestaurantController } from "./restaurant.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Restaurant.name, schema: RestaurantSchema },
    ]),
  ],
  controllers: [RestaurantController],
  providers: [RestaurantService, RestaurantRepo],
  exports: [RestaurantService, RestaurantRepo, MongooseModule],
})
export class RestaurantModule {}
