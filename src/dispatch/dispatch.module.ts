import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  OperationalDispatch,
  OperationalDispatchSchema,
} from "./entity/operational-dispatch.entity";
import {
  IdempotencyKey,
  IdempotencyKeySchema,
} from "../staff/entity/idempotency-key.entity";
import { IdempotencyInterceptor } from "../staff/interceptors/idempotency.interceptor";
import { DispatchRepo } from "./dispatch.repo";
import { DispatchService } from "./dispatch.service";
import { DispatchController } from "./dispatch.controller";
import { DispatchPlannerService } from "./dispatch-planner.service";
import { Room, RoomSchema } from "../room/entity/room.entity";
import { StaffModule } from "../staff/staff.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { Branch, BranchSchema } from "../branch/entity/branch.entity";
import { Service, ServiceSchema } from "../service/entity/service.entity";
import { User, UserSchema } from "../user/entity/user.entity";
import {
  InventorySlot,
  InventorySlotSchema,
} from "../inventory/entity/inventory-slot.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OperationalDispatch.name, schema: OperationalDispatchSchema },
      { name: IdempotencyKey.name, schema: IdempotencyKeySchema },
      { name: Branch.name, schema: BranchSchema },
      { name: Service.name, schema: ServiceSchema },
      { name: User.name, schema: UserSchema },
      { name: InventorySlot.name, schema: InventorySlotSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
    StaffModule,
    NotificationsModule,
  ],
  controllers: [DispatchController],
  providers: [
    DispatchService,
    DispatchPlannerService,
    DispatchRepo,
    IdempotencyInterceptor,
  ],
  exports: [
    DispatchService,
    DispatchPlannerService,
    DispatchRepo,
    MongooseModule,
  ],
})
export class DispatchModule {}
