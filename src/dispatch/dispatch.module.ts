import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  OperationalDispatch,
  OperationalDispatchSchema,
} from "./entity/operational-dispatch.entity";
import { DispatchRepo } from "./dispatch.repo";
import { DispatchService } from "./dispatch.service";
import { DispatchController } from "./dispatch.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OperationalDispatch.name, schema: OperationalDispatchSchema },
    ]),
  ],
  controllers: [DispatchController],
  providers: [DispatchService, DispatchRepo],
  exports: [DispatchService, DispatchRepo, MongooseModule],
})
export class DispatchModule {}
