import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { Notification, NotificationSchema } from "./entity/notification.entity";
import { User, UserSchema } from "../user/entity/user.entity";
import { Branch, BranchSchema } from "../branch/entity/branch.entity";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationsWorker } from "./notifications.worker";
import { SmsService } from "./services/sms.service";
import { DevicesModule } from "../devices/devices.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: Branch.name, schema: BranchSchema },
    ]),
    DevicesModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsWorker, SmsService],
  exports: [NotificationsService, SmsService],
})
export class NotificationsModule {}
