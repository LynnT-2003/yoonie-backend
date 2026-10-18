import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AuthModule } from "./auth/auth.module";
import { UserModule } from "./user/user.module";
import { JwtGuard } from "./common/guards/jwt.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { loadEnvConfigs } from "./common/config/env.config";
import { MongoModule } from "./mongo-client/mongo.module";
import { BranchModule } from "./branch/branch.module";
import { RoomModule } from "./room/room.module";
import { RestaurantModule } from "./restaurant/restaurant.module";
import { ServiceModule } from "./service/service.module";
import { InventoryModule } from "./inventory/inventory.module";
import { OrderModule } from "./order/order.module";
import { DispatchModule } from "./dispatch/dispatch.module";

@Module({
  imports: [
    // ─── Config ────────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      load: [loadEnvConfigs],
    }),

    // ─── Rate Limiting ─────────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl:
              (Number(process.env.RATE_LIMIT_TIMEFRAME_SECONDS) || 60) * 1000,
            limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
          },
        ],
      }),
    }),

    // ─── Database (added by yulio init / dev:setup-{mongo,postgres}) ──────────
    // The chosen db variant injects its connection module here:
    //   db-mongoose → MongooseModule.forRootAsync({ ... })
    //   db-postgres → PrismaModule

    // ─── Feature Modules ───────────────────────────────────────────────────────
    AuthModule,
    UserModule,
    MongoModule,
    BranchModule,
    RoomModule,
    RestaurantModule,
    ServiceModule,
    InventoryModule,
    OrderModule,
    DispatchModule,
  ],
  providers: [
    // ─── Global Guards ─────────────────────────────────────────────────────────
    // ThrottlerGuard runs first — IP-based rate limit on every request
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JwtGuard protects all routes by default — use @Public() to opt out
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
    // RolesGuard runs after JwtGuard — req.user is already populated
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },

    // ─── Global Filter ─────────────────────────────────────────────────────────
    // Registered here via DI so guards/services can be injected if needed later
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // ─── Global Interceptor ────────────────────────────────────────────────────
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
