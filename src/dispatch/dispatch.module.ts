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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OperationalDispatch.name, schema: OperationalDispatchSchema },
      { name: IdempotencyKey.name, schema: IdempotencyKeySchema },
    ]),
  ],
  controllers: [DispatchController],
  providers: [DispatchService, DispatchRepo, IdempotencyInterceptor],
  exports: [DispatchService, DispatchRepo, MongooseModule],
})
export class DispatchModule {}
