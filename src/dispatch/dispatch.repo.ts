import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  OperationalDispatch,
  OperationalDispatchDocument,
} from "./entity/operational-dispatch.entity";
import { DispatchStatus, DispatchType } from "../common/enums/dispatch.enum";

@Injectable()
export class DispatchRepo {
  constructor(
    @InjectModel(OperationalDispatch.name)
    private readonly dispatchModel: Model<OperationalDispatchDocument>,
  ) {}

  async findByServiceDate(
    branchId: Types.ObjectId,
    serviceDate: string,
    status?: DispatchStatus,
    type?: DispatchType,
  ): Promise<OperationalDispatchDocument[]> {
    const filter: Record<string, unknown> = { branchId, serviceDate };
    if (status) filter.status = status;
    if (type) filter.type = type;

    return this.dispatchModel.find(filter).sort({ priorityScore: -1 }).exec();
  }

  async findById(
    id: string | Types.ObjectId,
  ): Promise<OperationalDispatchDocument | null> {
    return this.dispatchModel.findById(id).exec();
  }

  async updateStatus(
    id: Types.ObjectId,
    status: DispatchStatus,
    assigneeUserId?: Types.ObjectId,
  ): Promise<OperationalDispatchDocument | null> {
    return this.dispatchModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status,
            ...(assigneeUserId ? { assigneeUserId } : {}),
            ...(status === DispatchStatus.DONE
              ? { completedAt: new Date() }
              : {}),
          },
        },
        { new: true },
      )
      .exec();
  }

  async upsertTask(
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
