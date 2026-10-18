import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuditLog, AuditLogSchema } from "./entity/audit-log.entity";
import { AuditRepo } from "./audit.repo";
import { AuditService } from "./audit.service";

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [AuditRepo, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
