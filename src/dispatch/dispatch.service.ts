import { Injectable, NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import { DispatchRepo } from "./dispatch.repo";
import {
  OperationalDispatch,
  OperationalDispatchDocument,
} from "./entity/operational-dispatch.entity";
import { DispatchStatus, DispatchType } from "../common/enums/dispatch.enum";

@Injectable()
export class DispatchService {
  constructor(private readonly dispatchRepo: DispatchRepo) {}

  async findByServiceDate(
    branchId: string,
    serviceDate: string,
    status?: DispatchStatus,
    type?: DispatchType,
  ): Promise<OperationalDispatchDocument[]> {
    return this.dispatchRepo.findByServiceDate(
      new Types.ObjectId(branchId),
      serviceDate,
      status,
      type,
    );
  }

  async updateStatus(
    dispatchId: string,
    status: DispatchStatus,
    assigneeUserId?: string,
  ): Promise<OperationalDispatchDocument> {
    const task = await this.dispatchRepo.updateStatus(
      new Types.ObjectId(dispatchId),
      status,
      assigneeUserId ? new Types.ObjectId(assigneeUserId) : undefined,
    );
    if (!task) {
      throw new NotFoundException(`Dispatch task ${dispatchId} not found`);
    }
    return task;
  }

  async upsertDispatch(
    branchId: Types.ObjectId,
    serviceDate: string,
    type: DispatchType,
    dedupeKey: string,
    data: Partial<OperationalDispatch>,
  ): Promise<OperationalDispatchDocument> {
    return this.dispatchRepo.upsertTask(
      branchId,
      serviceDate,
      type,
      dedupeKey,
      data,
    );
  }
}
