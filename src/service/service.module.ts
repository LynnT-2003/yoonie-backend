import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Service, ServiceSchema } from "./entity/service.entity";
import { ServiceRepo } from "./service.repo";
import { ServiceService } from "./service.service";
import { ServiceController } from "./service.controller";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Service.name, schema: ServiceSchema }]),
  ],
  controllers: [ServiceController],
  providers: [ServiceService, ServiceRepo],
  exports: [ServiceService, ServiceRepo, MongooseModule],
})
export class ServiceModule {}
