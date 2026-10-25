import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Room, RoomSchema } from "./entity/room.entity";
import { RoomRepo } from "./room.repo";
import { RoomService } from "./room.service";
import { RoomController } from "./room.controller";
import { R2Module } from "../storage/r2.module";

import { Order, OrderSchema } from "../order/entity/order.entity";
import {
  OperationalDispatch,
  OperationalDispatchSchema,
} from "../dispatch/entity/operational-dispatch.entity";
import { User, UserSchema } from "../user/entity/user.entity";
import { Branch, BranchSchema } from "../branch/entity/branch.entity";

import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OperationalDispatch.name, schema: OperationalDispatchSchema },
      { name: User.name, schema: UserSchema },
      { name: Branch.name, schema: BranchSchema },
    ]),
    R2Module,
    NotificationsModule,
  ],
  controllers: [RoomController],
  providers: [RoomService, RoomRepo],
  exports: [RoomService, RoomRepo, MongooseModule],
})
export class RoomModule {}
