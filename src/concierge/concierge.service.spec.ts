import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { ConciergeService } from "./concierge.service";
import { ConciergeKeyGuard } from "./concierge-key.guard";
import { GuestRequestCategory } from "./dto/concierge.dto";

const q = (value: unknown) => {
  const chain: any = {
    select: () => chain,
    lean: () => chain,
    exec: () => Promise.resolve(value),
  };
  return chain;
};

describe("AI concierge", () => {
  describe("ConciergeKeyGuard", () => {
    const ctx = (key?: string): any => ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: key ? { "x-concierge-key": key } : {} }),
      }),
    });
    const guard = (expected?: string) =>
      new ConciergeKeyGuard({ get: () => expected } as any);

    it("is closed when no key is configured", () => {
      const saved = process.env.CONCIERGE_API_KEY;
      delete process.env.CONCIERGE_API_KEY;
      expect(() => guard(undefined).canActivate(ctx("x"))).toThrow(
        ServiceUnavailableException,
      );
      process.env.CONCIERGE_API_KEY = saved;
    });

    it("refuses a missing or wrong key and accepts the right one", () => {
      expect(() => guard("secret").canActivate(ctx())).toThrow(
        UnauthorizedException,
      );
      expect(() => guard("secret").canActivate(ctx("nope"))).toThrow(
        UnauthorizedException,
      );
      expect(guard("secret").canActivate(ctx("secret"))).toBe(true);
    });
  });

  describe("ConciergeService", () => {
    const branchId = new Types.ObjectId();
    const deskId = new Types.ObjectId();
    const housekeeperId = new Types.ObjectId();
    const order = {
      _id: new Types.ObjectId(),
      branchId,
      orderNumber: "TS-261025-A0EAA",
      status: "CONFIRMED",
      guestSnapshot: {
        fullName: "Hiroshi Tanaka",
        email: "hiroshi@example.com",
        phoneE164: "+66812345678",
      },
      items: [
        {
          kind: "STAY",
          status: "CONFIRMED",
          stay: { roomType: "DELUXE_BALCONY", assignedRoomNumber: "305" },
        },
      ],
    };

    let notifications: { createNotification: jest.Mock };
    let service: ConciergeService;

    beforeEach(() => {
      notifications = { createNotification: jest.fn().mockResolvedValue({}) };
      service = new ConciergeService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { findOne: () => q(order) } as any,
        {
          find: (filter: any) =>
            q(filter.jobTitle ? [{ _id: housekeeperId }] : [{ _id: deskId }]),
        } as any,
        {} as any,
        notifications as any,
      );
    });

    const own = (contact: string) =>
      (service as any).ownedOrder({ orderNumber: "ts-261025-a0eaa", contact });

    it("accepts the booking's email or phone in any format", async () => {
      await expect(own("Hiroshi@Example.com")).resolves.toBe(order);
      await expect(own("081-234-5678")).resolves.toBe(order);
      await expect(own("+66 81 234 5678")).resolves.toBe(order);
    });

    it("gives the same not-found answer for a wrong contact", async () => {
      await expect(own("someone@else.com")).rejects.toThrow(NotFoundException);
      await expect(own("0899999999")).rejects.toThrow(NotFoundException);
    });

    it("sends in-room requests to the desk and housekeeping, with the room number", async () => {
      const res = await service.request({
        orderNumber: "TS-261025-A0EAA",
        contact: "hiroshi@example.com",
        category: GuestRequestCategory.AMENITY,
        details: "Two extra towels please",
      });
      expect(res).toMatchObject({
        received: true,
        forwardedTo: "front desk and housekeeping",
      });
      const calls = notifications.createNotification.mock.calls.map(([n]) => n);
      expect(calls.map((n) => n.userId).sort()).toEqual(
        [String(deskId), String(housekeeperId)].sort(),
      );
      expect(calls[0].title).toBe("Guest request · Room 305: amenity");
    });

    it("sends other requests to the desk only", async () => {
      await service.request({
        orderNumber: "TS-261025-A0EAA",
        contact: "hiroshi@example.com",
        category: GuestRequestCategory.TRANSPORT,
        details: "Taxi to the airport at 6am",
      });
      expect(notifications.createNotification).toHaveBeenCalledTimes(1);
      expect(notifications.createNotification.mock.calls[0][0].userId).toBe(
        String(deskId),
      );
    });
  });
});
