import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Branch,
  BranchSchema,
  HospitalityUser,
  HospitalityUserSchema,
  InventoryHold,
  InventoryHoldSchema,
  InventorySlot,
  InventorySlotSchema,
  OperationalDispatch,
  OperationalDispatchSchema,
  Order,
  OrderSchema,
  Restaurant,
  RestaurantSchema,
  Room,
  RoomSchema,
  Service,
  ServiceSchema,
} from "./schemas";
import { InventoryService } from "./services/inventory.service";
import { OrderService } from "./services/order.service";
import { RoomService } from "./services/room.service";
import { DispatchService } from "./services/dispatch.service";
import { BookingController } from "./controllers/booking.controller";
import { RoomController } from "./controllers/room.controller";
import { DispatchController } from "./controllers/dispatch.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Branch.name, schema: BranchSchema },
      { name: HospitalityUser.name, schema: HospitalityUserSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: InventorySlot.name, schema: InventorySlotSchema },
      { name: InventoryHold.name, schema: InventoryHoldSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OperationalDispatch.name, schema: OperationalDispatchSchema },
    ]),
  ],
  controllers: [BookingController, RoomController, DispatchController],
  providers: [InventoryService, OrderService, RoomService, DispatchService],
  exports: [
    MongooseModule,
    InventoryService,
    OrderService,
    RoomService,
    DispatchService,
  ],
})
export class HospitalityModule {}
