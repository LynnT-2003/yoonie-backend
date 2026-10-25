import { ForbiddenException } from "@nestjs/common";
import { Types } from "mongoose";
import { OrderService } from "../../order/order.service";
import { StaffService } from "../../staff/staff.service";
import { UserRole } from "../enums/user-role.enum";
import { OrderStatus } from "../enums/order.enum";
import { DispatchStatus, DispatchType } from "../enums/dispatch.enum";
import { ICurrentUser } from "../interfaces/user.interface";
import { generateOrderToken } from "../helpers/order-token.helper";

describe("Order and Pickup Access Security (Requirements d & e)", () => {
  const branchId = new Types.ObjectId().toString();
  const orderId = new Types.ObjectId().toString();

  const guestUser: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "guest@example.com",
    role: UserRole.GUEST,
    isSuspended: false,
    branchIds: [],
    permissions: [],
    isPlatformAdmin: false,
  };

  const managerUser: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "mgr@example.com",
    role: UserRole.BRANCH_MGR,
    isSuspended: false,
    branchIds: [branchId],
    permissions: [],
    isPlatformAdmin: false,
  };

  const driverA: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "driverA@example.com",
    role: UserRole.STAFF,
    isSuspended: false,
    branchIds: [branchId],
    permissions: [],
    isPlatformAdmin: false,
  };

  const driverB: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "driverB@example.com",
    role: UserRole.STAFF,
    isSuspended: false,
    branchIds: [branchId],
    permissions: [],
    isPlatformAdmin: false,
  };

  const dispatcher: ICurrentUser = {
    userId: new Types.ObjectId().toString(),
    email: "dispatcher@example.com",
    role: UserRole.DISPATCHER,
    isSuspended: false,
    branchIds: [branchId],
    permissions: [],
    isPlatformAdmin: false,
  };

  describe("Requirement d: Order Token & Confirmation Security", () => {
    let orderService: OrderService;
    let mockOrderRepo: any;
    let mockInventoryService: any;
    let mockAuditService: any;

    beforeEach(() => {
      mockOrderRepo = {
        findById: jest.fn().mockImplementation((id) =>
          Promise.resolve({
            _id: new Types.ObjectId(id),
            orderNumber: "TS-261020-TEST",
            branchId: new Types.ObjectId(branchId),
            status: OrderStatus.PENDING,
            payment: { status: "UNPAID" },
            items: [],
            save: jest
              .fn()
              .mockResolvedValue({ status: OrderStatus.CONFIRMED }),
          }),
        ),
      };

      mockInventoryService = {
        confirm: jest.fn().mockResolvedValue(undefined),
      };

      mockAuditService = {
        log: jest.fn().mockResolvedValue({}),
      };

      orderService = new OrderService(
        mockOrderRepo,
        mockInventoryService,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockAuditService,
      );
    });

    it("should reject guest manual confirmation of an order (403)", async () => {
      await expect(
        orderService.confirmOrderPayment(orderId, { user: guestUser }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should reject GET /orders/:id for guest without a token (403)", async () => {
      await expect(
        orderService.findById(orderId, { user: guestUser }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should reject GET /orders/:id when provided an invalid/tampered token (403)", async () => {
      const invalidToken = "wrong-order-id.1799999999999.invalidhmacsignature";
      await expect(
        orderService.findById(orderId, {
          user: guestUser,
          token: invalidToken,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should allow GET /orders/:id with a valid HMAC order token", async () => {
      const validToken = generateOrderToken(orderId);
      const res = await orderService.findById(orderId, {
        user: guestUser,
        token: validToken,
      });

      expect(res).toBeDefined();
      expect(res._id.toString()).toBe(orderId);
    });

    it("should allow Branch Manager to manually confirm order with audit logging", async () => {
      const res = await orderService.confirmOrderPayment(
        orderId,
        { user: managerUser },
        "PAY-MANUAL-1",
        5000,
      );

      expect(res).toBeDefined();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ORDER_CONFIRM",
          targetType: "order",
        }),
      );
    });
  });

  describe("Requirement e: Driver Pickup Authorization", () => {
    let staffService: StaffService;
    let mockDispatchModel: any;

    const pickupId = new Types.ObjectId().toString();

    beforeEach(() => {
      mockDispatchModel = {
        findById: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(pickupId),
            branchId: new Types.ObjectId(branchId),
            type: DispatchType.AIRPORT_PICKUP,
            status: DispatchStatus.OPEN,
            assigneeUserId: new Types.ObjectId(driverA.userId),
            save: jest
              .fn()
              .mockResolvedValue({ status: DispatchStatus.IN_PROGRESS }),
          }),
        }),
      };

      staffService = new StaffService(
        mockDispatchModel,
        {} as any,
        {} as any,
        {} as any,
        { get: jest.fn().mockReturnValue({}) } as any,
        {} as any,
        undefined,
        undefined,
        { log: jest.fn().mockResolvedValue({}) } as any,
      );
    });

    it("should prevent driver B from starting driver A's assigned pickup (403)", async () => {
      await expect(staffService.startPickup(driverB, pickupId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should allow assigned driver A to start their pickup", async () => {
      const res = await staffService.startPickup(driverA, pickupId);
      expect(res.status).toBe(DispatchStatus.IN_PROGRESS);
    });

    it("should allow dispatcher to act on any pickup in their branch", async () => {
      const res = await staffService.startPickup(dispatcher, pickupId);
      expect(res.status).toBe(DispatchStatus.IN_PROGRESS);
    });

    it("should allow branch manager to act on any pickup in their branch", async () => {
      const res = await staffService.startPickup(managerUser, pickupId);
      expect(res.status).toBe(DispatchStatus.IN_PROGRESS);
    });
  });
});
