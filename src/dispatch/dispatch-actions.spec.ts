import { BadRequestException, ConflictException } from "@nestjs/common";
import { Types } from "mongoose";
import { DispatchService } from "./dispatch.service";
import { DispatchStatus, DispatchType } from "../common/enums/dispatch.enum";
import { UserRole } from "../common/enums/user-role.enum";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { NotificationType } from "../notifications/enums/notification-type.enum";
import { PickupStage } from "../common/enums/pickup.enum";

describe("DispatchService - one work model", () => {
  const branchId = new Types.ObjectId();
  const manager: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "anan@riverside-bkk.example",
    role: UserRole.BRANCH_MGR,
    isSuspended: false,
    branchIds: [branchId.toString()],
    permissions: [],
    isPlatformAdmin: false,
  };
  const housekeeper: ICurrentUser = {
    ...manager,
    userId: new Types.ObjectId().toString(),
    role: UserRole.STAFF,
  };

  const task = (over: Record<string, unknown> = {}): any => ({
    _id: new Types.ObjectId(),
    branchId,
    type: DispatchType.AIRPORT_PICKUP,
    status: DispatchStatus.OPEN,
    title: "Pickup TG 930 14:40 (Guest)",
    severity: "INFO",
    pickup: { card: { en: "Welcome card", th: "" } },
    save: jest.fn().mockImplementation(function (this: unknown) {
      return Promise.resolve(this);
    }),
    markModified: jest.fn(),
    ...over,
  });

  let repo: { findById: jest.Mock; updateStatus: jest.Mock };
  let notifications: { createNotification: jest.Mock };
  let users: { findById: jest.Mock };
  let service: DispatchService;

  beforeEach(() => {
    repo = { findById: jest.fn(), updateStatus: jest.fn() };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    users = {
      findById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => ({
            exec: () => Promise.resolve({ branchIds: [branchId] }),
          }),
        }),
      }),
    };
    service = new DispatchService(
      repo as never,
      undefined,
      undefined,
      notifications as never,
      undefined,
      users as never,
    );
  });

  it("refuses to change a room turnaround directly", async () => {
    repo.findById.mockResolvedValue(
      task({ type: DispatchType.HOUSEKEEPING_TURNAROUND }),
    );
    await expect(
      service.updateStatus(
        manager,
        String(new Types.ObjectId()),
        DispatchStatus.DONE,
      ),
    ).rejects.toThrow(ConflictException);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects the retired ACKNOWLEDGED status", async () => {
    repo.findById.mockResolvedValue(task());
    await expect(
      service.updateStatus(
        manager,
        String(new Types.ObjectId()),
        DispatchStatus.ACKNOWLEDGED,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("lets a staff member claim an unassigned task, but not someone else's", async () => {
    const open = task();
    repo.findById.mockResolvedValue(open);
    await service.claim(housekeeper, String(open._id));
    expect(String(open.assigneeUserId)).toBe(housekeeper.userId);

    repo.findById.mockResolvedValue(
      task({ assigneeUserId: new Types.ObjectId() }),
    );
    await expect(
      service.claim(housekeeper, String(new Types.ObjectId())),
    ).rejects.toThrow(ConflictException);
  });

  it("assigning a pickup sets the driver and sends them the card", async () => {
    const pickup = task();
    repo.findById.mockResolvedValue(pickup);
    const driverId = new Types.ObjectId().toString();

    await service.assign(manager, String(pickup._id), driverId);

    expect(String(pickup.pickup.driverUserId)).toBe(driverId);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: driverId,
        type: NotificationType.PICKUP_READY,
        body: "Welcome card",
      }),
    );
  });

  it("a driver who takes a pickup from the pool has accepted it", async () => {
    const open = task();
    repo.findById.mockResolvedValue(open);
    await service.claim(housekeeper, String(open._id));
    expect(open.pickup.stage).toBe(PickupStage.CONFIRMED);
    expect(open.pickup.steps).toHaveLength(1);
  });

  it("giving a pickup to a new driver asks them to accept again", async () => {
    const accepted = task({
      assigneeUserId: new Types.ObjectId(),
      pickup: {
        card: { en: "Welcome card", th: "" },
        stage: PickupStage.CONFIRMED,
        steps: [],
      },
    });
    repo.findById.mockResolvedValue(accepted);
    await service.assign(
      manager,
      String(accepted._id),
      new Types.ObjectId().toString(),
    );
    expect(accepted.pickup.stage).toBe(PickupStage.ASSIGNED);
    expect(accepted.pickup.steps[0].stage).toBe(PickupStage.ASSIGNED);
  });

  it("a no-show answer closes the pickup and stands the driver down", async () => {
    const driverId = new Types.ObjectId();
    const stuck = task({
      assigneeUserId: driverId,
      pickup: {
        flightNumber: "TG 930",
        guestName: "Guest",
        card: { en: "", th: "" },
        stage: PickupStage.AT_AIRPORT,
        issue: { kind: "GUEST_NOT_FOUND", at: new Date() },
      },
    });
    repo.findById.mockResolvedValue(stuck);
    await service.resolvePickupIssue(manager, String(stuck._id), {
      resolution: "NO_SHOW",
    });
    expect(stuck.status).toBe(DispatchStatus.DISMISSED);
    expect(stuck.pickup.issue.resolvedAt).toBeInstanceOf(Date);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: String(driverId) }),
    );
  });

  it("closes a tour flag with a recorded decision", async () => {
    const tour = task({
      type: DispatchType.TOUR_CONSOLIDATION,
      pickup: undefined,
      consolidation: { serviceName: "Sunset Cruise" },
      markModified: jest.fn(),
    });
    repo.findById.mockResolvedValue(tour);

    await service.decideTour(manager, String(tour._id), {
      decision: "MERGE",
      note: "Moved to 16:30",
    });

    expect(tour.status).toBe(DispatchStatus.DONE);
    expect(tour.consolidation).toMatchObject({
      decision: "MERGE",
      decisionNote: "Moved to 16:30",
    });
  });
});
