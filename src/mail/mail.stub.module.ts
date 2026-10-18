import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { MailStubService } from "./mail.stub.service";

@Module({
  providers: [{ provide: MailService, useClass: MailStubService }],
  exports: [MailService],
})
export class MailStubModule {}
