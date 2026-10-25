import { User, UserDocument } from "../user/entity/user.entity";
import {
  Notification,
  NotificationDocument,
} from "../notifications/entity/notification.entity";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { NotificationSeverity } from "../notifications/enums/notification-severity.enum";
import { NotificationsService } from "../notifications/notifications.service";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { ClientSession, Connection, Model, Types } from "mongoose";
import * as crypto from "crypto";

import { IStaffService } from "./interfaces/staff.service.interface";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { RoomTransitionDto } from "./dto/request/room-transition.dto";
import { PickupIssueDto, PickupStepDto } from "./dto/request/pickup-step.dto";
import {
  AIRPORT_TO_HOTEL_MIN,
  PICKUP_STAGE_ORDER,
  PickupIssueKind,
  PickupIssueResolution,
  PickupStage,
} from "../common/enums/pickup.enum";
import {
  HousekeepingTaskDto,
  PickupTaskDto,
  StaffTasksResponseDto,
} from "./dto/response/staff-task.dto";
import { RoomTransitionResponseDto } from "./dto/response/room-transition-response.dto";
import { PickupTaskResponseDto } from "./dto/response/pickup-task-response.dto";
import { LineLinkTokenResponseDto } from "./dto/response/line-link-token-response.dto";
import {
  OperationalDispatch,
  OperationalDispatchDocument,
} from "../dispatch/entity/operational-dispatch.entity";
import { Room, RoomDocument } from "../room/entity/room.entity";
import { Branch, BranchDocument } from "../branch/entity/branch.entity";
import { UserService } from "../user/user.service";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";
import {
  DispatchStatus,
  DispatchType,
  Severity,
} from "../common/enums/dispatch.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { Permission } from "../common/enums/permission.enum";
import {
  hhmm,
  toBranchBusinessDate,
  zonedAt,
} from "../common/helpers/time.helper";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/enums/audit-action.enum";

/** Tasks still waiting for someone; ACKNOWLEDGED is retired but may linger in old rows. */
const OPEN_STATUSES = [
  DispatchStatus.OPEN,
  DispatchStatus.ACKNOWLEDGED,
  DispatchStatus.IN_PROGRESS,
];
export const PICKUP_ISSUE_LABEL: Record<PickupIssueKind, string> = {
  [PickupIssueKind.FLIGHT_DELAYED]: "flight delayed",
  [PickupIssueKind.GUEST_NOT_FOUND]: "can't find the guest",
  [PickupIssueKind.VEHICLE_PROBLEM]: "vehicle problem",
  [PickupIssueKind.OTHER]: "driver needs help",
};

const CLEANING_LABEL: Record<CleaningStatus, string> = {
  [CleaningStatus.DIRTY]: "still dirty",
  [CleaningStatus.IN_PROGRESS]: "still being cleaned",
  [CleaningStatus.CLEAN]: "clean but not inspected",
  [CleaningStatus.INSPECTED]: "ready",
};

/** Where a pickup stands; older rows without a stage are read from their status. */
export function currentPickupStage(d: {
  status: DispatchStatus;
  pickup?: { stage?: PickupStage } | null;
}): PickupStage {
  if (d.pickup?.stage) return d.pickup.stage;
  if (d.status === DispatchStatus.DONE) return PickupStage.DROPPED_OFF;
  if (d.status === DispatchStatus.IN_PROGRESS) return PickupStage.EN_ROUTE;
  return PickupStage.ASSIGNED;
}

/** Rooms with no arriving guest sort below every arrival in the queue. */
const NO_ARRIVAL_PRIORITY = 100;

@Injectable()
export class StaffService implements IStaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    @InjectModel(OperationalDispatch.name)
    private readonly dispatchModel: Model<OperationalDispatchDocument>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    @InjectConnection()
    private readonly connection: Connection,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel?: Model<UserDocument>,
    @Optional()
    @InjectModel(Notification.name)
    private readonly notificationModel?: Model<NotificationDocument>,
    private readonly auditService?: AuditService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
  ) {}

  // ─── Get Staff Tasks ──────────────────────────────────────────────────────────

  async getTasks(currentUser: ICurrentUser): Promise<StaffTasksResponseDto> {
    if (
      !currentUser.isPlatformAdmin &&
      (!currentUser.branchIds || currentUser.branchIds.length === 0)
    ) {
      throw new ForbiddenException("No branch access assigned");
    }

    const userObjectId = new Types.ObjectId(currentUser.userId);
    const branchObjectIds = currentUser.isPlatformAdmin
      ? []
      : currentUser.branchIds.map((id) => new Types.ObjectId(id));

    // 1. Housekeeper tasks: today's open turnarounds that are mine, plus the unassigned pool
    //    for housekeepers. Make sure every room needing work has its task first.
    const homeBranch = currentUser.branchIds?.[0];
    const clock = homeBranch
      ? await this.branchClock(homeBranch)
      : { today: toBranchBusinessDate(new Date()), timezone: "Asia/Bangkok" };
    for (const b of currentUser.branchIds ?? []) {
      await this.ensureTurnarounds(b, clock.today);
    }
    const me = this.userModel
      ? await this.userModel
          .findById(userObjectId)
          .select("jobTitle role")
          .lean()
          .exec()
      : null;
    const seesPool =
      /housekeep/i.test(me?.jobTitle ?? "") ||
      currentUser.role === UserRole.BRANCH_MGR ||
      currentUser.role === UserRole.ADMIN;
    const housekeepingQuery: Record<string, any> = {
      type: DispatchType.HOUSEKEEPING_TURNAROUND,
      serviceDate: clock.today,
      status: { $in: OPEN_STATUSES },
      assigneeUserId: seesPool ? { $in: [userObjectId, null] } : userObjectId,
    };
    if (!currentUser.isPlatformAdmin) {
      housekeepingQuery.branchId = { $in: branchObjectIds };
    }

    const housekeepingDispatches = await this.dispatchModel
      .find(housekeepingQuery)
      .sort({ priorityScore: -1 })
      .exec();

    // Hydrate room info
    const roomIds = housekeepingDispatches
      .map((d) => d.housekeeping?.roomId)
      .filter((id): id is Types.ObjectId => !!id);

    const rooms = await this.roomModel
      .find({ _id: { $in: roomIds } })
      .lean()
      .exec();
    const roomMap = new Map<string, any>();
    for (const r of rooms) {
      roomMap.set(r._id.toString(), r);
    }

    const housekeepingTasks: HousekeepingTaskDto[] = housekeepingDispatches.map(
      (d) => {
        const hk = d.housekeeping!;
        const room = roomMap.get(hk.roomId.toString());
        return {
          dispatchId: d._id.toString(),
          roomId: hk.roomId.toString(),
          roomNumber: hk.roomNumber,
          floor: room?.floor ?? 1,
          roomType: room?.roomType ?? "STANDARD_KING",
          cleaningStatus: room?.cleaningStatus ?? CleaningStatus.DIRTY,
          dispatchStatus: d.status,
          priorityScore: d.priorityScore,
          etaAt: hk.etaAt,
          isVip: hk.isVip,
          targetReadyBy: hk.targetReadyBy,
          guestName: hk.guestName,
          flightNumber: hk.flightNumber,
          assigneeUserId: d.assigneeUserId?.toString(),
          isMine: d.assigneeUserId?.toString() === currentUser.userId,
        };
      },
    );

    // 2. Driver tasks: AIRPORT_PICKUP assigned to currentUser, today in the branch timezone
    const todayBranchDate = clock.today;

    const pickupQuery: Record<string, any> = {
      assigneeUserId: userObjectId,
      type: DispatchType.AIRPORT_PICKUP,
      serviceDate: todayBranchDate,
      status: { $in: OPEN_STATUSES },
    };
    if (!currentUser.isPlatformAdmin) {
      pickupQuery.branchId = { $in: branchObjectIds };
    }

    const pickupDispatches = await this.dispatchModel
      .find(pickupQuery)
      .sort({ "pickup.etaAt": 1 })
      .exec();

    const pickupTasks: PickupTaskDto[] = pickupDispatches.map((d) => {
      const p = d.pickup!;
      return {
        dispatchId: d._id.toString(),
        orderId: p.orderId.toString(),
        guestName: p.guestName,
        flightNumber: p.flightNumber,
        etaAt: p.etaAt,
        meetingDoor: p.meetingDoor,
        vehiclePlate: p.vehiclePlate,
        dispatchStatus: d.status,
        deliveryStatus: p.deliveryStatus,
        card: p.card,
        stage: currentPickupStage(d),
        steps: (p.steps ?? []).map((st) => ({
          stage: st.stage,
          at: st.at,
          byName: st.byName,
          note: st.note,
        })),
        issue:
          p.issue && !p.issue.resolvedAt
            ? { kind: p.issue.kind, note: p.issue.note, at: p.issue.at }
            : undefined,
      };
    });

    return {
      housekeeping: housekeepingTasks,
      pickups: pickupTasks,
    };
  }

  /** Active staff on a branch, for assign menus. */
  async roster(branchId: string) {
    if (!this.userModel) return [];
    const users = await this.userModel
      .find({
        branchIds: new Types.ObjectId(branchId),
        role: {
          $in: [UserRole.STAFF, UserRole.DISPATCHER, UserRole.BRANCH_MGR],
        },
        isSuspended: { $ne: true },
      })
      .select("displayName role jobTitle")
      .sort({ displayName: 1 })
      .lean()
      .exec();
    return users.map((u) => ({
      id: String(u._id),
      name: u.displayName,
      role: u.role,
      jobTitle: u.jobTitle ?? undefined,
    }));
  }

  // ─── Room work: the only path that changes a room's cleaning status ──────────
  // A room's readiness and its turnaround task always move together here. Web, phone app
  // and dispatch all call this; nothing else writes cleaningStatus.

  /** Today's business date and check-in time for a branch; tolerant of partial mocks. */
  async branchClock(branchId: Types.ObjectId | string) {
    let timezone = "Asia/Bangkok";
    let checkInTime = "14:00";
    try {
      const q: any = this.branchModel.findById(branchId);
      const b = q?.lean ? await q.lean().exec() : await q;
      if (b?.timezone) timezone = b.timezone;
      if (b?.settings?.checkInTime) checkInTime = b.settings.checkInTime;
    } catch {
      // fall back to Bangkok defaults
    }
    return {
      timezone,
      checkInTime,
      today: toBranchBusinessDate(new Date(), timezone),
    };
  }

  /** Upserts today's turnaround for a room. Rooms with no arrival are due by check-in time. */
  private async upsertTurnaround(
    room: Pick<RoomDocument, "_id" | "branchId" | "roomNumber">,
    serviceDate: string,
    checkInTime: string,
    session?: ClientSession | null,
  ): Promise<OperationalDispatchDocument> {
    const etaAt = zonedAt(serviceDate, checkInTime);
    return this.dispatchModel
      .findOneAndUpdate(
        {
          branchId: room.branchId,
          serviceDate,
          type: DispatchType.HOUSEKEEPING_TURNAROUND,
          dedupeKey: `hk:${room.roomNumber}`,
        },
        {
          $setOnInsert: {
            priorityScore: NO_ARRIVAL_PRIORITY,
            severity: Severity.INFO,
            title: `Turn room ${room.roomNumber}`,
            dueAt: etaAt,
            generatedAt: new Date(),
            housekeeping: {
              roomId: room._id,
              roomNumber: room.roomNumber,
              etaAt,
              etaSource: "CHECKIN_TIME",
              isVip: false,
              targetReadyBy: etaAt,
            },
          },
        },
        { upsert: true, new: true, session: session || undefined },
      )
      .exec() as Promise<OperationalDispatchDocument>;
  }

  /**
   * Makes the task list match the rooms for a date: every room that isn't inspected has an
   * open turnaround, tasks for rooms that are already clean are closed, and the retired
   * ACKNOWLEDGED status is folded back into OPEN.
   */
  async ensureTurnarounds(
    branchId: Types.ObjectId | string,
    date?: string,
  ): Promise<void> {
    const branchOid = new Types.ObjectId(String(branchId));
    const clock = await this.branchClock(branchOid);
    const serviceDate = date ?? clock.today;

    await this.dispatchModel.updateMany(
      { branchId: branchOid, status: DispatchStatus.ACKNOWLEDGED },
      { $set: { status: DispatchStatus.OPEN } },
    );

    const rooms = await this.roomModel
      .find({ branchId: branchOid, isActive: { $ne: false } })
      .select("_id branchId roomNumber cleaningStatus")
      .lean()
      .exec();
    const tasks = await this.dispatchModel
      .find({
        branchId: branchOid,
        serviceDate,
        type: DispatchType.HOUSEKEEPING_TURNAROUND,
      })
      .select("dedupeKey status")
      .lean()
      .exec();
    const taskByKey = new Map(tasks.map((t) => [t.dedupeKey, t]));

    for (const room of rooms) {
      const task = taskByKey.get(`hk:${room.roomNumber}`);
      const ready =
        room.cleaningStatus === CleaningStatus.CLEAN ||
        room.cleaningStatus === CleaningStatus.INSPECTED;
      if (!task && !ready) {
        await this.upsertTurnaround(room, serviceDate, clock.checkInTime);
      } else if (task && ready && OPEN_STATUSES.includes(task.status)) {
        await this.dispatchModel.updateOne(
          { _id: task._id },
          { $set: { status: DispatchStatus.DONE, completedAt: new Date() } },
        );
      } else if (task && !ready) {
        const want =
          room.cleaningStatus === CleaningStatus.IN_PROGRESS
            ? DispatchStatus.IN_PROGRESS
            : DispatchStatus.OPEN;
        if (task.status !== want && task.status !== DispatchStatus.DISMISSED) {
          await this.dispatchModel.updateOne(
            { _id: task._id },
            { $set: { status: want } },
          );
        }
      }
    }
  }

  async transitionRoom(
    currentUser: ICurrentUser,
    roomId: string,
    dto: RoomTransitionDto,
  ): Promise<RoomTransitionResponseDto> {
    if (
      !currentUser.isPlatformAdmin &&
      (!currentUser.branchIds || currentUser.branchIds.length === 0)
    ) {
      throw new ForbiddenException("No branch access assigned");
    }

    if (!Types.ObjectId.isValid(roomId)) {
      throw new NotFoundException("Invalid room ID");
    }

    const room = await this.roomModel.findById(roomId).exec();
    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // Branch isolation check
    if (
      !currentUser.isPlatformAdmin &&
      !currentUser.branchIds.includes(room.branchId.toString())
    ) {
      throw new ForbiddenException("Access denied to branch");
    }

    const clock = await this.branchClock(room.branchId);

    // Today's turnaround for this room, if there is one
    const findQuery: any = this.dispatchModel.findOne({
      type: DispatchType.HOUSEKEEPING_TURNAROUND,
      "housekeeping.roomId": room._id,
      serviceDate: clock.today,
    });
    let linkedDispatch = await (typeof findQuery?.sort === "function"
      ? findQuery.sort({ createdAt: -1 }).exec()
      : findQuery?.exec
        ? findQuery.exec()
        : findQuery);

    // Offline replay safety: transition to the state the room is already in is a 200 no-op
    if (room.cleaningStatus === dto.toStatus) {
      return {
        roomId: room._id.toString(),
        roomNumber: room.roomNumber,
        cleaningStatus: room.cleaningStatus,
        isNoOp: true,
        dispatchId: linkedDispatch?._id?.toString(),
        dispatchStatus: linkedDispatch?.status,
      };
    }

    const isMgrOrAdmin =
      currentUser.isPlatformAdmin ||
      currentUser.role === UserRole.BRANCH_MGR ||
      currentUser.role === UserRole.ADMIN;

    // Open pool: unassigned work is anyone's; someone else's claimed room is not
    const assignee = linkedDispatch?.assigneeUserId?.toString();
    if (assignee && assignee !== currentUser.userId && !isMgrOrAdmin) {
      throw new ForbiddenException("Another housekeeper has claimed this room");
    }

    // State machine validation
    const current = room.cleaningStatus;
    const target = dto.toStatus;

    const isValidForwardTransition =
      (current === CleaningStatus.DIRTY &&
        target === CleaningStatus.IN_PROGRESS) ||
      (current === CleaningStatus.IN_PROGRESS &&
        target === CleaningStatus.CLEAN);

    const isInspection =
      current === CleaningStatus.CLEAN && target === CleaningStatus.INSPECTED;

    const isFailedInspection =
      target === CleaningStatus.DIRTY && current !== CleaningStatus.DIRTY;

    if (isInspection) {
      // managers and admins inspect by role; anyone else needs the explicit permission
      const hasInspectPermission =
        isMgrOrAdmin ||
        (currentUser.permissions || []).includes(
          Permission.HOUSEKEEPING_INSPECT,
        );
      if (!hasInspectPermission) {
        throw new ForbiddenException(
          "Missing required permission: housekeeping:inspect",
        );
      }
    } else if (isFailedInspection) {
      if (!dto.reason || !dto.reason.trim()) {
        throw new BadRequestException(
          "A reason is required when sending a room back to DIRTY",
        );
      }
    } else if (!isValidForwardTransition) {
      // Invalid transition returns 409 Conflict with the current status so the client drops it
      throw new ConflictException({
        message: `Invalid room transition from ${current} to ${target}`,
        currentStatus: current,
        targetStatus: target,
      });
    }

    // Determine target dispatch status
    let targetDispatchStatus: DispatchStatus | null = null;
    if (target === CleaningStatus.IN_PROGRESS) {
      targetDispatchStatus = DispatchStatus.IN_PROGRESS;
    } else if (
      target === CleaningStatus.CLEAN ||
      target === CleaningStatus.INSPECTED
    ) {
      targetDispatchStatus = DispatchStatus.DONE;
    } else if (target === CleaningStatus.DIRTY) {
      targetDispatchStatus = DispatchStatus.OPEN;
    }

    // Coordinated update of room and linked dispatch
    const userObjectId = new Types.ObjectId(currentUser.userId);
    let session: ClientSession | null = null;
    try {
      session = await this.connection.startSession();
      session.startTransaction();
    } catch {
      session = null;
    }

    try {
      room.cleaningStatus = target;
      room.cleaningUpdatedAt = new Date();
      room.cleaningUpdatedBy = userObjectId;
      await room.save({ session: session || undefined });

      // Every change has a task: a room sent back to DIRTY or started without one gets today's
      if (!linkedDispatch && target !== CleaningStatus.INSPECTED) {
        linkedDispatch = await this.upsertTurnaround(
          room,
          clock.today,
          clock.checkInTime,
          session,
        );
      }

      if (linkedDispatch && targetDispatchStatus) {
        linkedDispatch.status = targetDispatchStatus;
        // Starting unassigned work claims it; managers acting on a room don't become the owner
        if (!linkedDispatch.assigneeUserId && !isMgrOrAdmin) {
          linkedDispatch.assigneeUserId = userObjectId;
        }
        if (targetDispatchStatus === DispatchStatus.DONE) {
          linkedDispatch.completedAt = new Date();
        } else if (targetDispatchStatus === DispatchStatus.OPEN) {
          linkedDispatch.completedAt = null as any;
        }
        await linkedDispatch.save({ session: session || undefined });
      }

      if (session) {
        await session.commitTransaction();
      }
    } catch (err) {
      if (session) {
        await session.abortTransaction();
      }
      throw err;
    } finally {
      if (session) {
        await session.endSession();
      }
    }

    const notified = await this.notifyRoomChange(
      room,
      current,
      target,
      linkedDispatch,
      currentUser,
      dto.reason,
    );

    if (this.auditService) {
      await this.auditService.log({
        who: AuditService.fromCurrentUser(currentUser),
        action: AuditAction.ROOM_TRANSITION,
        targetType: "room",
        targetId: room._id.toString(),
        branchId: room.branchId.toString(),
        from: { status: current },
        to: { status: target },
        metadata: {
          roomNumber: room.roomNumber,
          linkedDispatchId: linkedDispatch?._id?.toString(),
          reason: dto.reason,
        },
      });

      if (target === CleaningStatus.INSPECTED) {
        await this.auditService.log({
          who: AuditService.fromCurrentUser(currentUser),
          action: AuditAction.ROOM_INSPECTION,
          targetType: "room",
          targetId: room._id.toString(),
          branchId: room.branchId.toString(),
          from: { status: current },
          to: { status: target },
          metadata: { roomNumber: room.roomNumber },
        });
      }
    }

    return {
      roomId: room._id.toString(),
      roomNumber: room.roomNumber,
      cleaningStatus: room.cleaningStatus,
      isNoOp: false,
      dispatchId: linkedDispatch?._id?.toString(),
      dispatchStatus: linkedDispatch?.status,
      assigneeName: await this.displayName(linkedDispatch?.assigneeUserId),
      notified,
    };
  }

  private async displayName(
    userId?: Types.ObjectId | string | null,
  ): Promise<string | undefined> {
    if (!userId || !this.userModel) return undefined;
    const u = await this.userModel
      .findById(userId)
      .select("displayName")
      .lean()
      .exec();
    return u?.displayName ?? undefined;
  }

  /** Housekeepers on a branch's roster: the pool that unassigned room work goes to. */
  private async housekeeperIds(
    branchId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    if (!this.userModel) return [];
    const users = await this.userModel
      .find({
        branchIds: branchId,
        role: UserRole.STAFF,
        jobTitle: /housekeep/i,
      })
      .select("_id")
      .lean()
      .exec();
    return users.map((u) => u._id);
  }

  /**
   * One rule set for room notifications, delivered through the push/LINE worker.
   * Returns the names of the people notified so the caller can say who was told.
   */
  private async notifyRoomChange(
    room: RoomDocument,
    from: CleaningStatus,
    to: CleaningStatus,
    task: OperationalDispatchDocument | null | undefined,
    actor: ICurrentUser,
    reason?: string,
  ): Promise<string[]> {
    if (!this.notificationsService || !this.userModel) return [];
    const sentTo: string[] = [];
    try {
      const data = {
        roomId: room._id.toString(),
        roomNumber: room.roomNumber,
        dispatchId: task?._id?.toString(),
      };
      const send = async (
        userIds: Types.ObjectId[],
        n: Omit<
          Parameters<NotificationsService["createNotification"]>[0],
          "userId" | "branchId"
        >,
      ) => {
        for (const id of userIds) {
          if (String(id) === actor.userId) continue;
          await this.notificationsService!.createNotification({
            ...n,
            userId: String(id),
            branchId: room.branchId.toString(),
          });
          sentTo.push(String(id));
        }
      };

      if (to === CleaningStatus.CLEAN) {
        const inspectors = await this.userModel
          .find({
            branchIds: room.branchId,
            $or: [
              { role: { $in: [UserRole.BRANCH_MGR, UserRole.ADMIN] } },
              { permissions: Permission.HOUSEKEEPING_INSPECT },
            ],
          })
          .select("_id")
          .lean()
          .exec();
        await send(
          inspectors.map((u) => u._id),
          {
            type: NotificationType.GENERAL,
            severity: NotificationSeverity.INFO,
            title: `Room ${room.roomNumber} ready for inspection`,
            body: `Room ${room.roomNumber} has been cleaned and is waiting for sign-off.`,
            data,
          },
        );
      } else if (to === CleaningStatus.DIRTY && from !== CleaningStatus.DIRTY) {
        const owner = task?.assigneeUserId;
        const recipients = owner
          ? [owner]
          : await this.housekeeperIds(room.branchId);
        await send(recipients, {
          type: NotificationType.ROOM_DIRTY,
          severity:
            from === CleaningStatus.CLEAN
              ? NotificationSeverity.CRITICAL
              : NotificationSeverity.WARN,
          title:
            from === CleaningStatus.CLEAN
              ? `Reclean room ${room.roomNumber}`
              : `Room ${room.roomNumber} needs cleaning`,
          body: reason
            ? `Reason: ${reason}`
            : `Room ${room.roomNumber} is back in the queue.`,
          data: { ...data, reason: reason ?? "" },
        });
      } else if (to === CleaningStatus.INSPECTED && task?.assigneeUserId) {
        await send([task.assigneeUserId], {
          type: NotificationType.GENERAL,
          severity: NotificationSeverity.INFO,
          title: `Room ${room.roomNumber} passed inspection`,
          body: `Room ${room.roomNumber} is signed off and ready for the guest.`,
          data,
        });
      } else if (to === CleaningStatus.IN_PROGRESS && task?.assigneeUserId) {
        // someone else (a manager) started a room that belongs to a housekeeper
        await send([task.assigneeUserId], {
          type: NotificationType.GENERAL,
          severity: NotificationSeverity.INFO,
          title: `Room ${room.roomNumber} marked as being cleaned`,
          body: `A supervisor started room ${room.roomNumber} on your behalf.`,
          data,
        });
      }
      if (!sentTo.length) return [];
      const users = await this.userModel
        .find({ _id: { $in: sentTo.map((id) => new Types.ObjectId(id)) } })
        .select("displayName")
        .lean()
        .exec();
      return users.map((u) => u.displayName).filter(Boolean);
    } catch (err) {
      this.logger.warn(`Failed to notify room change: ${err}`);
      return [];
    }
  }

  // ─── Airport pickups: the driver reports each step, the desk watches ─────────

  /** Legacy app builds: "start" means the driver left for the airport. */
  async startPickup(
    currentUser: ICurrentUser,
    dispatchId: string,
  ): Promise<PickupTaskResponseDto> {
    return this.recordPickupStep(currentUser, dispatchId, {
      stage: PickupStage.EN_ROUTE,
    });
  }

  /** Legacy app builds: "done" means the guest was dropped at the hotel. */
  async donePickup(
    currentUser: ICurrentUser,
    dispatchId: string,
  ): Promise<PickupTaskResponseDto> {
    return this.recordPickupStep(currentUser, dispatchId, {
      stage: PickupStage.DROPPED_OFF,
    });
  }

  private async loadPickup(currentUser: ICurrentUser, dispatchId: string) {
    if (
      !currentUser.isPlatformAdmin &&
      (!currentUser.branchIds || currentUser.branchIds.length === 0)
    ) {
      throw new ForbiddenException("No branch access assigned");
    }
    if (!Types.ObjectId.isValid(dispatchId)) {
      throw new NotFoundException("Invalid dispatch ID");
    }
    const dispatch = await this.dispatchModel.findById(dispatchId).exec();
    if (!dispatch || dispatch.type !== DispatchType.AIRPORT_PICKUP) {
      throw new NotFoundException("Pickup dispatch not found");
    }
    if (
      !currentUser.isPlatformAdmin &&
      !currentUser.branchIds.includes(dispatch.branchId.toString())
    ) {
      throw new ForbiddenException("Access denied to branch");
    }
    const isSupervisor =
      currentUser.isPlatformAdmin ||
      currentUser.role === UserRole.ADMIN ||
      currentUser.role === UserRole.BRANCH_MGR ||
      currentUser.role === UserRole.DISPATCHER;
    if (
      !isSupervisor &&
      dispatch.assigneeUserId?.toString() !== currentUser.userId
    ) {
      throw new ForbiddenException("You are not assigned to this pickup");
    }
    return { dispatch, isSupervisor };
  }

  private pickupResponse(
    dispatch: OperationalDispatchDocument,
    notified: string[] = [],
  ): PickupTaskResponseDto {
    return {
      dispatchId: dispatch._id.toString(),
      status: dispatch.status,
      driverUserId: dispatch.assigneeUserId?.toString(),
      completedAt: dispatch.completedAt,
      stage: currentPickupStage(dispatch),
      notified,
    };
  }

  /**
   * The driver (or the desk, when a driver phones in) records the step a pickup has reached.
   * Forward only; repeating or going back is a no-op so offline replays are safe.
   */
  async recordPickupStep(
    currentUser: ICurrentUser,
    dispatchId: string,
    dto: PickupStepDto,
  ): Promise<PickupTaskResponseDto> {
    const { dispatch, isSupervisor } = await this.loadPickup(
      currentUser,
      dispatchId,
    );
    const from = currentPickupStage(dispatch);
    const forward =
      PICKUP_STAGE_ORDER.indexOf(dto.stage) > PICKUP_STAGE_ORDER.indexOf(from);

    if (!forward) return this.pickupResponse(dispatch);
    if (
      dispatch.status === DispatchStatus.DONE ||
      dispatch.status === DispatchStatus.DISMISSED
    ) {
      throw new ConflictException(
        `Cannot update a pickup in ${dispatch.status} status`,
      );
    }
    if (!dispatch.assigneeUserId) {
      throw new ConflictException("Assign a driver to this pickup first");
    }

    const now = new Date();
    const actorName = await this.displayName(currentUser.userId);
    const onBehalf =
      isSupervisor && dispatch.assigneeUserId.toString() !== currentUser.userId;
    const note =
      [
        onBehalf ? `Recorded by ${actorName ?? "the desk"} for the driver` : "",
        dto.note?.trim(),
      ]
        .filter(Boolean)
        .join(" · ") || undefined;

    const previousStatus = dispatch.status;
    dispatch.status =
      dto.stage === PickupStage.DROPPED_OFF
        ? DispatchStatus.DONE
        : PICKUP_STAGE_ORDER.indexOf(dto.stage) >=
            PICKUP_STAGE_ORDER.indexOf(PickupStage.EN_ROUTE)
          ? DispatchStatus.IN_PROGRESS
          : DispatchStatus.OPEN;
    if (dispatch.status === DispatchStatus.DONE) dispatch.completedAt = now;

    if (dispatch.pickup) {
      dispatch.pickup.stage = dto.stage;
      dispatch.pickup.steps = [
        ...(dispatch.pickup.steps ?? []),
        {
          stage: dto.stage,
          at: now,
          byUserId: new Types.ObjectId(currentUser.userId),
          byName: actorName,
          note,
        },
      ];
      // moving on means whatever was wrong sorted itself out
      if (dispatch.pickup.issue && !dispatch.pickup.issue.resolvedAt) {
        dispatch.pickup.issue.resolvedAt = now;
        dispatch.pickup.issue.resolution = PickupIssueResolution.CONTINUED;
      }
      dispatch.markModified("pickup");
    }
    await dispatch.save();

    await this.auditService?.log({
      who: AuditService.fromCurrentUser(currentUser),
      action: AuditAction.DISPATCH_STATUS_CHANGE,
      targetType: "dispatch",
      targetId: dispatch._id.toString(),
      branchId: dispatch.branchId.toString(),
      from: { status: previousStatus, stage: from },
      to: { status: dispatch.status, stage: dto.stage },
      metadata: {
        type: DispatchType.AIRPORT_PICKUP,
        assigneeUserId: dispatch.assigneeUserId?.toString(),
        note,
      },
    });

    const notified = await this.notifyPickupStep(
      dispatch,
      dto.stage,
      currentUser,
    );
    return this.pickupResponse(dispatch, notified);
  }

  /** The driver raises a problem; the desk gets an urgent alert and has to answer it. */
  async reportPickupIssue(
    currentUser: ICurrentUser,
    dispatchId: string,
    dto: PickupIssueDto,
  ): Promise<PickupTaskResponseDto> {
    const { dispatch } = await this.loadPickup(currentUser, dispatchId);
    if (
      dispatch.status === DispatchStatus.DONE ||
      dispatch.status === DispatchStatus.DISMISSED ||
      !dispatch.pickup
    ) {
      throw new ConflictException("This pickup is already closed");
    }
    const actorName = await this.displayName(currentUser.userId);
    dispatch.pickup.issue = {
      kind: dto.kind,
      note: dto.note?.trim() || undefined,
      at: new Date(),
      byName: actorName,
    };
    dispatch.severity = Severity.CRITICAL;
    dispatch.markModified("pickup");
    await dispatch.save();

    await this.auditService?.log({
      who: AuditService.fromCurrentUser(currentUser),
      action: AuditAction.DISPATCH_STATUS_CHANGE,
      targetType: "dispatch",
      targetId: dispatch._id.toString(),
      branchId: dispatch.branchId.toString(),
      from: {},
      to: { issue: dto.kind },
      metadata: { type: DispatchType.AIRPORT_PICKUP, note: dto.note },
    });

    const p = dispatch.pickup;
    const sentTo = await this.notifyUsers(
      await this.deskIds(dispatch.branchId),
      currentUser,
      {
        branchId: dispatch.branchId.toString(),
        type: NotificationType.CRITICAL_ALERT,
        severity: NotificationSeverity.CRITICAL,
        title: `Pickup ${p.flightNumber}: ${PICKUP_ISSUE_LABEL[dto.kind]}`,
        body: `${actorName ?? "The driver"} reports a problem picking up ${p.guestName}${dto.note ? `: ${dto.note}` : "."} Answer in Dispatch.`,
        data: { dispatchId, type: DispatchType.AIRPORT_PICKUP },
      },
    );
    return this.pickupResponse(dispatch, sentTo);
  }

  /** Front desk and dispatch: the people who need to know where a guest is. */
  private async deskIds(branchId: Types.ObjectId): Promise<Types.ObjectId[]> {
    if (!this.userModel) return [];
    const users = await this.userModel
      .find({
        branchIds: branchId,
        isSuspended: { $ne: true },
        $or: [
          { role: { $in: [UserRole.BRANCH_MGR, UserRole.DISPATCHER] } },
          { role: UserRole.STAFF, jobTitle: /front|recep|concierge/i },
        ],
      })
      .select("_id")
      .lean()
      .exec();
    return users.map((u) => u._id);
  }

  /** Create one notification per user (never the actor); returns the names reached. */
  private async notifyUsers(
    userIds: Types.ObjectId[],
    actor: ICurrentUser,
    n: Omit<
      Parameters<NotificationsService["createNotification"]>[0],
      "userId"
    >,
  ): Promise<string[]> {
    if (!this.notificationsService || !this.userModel) return [];
    const targets = [...new Set(userIds.map(String))].filter(
      (id) => id !== actor.userId,
    );
    try {
      for (const id of targets) {
        await this.notificationsService.createNotification({
          ...n,
          userId: id,
        });
      }
      if (!targets.length) return [];
      const users = await this.userModel
        .find({ _id: { $in: targets.map((id) => new Types.ObjectId(id)) } })
        .select("displayName")
        .lean()
        .exec();
      return users.map((u) => u.displayName).filter(Boolean);
    } catch (err) {
      this.logger.warn(`Failed to send notifications: ${err}`);
      return [];
    }
  }

  /**
   * Who hears about each step. Accepting, leaving and waiting at the door show live on the
   * board; the desk is pinged when the guest is in the car and when they reach the lobby,
   * and housekeeping is pinged when a guest is on the way to a room that isn't ready.
   */
  private async notifyPickupStep(
    dispatch: OperationalDispatchDocument,
    stage: PickupStage,
    actor: ICurrentUser,
  ): Promise<string[]> {
    const p = dispatch.pickup;
    if (!p) return [];
    const branchId = dispatch.branchId.toString();
    const data = {
      dispatchId: dispatch._id.toString(),
      type: DispatchType.AIRPORT_PICKUP,
    };

    if (stage === PickupStage.GUEST_ON_BOARD) {
      const atHotel = new Date(Date.now() + AIRPORT_TO_HOTEL_MIN * 60_000);
      const turnaround = await this.dispatchModel
        .findOne({
          type: DispatchType.HOUSEKEEPING_TURNAROUND,
          "housekeeping.orderId": p.orderId,
          serviceDate: dispatch.serviceDate,
        })
        .exec();
      const room = turnaround?.housekeeping
        ? await this.roomModel.findById(turnaround.housekeeping.roomId).exec()
        : null;
      const ready = room?.cleaningStatus === CleaningStatus.INSPECTED;
      const roomLine = room
        ? `Room ${room.roomNumber} is ${ready ? "ready" : CLEANING_LABEL[room.cleaningStatus]}.`
        : "No room assigned yet.";

      // the guest's real arrival tightens the room's deadline
      if (turnaround?.housekeeping && !ready) {
        turnaround.housekeeping.etaAt = atHotel;
        if (+turnaround.housekeeping.targetReadyBy > +atHotel) {
          turnaround.housekeeping.targetReadyBy = atHotel;
          turnaround.dueAt = atHotel;
        }
        turnaround.markModified("housekeeping");
        await turnaround.save();
      }

      const told = await this.notifyUsers(
        await this.deskIds(dispatch.branchId),
        actor,
        {
          branchId,
          type: NotificationType.GENERAL,
          severity: ready
            ? NotificationSeverity.INFO
            : NotificationSeverity.WARN,
          title: `${p.guestName} picked up — at hotel ~${hhmm(atHotel)}`,
          body: `${p.flightNumber} · ${roomLine}`,
          data,
        },
      );
      if (room && !ready) {
        const owner = turnaround?.assigneeUserId;
        told.push(
          ...(await this.notifyUsers(
            owner ? [owner] : await this.housekeeperIds(room.branchId),
            actor,
            {
              branchId,
              type: NotificationType.CRITICAL_ALERT,
              severity: NotificationSeverity.CRITICAL,
              title: `Room ${room.roomNumber}: guest arrives ~${hhmm(atHotel)}`,
              body: `${p.guestName} just left the airport and the room is ${CLEANING_LABEL[room.cleaningStatus]}.`,
              data: { ...data, roomId: room._id.toString() },
            },
          )),
        );
      }
      return told;
    }

    if (stage === PickupStage.DROPPED_OFF) {
      return this.notifyUsers(await this.deskIds(dispatch.branchId), actor, {
        branchId,
        type: NotificationType.GENERAL,
        severity: NotificationSeverity.INFO,
        title: `${p.guestName} is at the lobby`,
        body: `Pickup ${p.flightNumber} complete. Time to welcome them in.`,
        data,
      });
    }
    return [];
  }

  // ─── LINE Link Token ──────────────────────────────────────────────────────────

  async createLineLinkToken(
    currentUser: ICurrentUser,
  ): Promise<LineLinkTokenResponseDto> {
    const { code, expiresAt } = await this.userService.createLineLinkToken(
      currentUser.userId,
    );
    return {
      code,
      expiresAt,
      instructions:
        "Send this 6-character code to the Yoonie LINE Official Account within 10 minutes to link your account.",
    };
  }

  // ─── LINE Webhook ─────────────────────────────────────────────────────────────

  async handleLineWebhook(
    signature: string,
    rawBody: Buffer | string,
    body: any,
  ): Promise<{ status: string }> {
    const channelSecret =
      this.configService.get<{ lineMessagingChannelSecret?: string }>(
        "staffOpsConfig",
      )?.lineMessagingChannelSecret ||
      process.env.LINE_MESSAGING_CHANNEL_SECRET;

    if (channelSecret && signature) {
      const buffer = Buffer.isBuffer(rawBody)
        ? rawBody
        : Buffer.from(
            typeof rawBody === "string" ? rawBody : JSON.stringify(body || {}),
          );

      const calculated = crypto
        .createHmac("sha256", channelSecret)
        .update(buffer)
        .digest("base64");

      if (signature !== calculated) {
        throw new UnauthorizedException("Invalid LINE signature");
      }
    }

    const events = body?.events || [];
    for (const event of events) {
      if (
        event?.type === "message" &&
        event?.message?.type === "text" &&
        event?.source?.userId
      ) {
        const text = String(event.message.text).trim();
        const lineUserId = event.source.userId;
        const linked = await this.userService.linkLineUser(text, lineUserId);
        if (linked) {
          this.logger.log(`Linked LINE user ${lineUserId} via token`);
        }
      }
    }

    return { status: "ok" };
  }
}
