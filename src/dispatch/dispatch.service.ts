import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { DispatchRepo } from "./dispatch.repo";
import {
  OperationalDispatch,
  OperationalDispatchDocument,
} from "./entity/operational-dispatch.entity";
import { DispatchStatus, DispatchType } from "../common/enums/dispatch.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/enums/audit-action.enum";

@Injectable()
export class DispatchService {
  constructor(
    private readonly dispatchRepo: DispatchRepo,
    private readonly auditService?: AuditService,
  ) {}

  async findByServiceDate(
    branchId: string | string[],
    serviceDate: string,
    status?: DispatchStatus,
    type?: DispatchType,
  ): Promise<OperationalDispatchDocument[]> {
    const objectIds = Array.isArray(branchId)
      ? branchId.map((id) => new Types.ObjectId(id))
      : [new Types.ObjectId(branchId)];

    return this.dispatchRepo.findByServiceDate(
      objectIds,
      serviceDate,
      status,
      type,
    );
  }

  async updateStatus(
    user: ICurrentUser,
    dispatchId: string,
    status: DispatchStatus,
    assigneeUserId?: string,
  ): Promise<OperationalDispatchDocument> {
    if (!Types.ObjectId.isValid(dispatchId)) {
      throw new NotFoundException(`Invalid dispatch task ID ${dispatchId}`);
    }

    const task = await this.dispatchRepo.findById(dispatchId);
    if (!task) {
      throw new NotFoundException(`Dispatch task ${dispatchId} not found`);
    }

    // Role check:
    // If STAFF: only allowed to update if assigned to themselves
    if (user.role === UserRole.STAFF) {
      if (task.assigneeUserId?.toString() !== user.userId) {
        throw new ForbiddenException(
          "Staff members can only update dispatch tasks assigned to themselves",
        );
      }
    } else {
      // ADMIN, BRANCH_MGR, DISPATCHER: must have access to task's branch
      validateBranchAccess(user, task.branchId);
    }

    const previousStatus = task.status;
    const updated = await this.dispatchRepo.updateStatus(
      new Types.ObjectId(dispatchId),
      status,
      assigneeUserId ? new Types.ObjectId(assigneeUserId) : undefined,
    );

    if (this.auditService) {
      await this.auditService.log({
        who: AuditService.fromCurrentUser(user),
        action: AuditAction.DISPATCH_STATUS_CHANGE,
        targetType: "dispatch",
        targetId: dispatchId,
        branchId: task.branchId.toString(),
        from: { status: previousStatus },
        to: { status },
        metadata: {
          taskType: task.type,
          assigneeUserId: assigneeUserId || task.assigneeUserId?.toString(),
        },
      });
    }

    return updated!;
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
