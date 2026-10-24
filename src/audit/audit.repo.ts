import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AuditLog, AuditLogDocument } from "./entity/audit-log.entity";

@Injectable()
export class AuditRepo {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async create(data: Partial<AuditLog>): Promise<AuditLogDocument> {
    return this.auditLogModel.create({
      ...data,
      when: data.when || new Date(),
    });
  }

  async findByTarget(
    targetType: string,
    targetId: string,
  ): Promise<AuditLogDocument[]> {
    return this.auditLogModel
      .find({ targetType, targetId })
      .sort({ when: -1 })
      .exec();
  }
}
