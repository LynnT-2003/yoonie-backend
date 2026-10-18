import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { UserModule } from "../user/user.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { LocalStrategy } from "./strategies/local.strategy";
import { JwtStrategy } from "../common/strategies/jwt.strategy";
import { LocalGuard } from "./guards/local/local.guard";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [UserModule, PassportModule, JwtModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, LocalGuard],
  exports: [AuthService],
})
export class AuthModule {}
