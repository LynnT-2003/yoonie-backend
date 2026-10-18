import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  OperationalDispatch,
  OperationalDispatchDocument,
} from "../schemas/dispatch.schema";
import { DispatchStatus, DispatchType } from "../common/hospitality.enums";

@Injectable()
export class DispatchService {
  constructor(
    @InjectModel(OperationalDispatch.name)
    private readonly dispatchModel: Model<OperationalDispatchDocument>,
  ) {}

  async findByServiceDate(
    branchId: string | Types.ObjectId,
    serviceDate: string,
    status?: DispatchStatus,
    type?: DispatchType,
  ): Promise<OperationalDispatchDocument[]> {
    const filter: Record<string, unknown> = {
      branchId: new Types.ObjectId(branchId),
      serviceDate,
    };
    if (status) filter.status = status;
    if (type) filter.type = type;

    return this.dispatchModel.find(filter).sort({ priorityScore: -1 }).exec();
  }

  async updateStatus(
    dispatchId: string | Types.ObjectId,
    status: DispatchStatus,
    assigneeUserId?: Types.ObjectId,
  ): Promise<OperationalDispatchDocument> {
    const task = await this.dispatchModel.findById(dispatchId).exec();
    if (!task) {
      throw new NotFoundException(
        `Dispatch task ${String(dispatchId)} not found`,
      );
    }

    task.status = status;
    if (assigneeUserId) task.assigneeUserId = assigneeUserId;
    if (status === DispatchStatus.DONE) {
      task.completedAt = new Date();
    }

    return task.save();
  }

  async upsertDispatch(
    branchId: Types.ObjectId,
    serviceDate: string,
    type: DispatchType,
    dedupeKey: string,
    data: Partial<OperationalDispatch>,
  ): Promise<OperationalDispatchDocument> {
    return this.dispatchModel.findOneAndUpdate(
      { branchId, serviceDate, type, dedupeKey },
      { $set: data, $setOnInsert: { generatedAt: new Date() } },
      { upsert: true, new: true, runValidators: true },
    ) as unknown as Promise<OperationalDispatchDocument>;
  }
}
