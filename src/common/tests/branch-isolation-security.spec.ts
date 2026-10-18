import { ForbiddenException } from "@nestjs/common";
import { Types } from "mongoose";
import { RoomService } from "../../room/room.service";
import { RestaurantService } from "../../restaurant/restaurant.service";
import { UserRole } from "../enums/user-role.enum";
import { ICurrentUser } from "../interfaces/user.interface";

describe("Branch A vs Branch B Isolation Security", () => {
  const branchA = new Types.ObjectId().toString();
  const branchB = new Types.ObjectId().toString();

  const managerA: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "managerA@hotel.com",
    role: UserRole.BRANCH_MGR,
    isSuspended: false,
    branchIds: [branchA],
    permissions: [],
    isPlatformAdmin: false,
  };

  const platformAdmin: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "admin@platform.com",
    role: UserRole.ADMIN,
    isSuspended: false,
    branchIds: [],
    permissions: [],
    isPlatformAdmin: true,
  };

  let roomService: RoomService;
  let mockRoomRepo: any;
  let restaurantService: RestaurantService;
  let mockRestaurantRepo: any;

  beforeEach(() => {
    mockRoomRepo = {
      create: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ _id: new Types.ObjectId(), ...data }),
        ),
      findById: jest.fn().mockImplementation((id) =>
        Promise.resolve({
          _id: id,
          branchId: new Types.ObjectId(branchB),
          roomNumber: "201",
          roomType: "DELUXE_DOUBLE",
          cleaningStatus: "CLEAN",
        }),
      ),
      update: jest.fn().mockResolvedValue({ success: true }),
    };

    roomService = new RoomService(mockRoomRepo, {} as any);

    mockRestaurantRepo = {
      create: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ _id: new Types.ObjectId(), ...data }),
        ),
      findById: jest.fn().mockImplementation((id) =>
        Promise.resolve({
          _id: id,
          branchId: new Types.ObjectId(branchB),
          code: "RST-B",
        }),
      ),
    };

    restaurantService = new RestaurantService(mockRestaurantRepo, {} as any);
  });

  it("should block Branch A manager from creating a room with Branch B id (403)", async () => {
    await expect(
      roomService.create(managerA, {
        branchId: branchB,
        roomNumber: "101",
        floor: 1,
        roomType: "DELUXE_DOUBLE" as any,
        maxOccupancy: 2,
        baseRateThb: 2500,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(mockRoomRepo.create).not.toHaveBeenCalled();
  });

  it("should allow Branch A manager to create a room with Branch A id (201)", async () => {
    const created = await roomService.create(managerA, {
      branchId: branchA,
      roomNumber: "101",
      floor: 1,
      roomType: "DELUXE_DOUBLE" as any,
      maxOccupancy: 2,
      baseRateThb: 2500,
    });

    expect(created).toBeDefined();
    expect(mockRoomRepo.create).toHaveBeenCalled();
  });

  it("should allow Platform Admin to create a room for Branch B (201)", async () => {
    const created = await roomService.create(platformAdmin, {
      branchId: branchB,
      roomNumber: "202",
      floor: 2,
      roomType: "DELUXE_DOUBLE" as any,
      maxOccupancy: 2,
      baseRateThb: 3000,
    });

    expect(created).toBeDefined();
  });

  it("should block Branch A manager from updating a room belonging to Branch B (403)", async () => {
    await expect(
      roomService.update(managerA, new Types.ObjectId().toString(), {
        roomNumber: "102",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should block Branch A manager from creating a restaurant for Branch B (403)", async () => {
    await expect(
      restaurantService.create(managerA, {
        branchId: branchB,
        code: "BISTRO-B",
        name: "Bistro B",
        cuisine: "Thai",
        maxSeats: 50,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
