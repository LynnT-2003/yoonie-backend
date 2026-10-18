import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryService } from './inventory/inventory.service';
import {
  Branch, BranchSchema, InventoryHold, InventoryHoldSchema, InventorySlot, InventorySlotSchema,
  OperationalDispatch, OperationalDispatchSchema, Order, OrderSchema, Restaurant, RestaurantSchema,
  Room, RoomSchema, Service, ServiceSchema, User, UserSchema,
} from './schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Branch.name, schema: BranchSchema },
      { name: User.name, schema: UserSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Restaurant.name, schema: RestaurantSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: InventorySlot.name, schema: InventorySlotSchema },
      { name: InventoryHold.name, schema: InventoryHoldSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OperationalDispatch.name, schema: OperationalDispatchSchema },
    ]),
  ],
  providers: [InventoryService],
  exports: [MongooseModule, InventoryService],
})
export class HospitalityModule {}
