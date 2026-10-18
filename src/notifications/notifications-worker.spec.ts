import { Types } from "mongoose";
import { NotificationsService } from "./notifications.service";
import { NotificationSeverity } from "./enums/notification-severity.enum";
import { NotificationStatus } from "./enums/notification-status.enum";

describe("NotificationsService - Worker, Concurrency & Escalation", () => {
  let service: NotificationsService;
  let mockNotificationModel: any;
  let mockUserModel: any;
  let mockBranchModel: any;
  let mockDevicesService: any;
  let mockSmsService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockNotificationModel = {
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      updateMany: jest.fn(),
    };
    mockUserModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            notificationPrefs: { quietHours: { enabled: false } },
          }),
        }),
      }),
    };
    mockBranchModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            timezone: "Asia/Bangkok",
          }),
        }),
      }),
    };
    mockDevicesService = {
      getActiveTokensForUser: jest.fn().mockResolvedValue([]),
      handleInvalidToken: jest.fn(),
    };
    mockSmsService = {
      sendSms: jest.fn().mockResolvedValue(true),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue({}),
    };

    service = new NotificationsService(
      mockNotificationModel,
      mockUserModel,
      mockBranchModel,
      mockDevicesService,
      mockSmsService,
      mockConfigService,
    );
  });

  it("should prevent double-send under concurrency using atomic findOneAndUpdate claiming", async () => {
    const notifId = new Types.ObjectId();
    const mockPendingDoc = {
      _id: notifId,
      userId: new Types.ObjectId(),
      branchId: new Types.ObjectId(),
      status: NotificationStatus.SENDING,
      lockedUntil: new Date() as Date | null,
      attempts: 1,
      channels: ["inbox"],
      severity: NotificationSeverity.INFO,
      save: jest.fn().mockResolvedValue(true),
    };

    // Worker 1 atomically claims the pending notification
    // Worker 2 runs simultaneously and finds nothing (returns null)
    mockNotificationModel.findOneAndUpdate
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(mockPendingDoc),
      })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

    mockNotificationModel.find.mockReturnValue({
      limit: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });

    const result = await service.processDue();

    expect(result.processedCount).toBe(1);
    expect(mockPendingDoc.status).toBe(NotificationStatus.SENT);
    expect(mockPendingDoc.lockedUntil).toBeNull();
  });

  it("should escalate critical notifications that remain unacknowledged after 5 minutes", async () => {
    // No pending notifications to claim
    mockNotificationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    const oldDate = new Date(Date.now() - 6 * 60 * 1000);
    const mockUnackedDoc = {
      _id: new Types.ObjectId(),
      severity: NotificationSeverity.CRITICAL,
      status: NotificationStatus.SENT,
      title: "Guest medical emergency in Room 204",
      ackedAt: null,
      escalatedAt: null,
      createdAt: oldDate,
      save: jest.fn().mockResolvedValue(true),
    };

    // Receipts check returns empty
    // Escalation check returns the unacknowledged critical doc
    mockNotificationModel.find
      .mockReturnValueOnce({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      })
      .mockReturnValueOnce({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockUnackedDoc]),
        }),
      });

    const result = await service.processDue();

    expect(result.escalatedCount).toBe(1);
    expect(mockUnackedDoc.escalatedAt).toBeInstanceOf(Date);
    expect(mockSmsService.sendSms).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("ESCALATION ALERT"),
    );
  });

  it("should bypass quiet hours for critical notifications", async () => {
    const criticalDoc = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      branchId: new Types.ObjectId(),
      severity: NotificationSeverity.CRITICAL,
      title: "FIRE ALARM IN BUILDING 1",
      body: "Immediate evacuation requested",
      channels: ["push"],
      status: NotificationStatus.SENDING,
      attempts: 1,
      save: jest.fn().mockResolvedValue(true),
    };

    mockNotificationModel.findOneAndUpdate
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(criticalDoc),
      })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

    mockUserModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          notificationPrefs: {
            quietHours: { enabled: true, start: "00:00", end: "23:59" }, // User in quiet hours
          },
        }),
      }),
    });
    mockBranchModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ timezone: "Asia/Bangkok" }),
      }),
    });
    mockNotificationModel.find.mockReturnValue({
      limit: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });

    mockDevicesService.getActiveTokensForUser.mockResolvedValue([
      "ExponentPushToken[abc]",
    ]);

    // Global fetch mock for Expo push
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue({ data: [{ status: "ok", id: "t-1" }] }),
    }) as any;

    const result = await service.processDue();

    expect(result.processedCount).toBe(1);
    expect(mockDevicesService.getActiveTokensForUser).toHaveBeenCalled();
    expect(criticalDoc.status).toBe(NotificationStatus.SENT);
  });
});
