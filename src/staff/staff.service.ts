import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
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
import { DispatchStatus, DispatchType } from "../common/enums/dispatch.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { toBranchBusinessDate } from "../common/helpers/time.helper";
import { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/enums/audit-action.enum";

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
    private readonly auditService?: AuditService,
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

    // 1. Housekeeper tasks: HOUSEKEEPING_TURNAROUND assigned to currentUser, OPEN or IN_PROGRESS
    const housekeepingQuery: Record<string, any> = {
      assigneeUserId: userObjectId,
      type: DispatchType.HOUSEKEEPING_TURNAROUND,
      status: { $in: [DispatchStatus.OPEN, DispatchStatus.IN_PROGRESS] },
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
        };
      },
    );

    // 2. Driver tasks: AIRPORT_PICKUP assigned to currentUser, OPEN or IN_PROGRESS
    // serviceDate is today in the BRANCH timezone
    let branchTimezone = "Asia/Bangkok";
    if (currentUser.branchIds && currentUser.branchIds.length > 0) {
      const branch = await this.branchModel
        .findById(currentUser.branchIds[0])
        .lean()
        .exec();
      if (branch?.timezone) {
        branchTimezone = branch.timezone;
      }
    }
    const todayBranchDate = toBranchBusinessDate(new Date(), branchTimezone);

    const pickupQuery: Record<string, any> = {
      assigneeUserId: userObjectId,
      type: DispatchType.AIRPORT_PICKUP,
      serviceDate: todayBranchDate,
      status: { $in: [DispatchStatus.OPEN, DispatchStatus.IN_PROGRESS] },
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
      };
    });

    return {
      housekeeping: housekeepingTasks,
      pickups: pickupTasks,
    };
  }

  // ─── Transition Room Cleaning Status ──────────────────────────────────────────

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

    // Find linked turnaround dispatch (if any)
    const linkedDispatch = await this.dispatchModel
      .findOne({
        type: DispatchType.HOUSEKEEPING_TURNAROUND,
        "housekeeping.roomId": room._id,
        status: { $in: [DispatchStatus.OPEN, DispatchStatus.IN_PROGRESS] },
      })
      .exec();

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

    // "assigned housekeeper" = room has an open dispatch assigned to me
    const isAssigned =
      linkedDispatch?.assigneeUserId &&
      linkedDispatch.assigneeUserId.toString() === currentUser.userId;

    if (!linkedDispatch) {
      if (!isMgrOrAdmin) {
        throw new ForbiddenException(
          "Rooms with no active dispatch can only be transitioned by manager or admin",
        );
      }
    } else {
      if (!isAssigned && !isMgrOrAdmin) {
        throw new ForbiddenException(
          "You are not the assigned housekeeper for this room",
        );
      }
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
      const hasInspectPermission =
        currentUser.isPlatformAdmin ||
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
          "A reason is required when failing inspection back to DIRTY",
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

      if (linkedDispatch && targetDispatchStatus) {
        linkedDispatch.status = targetDispatchStatus;
        if (targetDispatchStatus === DispatchStatus.DONE) {
          linkedDispatch.completedAt = new Date();
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
    };
  }

  // ─── Start Pickup ─────────────────────────────────────────────────────────────

  async startPickup(
    currentUser: ICurrentUser,
    dispatchId: string,
  ): Promise<PickupTaskResponseDto> {
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

    if (dispatch.status === DispatchStatus.IN_PROGRESS) {
      return {
        dispatchId: dispatch._id.toString(),
        status: dispatch.status,
        driverUserId: dispatch.assigneeUserId?.toString(),
      };
    }

    if (
      dispatch.status === DispatchStatus.DONE ||
      dispatch.status === DispatchStatus.DISMISSED
    ) {
      throw new ConflictException(
        `Cannot start pickup in ${dispatch.status} status`,
      );
    }

    const previousStatus = dispatch.status;
    dispatch.status = DispatchStatus.IN_PROGRESS;
    await dispatch.save();

    if (this.auditService) {
      await this.auditService.log({
        who: AuditService.fromCurrentUser(currentUser),
        action: AuditAction.DISPATCH_STATUS_CHANGE,
        targetType: "dispatch",
        targetId: dispatch._id.toString(),
        branchId: dispatch.branchId.toString(),
        from: { status: previousStatus },
        to: { status: DispatchStatus.IN_PROGRESS },
        metadata: {
          type: DispatchType.AIRPORT_PICKUP,
          assigneeUserId: dispatch.assigneeUserId?.toString(),
        },
      });
    }

    return {
      dispatchId: dispatch._id.toString(),
      status: dispatch.status,
      driverUserId: dispatch.assigneeUserId?.toString(),
    };
  }

  // ─── Done Pickup ──────────────────────────────────────────────────────────────

  async donePickup(
    currentUser: ICurrentUser,
    dispatchId: string,
  ): Promise<PickupTaskResponseDto> {
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

    if (dispatch.status === DispatchStatus.DONE) {
      return {
        dispatchId: dispatch._id.toString(),
        status: dispatch.status,
        driverUserId: dispatch.assigneeUserId?.toString(),
        completedAt: dispatch.completedAt,
      };
    }

    const previousStatus = dispatch.status;
    dispatch.status = DispatchStatus.DONE;
    dispatch.completedAt = new Date();
    await dispatch.save();

    if (this.auditService) {
      await this.auditService.log({
        who: AuditService.fromCurrentUser(currentUser),
        action: AuditAction.DISPATCH_STATUS_CHANGE,
        targetType: "dispatch",
        targetId: dispatch._id.toString(),
        branchId: dispatch.branchId.toString(),
        from: { status: previousStatus },
        to: { status: DispatchStatus.DONE },
        metadata: {
          type: DispatchType.AIRPORT_PICKUP,
          assigneeUserId: dispatch.assigneeUserId?.toString(),
        },
      });
    }

    return {
      dispatchId: dispatch._id.toString(),
      status: dispatch.status,
      driverUserId: dispatch.assigneeUserId?.toString(),
      completedAt: dispatch.completedAt,
    };
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
