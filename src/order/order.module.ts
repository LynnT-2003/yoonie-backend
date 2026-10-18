import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Order, OrderSchema } from "./entity/order.entity";
import { OrderRepo } from "./order.repo";
import { OrderService } from "./order.service";
import { OrderController } from "./order.controller";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    InventoryModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderRepo],
  exports: [OrderService, OrderRepo, MongooseModule],
})
export class OrderModule {}
