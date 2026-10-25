import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Order, OrderSchema } from "./entity/order.entity";
import { OrderRepo } from "./order.repo";
import { OrderService } from "./order.service";
import { OrderController } from "./order.controller";
import { InventoryModule } from "../inventory/inventory.module";
import { BranchModule } from "../branch/branch.module";
import { RoomModule } from "../room/room.module";
import { ServiceModule } from "../service/service.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { User, UserSchema } from "../user/entity/user.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
    InventoryModule,
    BranchModule,
    RoomModule,
    ServiceModule,
    DispatchModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepo],
  exports: [OrderService, OrderRepo, MongooseModule],
})
export class OrderModule {}
