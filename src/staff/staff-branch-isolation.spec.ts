import { ForbiddenException } from "@nestjs/common";
import { Types } from "mongoose";
import { StaffService } from "./staff.service";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { Permission } from "../common/enums/permission.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";

describe("StaffService - Branch Isolation", () => {
  let service: StaffService;
  let mockDispatchModel: any;
  let mockRoomModel: any;
  let mockBranchModel: any;

  const branchA = new Types.ObjectId().toString();
  const branchB = new Types.ObjectId().toString();
  const roomIdB = new Types.ObjectId().toString();

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

    service = new StaffService(
      mockDispatchModel,
      mockRoomModel,
      mockBranchModel,
      {} as any,
      { get: jest.fn().mockReturnValue({}) } as any,
      { startSession: jest.fn().mockRejectedValue(new Error()) } as any,
    );
  });

  it("should deny access (403) when user has empty branchIds", async () => {
    const userWithNoBranches: ICurrentUser = {
      userId: new Types.ObjectId().toString(),
      email: "user@example.com",
      role: UserRole.STAFF,
      isSuspended: false,
      branchIds: [],
      permissions: [Permission.HOUSEKEEPING_STATUS],
      isPlatformAdmin: false,
    };

    await expect(service.getTasks(userWithNoBranches)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("should deny access (403) when Branch A user tries to transition a room in Branch B", async () => {
    const branchAUser: ICurrentUser = {
      userId: new Types.ObjectId().toString(),
      email: "staffA@example.com",
      role: UserRole.BRANCH_MGR,
      isSuspended: false,
      branchIds: [branchA],
      permissions: [Permission.HOUSEKEEPING_STATUS],
      isPlatformAdmin: false,
    };

    mockRoomModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(roomIdB),
        branchId: new Types.ObjectId(branchB), // Belongs to Branch B!
        cleaningStatus: CleaningStatus.DIRTY,
      }),
    });

    await expect(
      service.transitionRoom(branchAUser, roomIdB, {
        toStatus: CleaningStatus.IN_PROGRESS,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should allow cross-branch access if isPlatformAdmin is true", async () => {
    const platformAdminUser: ICurrentUser = {
      userId: new Types.ObjectId().toString(),
      email: "superadmin@example.com",
      role: UserRole.ADMIN,
      isSuspended: false,
      branchIds: [], // Empty branchIds, but isPlatformAdmin is true
      permissions: [Permission.HOUSEKEEPING_STATUS],
      isPlatformAdmin: true,
    };

    mockRoomModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(roomIdB),
        roomNumber: "201",
        branchId: new Types.ObjectId(branchB),
        cleaningStatus: CleaningStatus.DIRTY,
        save: jest.fn().mockResolvedValue(true),
      }),
    });
    mockDispatchModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    const result = await service.transitionRoom(platformAdminUser, roomIdB, {
      toStatus: CleaningStatus.IN_PROGRESS,
    });

    expect(result.cleaningStatus).toBe(CleaningStatus.IN_PROGRESS);
  });
});
