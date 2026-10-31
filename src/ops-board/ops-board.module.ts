import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Order, OrderSchema } from "../order/entity/order.entity";
import { Service, ServiceSchema } from "../service/entity/service.entity";
import {
  InventorySlot,
  InventorySlotSchema,
} from "../inventory/entity/inventory-slot.entity";
import { User, UserSchema } from "../user/entity/user.entity";
import { Branch, BranchSchema } from "../branch/entity/branch.entity";
import {
  OperationalDispatch,
  OperationalDispatchSchema,
} from "../dispatch/entity/operational-dispatch.entity";
import { OpsBoardController } from "./ops-board.controller";
import { OpsBoardService } from "./ops-board.service";

/** Read-only operational views (services, guests, insights) composed from orders, inventory and profiles. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: InventorySlot.name, schema: InventorySlotSchema },
      { name: User.name, schema: UserSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: OperationalDispatch.name, schema: OperationalDispatchSchema },
    ]),
  ],
  controllers: [OpsBoardController],
  providers: [OpsBoardService],
})
export class OpsBoardModule {}
