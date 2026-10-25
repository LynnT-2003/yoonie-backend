import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { DispatchRepo } from "./dispatch.repo";
import {
  OperationalDispatch,
  OperationalDispatchDocument,
} from "./entity/operational-dispatch.entity";
import {
  DispatchStatus,
  DispatchType,
  Severity,
} from "../common/enums/dispatch.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/enums/audit-action.enum";
import { StaffService } from "../staff/staff.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { NotificationSeverity } from "../notifications/enums/notification-severity.enum";
import { Room, RoomDocument } from "../room/entity/room.entity";
import { User, UserDocument } from "../user/entity/user.entity";
import {
  ResolvePickupIssueDto,
  TourDecisionDto,
} from "./dto/requests/task-actions.dto";
import {
  PICKUP_STAGE_ORDER,
  PickupIssueResolution,
  PickupStage,
} from "../common/enums/pickup.enum";
import { currentPickupStage } from "../staff/staff.service";

const CLOSED = [DispatchStatus.DONE, DispatchStatus.DISMISSED];

/** Before the van leaves, a new driver has to accept the job again. */
const notYetDriving = (stage: PickupStage) =>
  PICKUP_STAGE_ORDER.indexOf(stage) <
  PICKUP_STAGE_ORDER.indexOf(PickupStage.EN_ROUTE);

@Injectable()
export class DispatchService {
  constructor(
    private readonly dispatchRepo: DispatchRepo,
    private readonly auditService?: AuditService,
    @Optional()
    private readonly staffService?: StaffService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    @InjectModel(Room.name)
    private readonly roomModel?: Model<RoomDocument>,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel?: Model<UserDocument>,
  ) {}

  /**
   * The inbox for a date. For today it first makes sure every room that needs work has its
   * turnaround, then adds what each task needs on screen: the room's live cleaning status and
   * the assignee's name.
   */
  async listTasks(
    branchIds: string[],
    serviceDate: string,
    status?: DispatchStatus,
    type?: DispatchType,
  ) {
    if (this.staffService) {
      for (const b of branchIds) {
        const { today } = await this.staffService.branchClock(b);
        if (today === serviceDate)
          await this.staffService.ensureTurnarounds(b, serviceDate);
      }
    }
    const tasks = await this.findByServiceDate(
      branchIds,
      serviceDate,
      status,
      type,
    );

    const roomIds = tasks
      .map((t) => t.housekeeping?.roomId)
      .filter((id): id is Types.ObjectId => Boolean(id));
    const rooms =
      this.roomModel && roomIds.length
        ? await this.roomModel
            .find({ _id: { $in: roomIds } })
            .select("cleaningStatus")
            .lean()
            .exec()
        : [];
    const cleaning = new Map(
      rooms.map((r) => [String(r._id), r.cleaningStatus]),
    );
    const assigneeIds = [
      ...new Set(
        tasks
          .map((t) => t.assigneeUserId)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const people =
      this.userModel && assigneeIds.length
        ? await this.userModel
            .find({ _id: { $in: assigneeIds } })
            .select("displayName")
            .lean()
            .exec()
        : [];
    const names = new Map(people.map((u) => [String(u._id), u.displayName]));

    return tasks.map((t) => ({
      ...t.toObject(),
      // ACKNOWLEDGED is retired; old rows read as "to do"
      status:
        t.status === DispatchStatus.ACKNOWLEDGED
          ? DispatchStatus.OPEN
          : t.status,
      cleaningStatus: t.housekeeping
        ? cleaning.get(String(t.housekeeping.roomId))
        : undefined,
      assigneeName: t.assigneeUserId
        ? names.get(String(t.assigneeUserId))
        : undefined,
    }));
  }

  private async loadForAction(user: ICurrentUser, dispatchId: string) {
    if (!Types.ObjectId.isValid(dispatchId)) {
      throw new NotFoundException(`Invalid dispatch task ID ${dispatchId}`);
    }
    const task = await this.dispatchRepo.findById(dispatchId);
    if (!task)
      throw new NotFoundException(`Dispatch task ${dispatchId} not found`);
    validateBranchAccess(user, task.branchId);
    return task;
  }

  /** Take an unassigned task from the pool. */
  async claim(
    user: ICurrentUser,
    dispatchId: string,
  ): Promise<OperationalDispatchDocument> {
    const task = await this.loadForAction(user, dispatchId);
    if (CLOSED.includes(task.status)) {
      throw new ConflictException("This task is already finished");
    }
    const owner = task.assigneeUserId?.toString();
    if (owner && owner !== user.userId) {
      throw new ConflictException("Someone else has already claimed this task");
    }
    task.assigneeUserId = new Types.ObjectId(user.userId);
    if (task.pickup) {
      task.pickup.driverUserId = task.assigneeUserId;
      // a driver taking a pickup themselves has accepted it
      if (notYetDriving(currentPickupStage(task))) {
        task.pickup.stage = PickupStage.CONFIRMED;
        task.pickup.steps = [
          ...(task.pickup.steps ?? []),
          {
            stage: PickupStage.CONFIRMED,
            at: new Date(),
            byUserId: task.assigneeUserId,
            byName: await this.nameOf(user.userId),
            note: "Took the job from the open pool",
          },
        ];
      }
      task.markModified("pickup");
    }
    const saved = await task.save();
    await this.auditService?.log({
      who: AuditService.fromCurrentUser(user),
      action: AuditAction.TASK_CLAIM,
      targetType: "dispatch",
      targetId: dispatchId,
      branchId: task.branchId.toString(),
      from: { assigneeUserId: owner ?? null },
      to: { assigneeUserId: user.userId },
      metadata: { taskType: task.type },
    });
    return saved;
  }

  /** Give a task to someone (or back to the pool with null) and tell them. */
  async assign(
    user: ICurrentUser,
    dispatchId: string,
    assigneeUserId: string | null,
  ): Promise<
    OperationalDispatchDocument & { assigneeName?: string; notified: string[] }
  > {
    const task = await this.loadForAction(user, dispatchId);
    if (CLOSED.includes(task.status)) {
      throw new ConflictException("This task is already finished");
    }
    const before = task.assigneeUserId?.toString() ?? null;
    let assigneeName: string | undefined;

    if (assigneeUserId) {
      const assignee = this.userModel
        ? await this.userModel
            .findById(assigneeUserId)
            .select("branchIds displayName")
            .lean()
            .exec()
        : null;
      const branchIds: unknown[] =
        (assignee as { branchIds?: unknown[] } | null)?.branchIds ?? [];
      if (
        !assignee ||
        !branchIds.some((b) => String(b) === task.branchId.toString())
      ) {
        throw new BadRequestException(
          "That person isn't on this branch's staff",
        );
      }
      assigneeName = (assignee as { displayName?: string }).displayName;
    }

    task.assigneeUserId = assigneeUserId
      ? new Types.ObjectId(assigneeUserId)
      : (null as never);
    if (task.pickup) {
      task.pickup.driverUserId = task.assigneeUserId ?? undefined;
      if (
        assigneeUserId !== before &&
        notYetDriving(currentPickupStage(task))
      ) {
        task.pickup.stage = PickupStage.ASSIGNED;
        task.pickup.steps = [
          ...(task.pickup.steps ?? []),
          {
            stage: PickupStage.ASSIGNED,
            at: new Date(),
            byUserId: new Types.ObjectId(user.userId),
            byName: await this.nameOf(user.userId),
            note: assigneeUserId
              ? `Given to ${assigneeName ?? "a driver"}`
              : "Driver removed",
          },
        ];
      }
      task.markModified("pickup");
    }
    const saved = await task.save();

    const notified: string[] = [];
    if (
      assigneeUserId &&
      assigneeUserId !== before &&
      assigneeUserId !== user.userId &&
      this.notificationsService
    ) {
      await this.notificationsService.createNotification({
        userId: assigneeUserId,
        branchId: task.branchId.toString(),
        type: task.pickup
          ? NotificationType.PICKUP_READY
          : NotificationType.TASK_ASSIGNED,
        severity:
          task.severity === Severity.CRITICAL
            ? NotificationSeverity.WARN
            : NotificationSeverity.INFO,
        title: task.pickup
          ? `Pickup: ${task.title.replace(/^Pickup /, "")}`
          : `New task: ${task.title}`,
        body: task.pickup
          ? task.pickup.card.en
          : "Assigned to you in Dispatch.",
        data: { dispatchId, type: task.type },
      });
      if (assigneeName) notified.push(assigneeName);
    }
    await this.auditService?.log({
      who: AuditService.fromCurrentUser(user),
      action: AuditAction.TASK_ASSIGN,
      targetType: "dispatch",
      targetId: dispatchId,
      branchId: task.branchId.toString(),
      from: { assigneeUserId: before },
      to: { assigneeUserId },
      metadata: { taskType: task.type },
    });
    // a plain object so the response can say who now has it and who was told
    const plain = (
      typeof saved.toObject === "function" ? saved.toObject() : saved
    ) as OperationalDispatchDocument;
    return Object.assign(plain, { assigneeName, notified });
  }

  private async nameOf(userId: string): Promise<string | undefined> {
    if (!this.userModel) return undefined;
    const u = await this.userModel
      .findById(userId)
      .select("displayName")
      .lean()
      .exec();
    return u?.displayName ?? undefined;
  }

  /**
   * The desk answers a driver's problem: keep waiting (with instructions), or call it a
   * no-show and stand the driver down. Either way the driver is told.
   */
  async resolvePickupIssue(
    user: ICurrentUser,
    dispatchId: string,
    dto: ResolvePickupIssueDto,
  ) {
    const task = await this.loadForAction(user, dispatchId);
    const issue = task.pickup?.issue;
    if (!task.pickup || !issue || issue.resolvedAt) {
      throw new ConflictException("There's no open problem on this pickup");
    }
    const now = new Date();
    const deskName = await this.nameOf(user.userId);
    issue.resolvedAt = now;
    issue.resolution = dto.resolution as PickupIssueResolution;
    issue.resolutionNote = dto.note?.trim() || undefined;
    issue.resolvedByName = deskName;
    task.severity = Severity.INFO;
    if (dto.resolution === "NO_SHOW") {
      task.status = DispatchStatus.DISMISSED;
      task.completedAt = now;
    }
    task.markModified("pickup");
    await task.save();

    await this.auditService?.log({
      who: AuditService.fromCurrentUser(user),
      action: AuditAction.DISPATCH_STATUS_CHANGE,
      targetType: "dispatch",
      targetId: dispatchId,
      branchId: task.branchId.toString(),
      from: { issue: issue.kind },
      to: { resolution: dto.resolution, status: task.status },
      metadata: { note: dto.note },
    });

    const notified: string[] = [];
    const driverId = task.assigneeUserId?.toString();
    if (driverId && driverId !== user.userId && this.notificationsService) {
      const noShow = dto.resolution === "NO_SHOW";
      await this.notificationsService.createNotification({
        userId: driverId,
        branchId: task.branchId.toString(),
        type: NotificationType.TASK_ASSIGNED,
        severity: noShow
          ? NotificationSeverity.WARN
          : NotificationSeverity.INFO,
        title: noShow
          ? `Stand down: ${task.pickup.flightNumber} marked no-show`
          : `Keep waiting for ${task.pickup.guestName}`,
        body:
          dto.note?.trim() ||
          (noShow
            ? "The desk closed this pickup. Head back to the hotel."
            : "The desk wants you to stay at the door."),
        data: { dispatchId, type: task.type },
      });
      const name = await this.nameOf(driverId);
      if (name) notified.push(name);
    }
    const plain = (
      typeof task.toObject === "function" ? task.toObject() : task
    ) as OperationalDispatchDocument;
    return Object.assign(plain, { notified });
  }

  /** Close a tour fill flag with an explicit decision instead of a vague acknowledgement. */
  async decideTour(
    user: ICurrentUser,
    dispatchId: string,
    dto: TourDecisionDto,
  ): Promise<OperationalDispatchDocument> {
    const task = await this.loadForAction(user, dispatchId);
    if (task.type !== DispatchType.TOUR_CONSOLIDATION || !task.consolidation) {
      throw new BadRequestException("Decisions only apply to tour departures");
    }
    task.consolidation.decision = dto.decision;
    task.consolidation.decisionNote = dto.note?.trim() || undefined;
    task.status = DispatchStatus.DONE;
    task.completedAt = new Date();
    task.markModified("consolidation");
    const saved = await task.save();
    await this.auditService?.log({
      who: AuditService.fromCurrentUser(user),
      action: AuditAction.TOUR_DECISION,
      targetType: "dispatch",
      targetId: dispatchId,
      branchId: task.branchId.toString(),
      from: { status: task.status },
      to: { decision: dto.decision },
      metadata: { note: dto.note, serviceName: task.consolidation.serviceName },
    });
    return saved;
  }

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

    // Room turnarounds follow the room; changing them here would split the two apart
    if (task.type === DispatchType.HOUSEKEEPING_TURNAROUND) {
      throw new ConflictException(
        "Room turnarounds follow the room. Change it through POST /staff/rooms/:id/transition.",
      );
    }
    if (status === DispatchStatus.ACKNOWLEDGED) {
      throw new BadRequestException(
        "ACKNOWLEDGED is retired: claim or assign the task instead",
      );
    }

    // Role check:
    // If STAFF: only allowed to update if assigned to themselves
    if (user.role === UserRole.STAFF) {
      validateBranchAccess(user, task.branchId);
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
