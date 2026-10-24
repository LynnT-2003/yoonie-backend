import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { StaffService } from "./staff.service";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";
import { DispatchStatus, DispatchType } from "../common/enums/dispatch.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";

describe("StaffService - State Machine & Offline Replay Safety", () => {
  let service: StaffService;
  let mockDispatchModel: any;
  let mockRoomModel: any;
  let mockBranchModel: any;
  let mockUserService: any;
  let mockConfigService: any;
  let mockConnection: any;

  const branchId = new Types.ObjectId().toString();
  const roomId = new Types.ObjectId().toString();
  const dispatchId = new Types.ObjectId().toString();
  const staffUserId = new Types.ObjectId().toString();

  const housekeeperUser: ICurrentUser = {
    userId: staffUserId,
    email: "noi@riverside-bkk.example",
    role: UserRole.STAFF,
    isSuspended: false,
    branchIds: [branchId],
    permissions: [Permission.HOUSEKEEPING_STATUS],
    isPlatformAdmin: false,
  };

  const managerUser: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "anan@riverside-bkk.example",
    role: UserRole.BRANCH_MGR,
    isSuspended: false,
    branchIds: [branchId],
    permissions: [
      Permission.HOUSEKEEPING_STATUS,
      Permission.HOUSEKEEPING_INSPECT,
    ],
    isPlatformAdmin: false,
  };

  beforeEach(() => {
    mockRoomModel = {
      findById: jest.fn(),
    };
    mockDispatchModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
    };
    mockBranchModel = {
      findById: jest.fn(),
    };
    mockUserService = {};
    mockConfigService = {
      get: jest.fn().mockReturnValue({}),
    };
    mockConnection = {
      startSession: jest.fn().mockRejectedValue(new Error("No replica set")),
    };

    service = new StaffService(
      mockDispatchModel,
      mockRoomModel,
      mockBranchModel,
      mockUserService,
      mockConfigService,
      mockConnection,
    );
  });

  it("should perform offline replay safety: return 200 no-op if room is already in target state", async () => {
    const mockRoom = {
      _id: new Types.ObjectId(roomId),
      roomNumber: "101",
      branchId: new Types.ObjectId(branchId),
      cleaningStatus: CleaningStatus.IN_PROGRESS,
      save: jest.fn(),
    };
    mockRoomModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockRoom),
    });

    const mockDispatch = {
      _id: new Types.ObjectId(dispatchId),
      status: DispatchStatus.IN_PROGRESS,
    };
    mockDispatchModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockDispatch),
    });

    const result = await service.transitionRoom(housekeeperUser, roomId, {
      toStatus: CleaningStatus.IN_PROGRESS,
    });

    expect(result.isNoOp).toBe(true);
    expect(result.cleaningStatus).toBe(CleaningStatus.IN_PROGRESS);
    expect(mockRoom.save).not.toHaveBeenCalled();
  });

  it("should allow DIRTY -> IN_PROGRESS for assigned housekeeper and update dispatch to IN_PROGRESS", async () => {
    const mockRoom = {
      _id: new Types.ObjectId(roomId),
      roomNumber: "101",
      branchId: new Types.ObjectId(branchId),
      cleaningStatus: CleaningStatus.DIRTY,
      save: jest.fn().mockResolvedValue(true),
    };
    mockRoomModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockRoom),
    });

    const mockDispatch = {
      _id: new Types.ObjectId(dispatchId),
      assigneeUserId: new Types.ObjectId(staffUserId),
      status: DispatchStatus.OPEN,
      save: jest.fn().mockResolvedValue(true),
    };
    mockDispatchModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockDispatch),
    });

    const result = await service.transitionRoom(housekeeperUser, roomId, {
      toStatus: CleaningStatus.IN_PROGRESS,
    });

    expect(result.isNoOp).toBe(false);
    expect(mockRoom.cleaningStatus).toBe(CleaningStatus.IN_PROGRESS);
    expect(mockDispatch.status).toBe(DispatchStatus.IN_PROGRESS);
  });

  it("should allow IN_PROGRESS -> CLEAN and mark dispatch DONE", async () => {
    const mockRoom = {
      _id: new Types.ObjectId(roomId),
      roomNumber: "101",
      branchId: new Types.ObjectId(branchId),
      cleaningStatus: CleaningStatus.IN_PROGRESS,
      save: jest.fn().mockResolvedValue(true),
    };
    mockRoomModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockRoom),
    });

    const mockDispatch = {
      _id: new Types.ObjectId(dispatchId),
      assigneeUserId: new Types.ObjectId(staffUserId),
      status: DispatchStatus.IN_PROGRESS,
      save: jest.fn().mockResolvedValue(true),
    };
    mockDispatchModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockDispatch),
    });

    const result = await service.transitionRoom(housekeeperUser, roomId, {
      toStatus: CleaningStatus.CLEAN,
    });

    expect(result.isNoOp).toBe(false);
    expect(mockRoom.cleaningStatus).toBe(CleaningStatus.CLEAN);
    expect(mockDispatch.status).toBe(DispatchStatus.DONE);
  });

  it("should require housekeeping:inspect permission for CLEAN -> INSPECTED", async () => {
    const mockRoom = {
      _id: new Types.ObjectId(roomId),
      roomNumber: "101",
      branchId: new Types.ObjectId(branchId),
      cleaningStatus: CleaningStatus.CLEAN,
      save: jest.fn().mockResolvedValue(true),
    };
    mockRoomModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockRoom),
    });
    mockDispatchModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    // Housekeeper lacks housekeeping:inspect permission
    await expect(
      service.transitionRoom(housekeeperUser, roomId, {
        toStatus: CleaningStatus.INSPECTED,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Manager with housekeeping:inspect permission succeeds
    const result = await service.transitionRoom(managerUser, roomId, {
      toStatus: CleaningStatus.INSPECTED,
    });
    expect(result.cleaningStatus).toBe(CleaningStatus.INSPECTED);
  });

  it("should require reason when failing inspection back to DIRTY", async () => {
    const mockRoom = {
      _id: new Types.ObjectId(roomId),
      roomNumber: "101",
      branchId: new Types.ObjectId(branchId),
      cleaningStatus: CleaningStatus.CLEAN,
      save: jest.fn().mockResolvedValue(true),
    };
    mockRoomModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockRoom),
    });
    mockDispatchModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    // Without reason -> throws BadRequestException (400)
    await expect(
      service.transitionRoom(managerUser, roomId, {
        toStatus: CleaningStatus.DIRTY,
      }),
    ).rejects.toThrow(BadRequestException);

    // With reason -> succeeds
    const result = await service.transitionRoom(managerUser, roomId, {
      toStatus: CleaningStatus.DIRTY,
      reason: "Found hair in bathroom sink",
    });
    expect(result.cleaningStatus).toBe(CleaningStatus.DIRTY);
  });

  it("should throw 409 Conflict with current status on invalid state transition jump", async () => {
    const mockRoom = {
      _id: new Types.ObjectId(roomId),
      roomNumber: "101",
      branchId: new Types.ObjectId(branchId),
      cleaningStatus: CleaningStatus.DIRTY,
      save: jest.fn().mockResolvedValue(true),
    };
    mockRoomModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(mockRoom),
    });
    mockDispatchModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        assigneeUserId: new Types.ObjectId(staffUserId),
      }),
    });

    // Direct jump DIRTY -> CLEAN is illegal (must go through IN_PROGRESS)
    try {
      await service.transitionRoom(housekeeperUser, roomId, {
        toStatus: CleaningStatus.CLEAN,
      });
      fail("Expected ConflictException");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      const res = err.getResponse();
      expect(res.currentStatus).toBe(CleaningStatus.DIRTY);
      expect(res.targetStatus).toBe(CleaningStatus.CLEAN);
    }
  });
});
