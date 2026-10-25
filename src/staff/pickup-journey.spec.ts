import { ConflictException } from "@nestjs/common";
import { Types } from "mongoose";
import { StaffService } from "./staff.service";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { UserRole } from "../common/enums/user-role.enum";
import { DispatchStatus, DispatchType } from "../common/enums/dispatch.enum";
import { PickupStage } from "../common/enums/pickup.enum";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";

/** chainable query mock: .select().lean().exec() / .exec() all resolve to value */
const q = (value: unknown) => {
  const chain: any = {
    select: () => chain,
    lean: () => chain,
    sort: () => chain,
    exec: () => Promise.resolve(value),
  };
  return chain;
};

describe("StaffService - airport pickup journey", () => {
  const branchId = new Types.ObjectId();
  const driver: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: null,
    role: UserRole.STAFF,
    isSuspended: false,
    branchIds: [branchId.toString()],
    permissions: [],
    isPlatformAdmin: false,
  };
  const desk = { _id: new Types.ObjectId(), displayName: "Anan" };
  const housekeeper = { _id: new Types.ObjectId(), displayName: "Noi" };

  const pickup = (over: Record<string, unknown> = {}): any => ({
    _id: new Types.ObjectId(),
    branchId,
    serviceDate: "2026-10-25",
    type: DispatchType.AIRPORT_PICKUP,
    status: DispatchStatus.OPEN,
    assigneeUserId: new Types.ObjectId(driver.userId),
    pickup: {
      orderId: new Types.ObjectId(),
      guestName: "Hiroshi Tanaka",
      flightNumber: "EK 372",
      stage: PickupStage.CONFIRMED,
      steps: [],
    },
    save: jest.fn().mockResolvedValue(undefined),
    markModified: jest.fn(),
    ...over,
  });

  let dispatchModel: any;
  let roomModel: any;
  let userModel: any;
  let notifications: { createNotification: jest.Mock };
  let service: StaffService;

  const build = (doc: any, room?: any, turnaround?: any) => {
    dispatchModel = {
      findById: () => q(doc),
      findOne: () => q(turnaround ?? null),
    };
    roomModel = { findById: () => q(room ?? null) };
    userModel = {
      findById: () => q({ displayName: "Prasit" }),
      // desk lookup, housekeeper lookup and name lookups all go through find()
      find: jest.fn((filter: any) =>
        q(
          filter?.$or
            ? [desk]
            : filter?.jobTitle
              ? [housekeeper]
              : [desk, housekeeper].filter((u) =>
                  (filter?._id?.$in ?? []).some(
                    (id: Types.ObjectId) => String(id) === String(u._id),
                  ),
                ),
        ),
      ),
    };
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    service = new StaffService(
      dispatchModel,
      roomModel,
      {} as any,
      {} as any,
      { get: jest.fn().mockReturnValue({}) } as any,
      {} as any,
      userModel,
      undefined,
      undefined,
      notifications as any,
    );
  };

  it("moves forward and records who reported the step", async () => {
    const doc = pickup();
    build(doc);
    const res = await service.recordPickupStep(driver, String(doc._id), {
      stage: PickupStage.EN_ROUTE,
    });
    expect(res.stage).toBe(PickupStage.EN_ROUTE);
    expect(doc.status).toBe(DispatchStatus.IN_PROGRESS);
    expect(doc.pickup.steps[0]).toMatchObject({
      stage: PickupStage.EN_ROUTE,
      byName: "Prasit",
    });
  });

  it("ignores a repeated or backwards step (offline replay)", async () => {
    const doc = pickup({
      status: DispatchStatus.IN_PROGRESS,
      pickup: { stage: PickupStage.AT_AIRPORT, steps: [] },
    });
    build(doc);
    await service.recordPickupStep(driver, String(doc._id), {
      stage: PickupStage.EN_ROUTE,
    });
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("refuses steps on a pickup with no driver", async () => {
    const doc = pickup({ assigneeUserId: undefined });
    build(doc);
    await expect(
      service.recordPickupStep(
        { ...driver, role: UserRole.DISPATCHER },
        String(doc._id),
        { stage: PickupStage.EN_ROUTE },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("guest on board tells the desk and warns housekeeping when the room isn't ready", async () => {
    const doc = pickup({
      status: DispatchStatus.IN_PROGRESS,
      pickup: { ...pickup().pickup, stage: PickupStage.AT_AIRPORT },
    });
    const room = {
      _id: new Types.ObjectId(),
      branchId,
      roomNumber: "305",
      cleaningStatus: CleaningStatus.IN_PROGRESS,
    };
    const turnaround = {
      housekeeping: {
        roomId: room._id,
        etaAt: new Date(),
        targetReadyBy: new Date(Date.now() + 5 * 3_600_000),
      },
      assigneeUserId: housekeeper._id,
      save: jest.fn(),
      markModified: jest.fn(),
    };
    build(doc, room, turnaround);

    const res = await service.recordPickupStep(driver, String(doc._id), {
      stage: PickupStage.GUEST_ON_BOARD,
    });

    expect(res.notified).toEqual(["Anan", "Noi"]);
    const titles = notifications.createNotification.mock.calls.map(
      ([n]) => n.title,
    );
    expect(titles[0]).toMatch(/Hiroshi Tanaka picked up — at hotel ~/);
    expect(titles[1]).toMatch(/Room 305: guest arrives ~/);
    // the room's deadline tightens to the real arrival
    expect(+turnaround.housekeeping.targetReadyBy).toBeLessThan(
      Date.now() + 60 * 60_000,
    );
  });

  it("a problem report alerts the desk", async () => {
    const doc = pickup({ status: DispatchStatus.IN_PROGRESS });
    build(doc);
    const res = await service.reportPickupIssue(driver, String(doc._id), {
      kind: "GUEST_NOT_FOUND" as never,
      note: "Waited 30 min at door 4",
    });
    expect(doc.pickup.issue.kind).toBe("GUEST_NOT_FOUND");
    expect(res.notified).toEqual(["Anan"]);
  });
});
