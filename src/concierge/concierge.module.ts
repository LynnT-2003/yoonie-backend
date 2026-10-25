import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { BranchModule } from "../branch/branch.module";
import { RoomModule } from "../room/room.module";
import { ServiceModule } from "../service/service.module";
import { RestaurantModule } from "../restaurant/restaurant.module";
import { InventoryModule } from "../inventory/inventory.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { Order, OrderSchema } from "../order/entity/order.entity";
import { User, UserSchema } from "../user/entity/user.entity";
import { ConciergeController } from "./concierge.controller";
import { ConciergeService } from "./concierge.service";
import { ConciergeKeyGuard } from "./concierge-key.guard";

@Module({
  imports: [
    BranchModule,
    RoomModule,
    ServiceModule,
    RestaurantModule,
    InventoryModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ConciergeController],
  providers: [ConciergeService, ConciergeKeyGuard],
})
export class ConciergeModule {}
