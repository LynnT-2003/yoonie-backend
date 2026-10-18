import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Branch, BranchSchema } from "./entity/branch.entity";
import { BranchRepo } from "./branch.repo";
import { BranchService } from "./branch.service";
import { BranchController } from "./branch.controller";
import { R2Module } from "../storage/r2.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Branch.name, schema: BranchSchema }]),
    R2Module,
  ],
  controllers: [BranchController],
  providers: [BranchService, BranchRepo],
  exports: [BranchService, BranchRepo, MongooseModule],
})
export class BranchModule {}
