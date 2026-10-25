import {
  Notification,
  NotificationSchema,
} from "../notifications/entity/notification.entity";
import { User, UserSchema } from "../user/entity/user.entity";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { IdempotencyInterceptor } from "./interceptors/idempotency.interceptor";
import {
  IdempotencyKey,
  IdempotencyKeySchema,
} from "./entity/idempotency-key.entity";
import {
  OperationalDispatch,
  OperationalDispatchSchema,
} from "../dispatch/entity/operational-dispatch.entity";
import { Room, RoomSchema } from "../room/entity/room.entity";
import { Branch, BranchSchema } from "../branch/entity/branch.entity";
import { UserModule } from "../user/user.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IdempotencyKey.name, schema: IdempotencyKeySchema },
      { name: OperationalDispatch.name, schema: OperationalDispatchSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: User.name, schema: UserSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
    UserModule,
    NotificationsModule,
  ],
  controllers: [StaffController],
  providers: [StaffService, IdempotencyInterceptor],
  exports: [StaffService, IdempotencyInterceptor],
})
export class StaffModule {}
