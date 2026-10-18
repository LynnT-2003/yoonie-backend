import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { User, UserSchema } from "./entity/user.entity";
import { UserService } from "./user.service";
import { UserController } from "./user.controller";
import { UserRepo } from "./user.repo";
import { MailModule } from "../mail/mail.module";
import { R2Module } from "../storage/r2.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MailModule,
    R2Module,
  ],
  controllers: [UserController],
  providers: [UserService, UserRepo],
  exports: [UserService, UserRepo],
})
export class UserModule {}
