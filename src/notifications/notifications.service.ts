import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { INotificationsService } from "./interfaces/notifications.service.interface";
import {
  Notification,
  NotificationDocument,
} from "./entity/notification.entity";
import { User, UserDocument } from "../user/entity/user.entity";
import { Branch, BranchDocument } from "../branch/entity/branch.entity";
import { DevicesService } from "../devices/devices.service";
import { SmsService } from "./services/sms.service";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { QueryNotificationsDto } from "./dto/request/query-notifications.dto";
import { CreateNotificationDto } from "./dto/request/create-notification.dto";
import { NotificationResponseDto } from "./dto/response/notification-response.dto";
import { UnreadCountResponseDto } from "./dto/response/unread-count-response.dto";
import { TickResponseDto } from "./dto/response/tick-response.dto";
import { NotificationSeverity } from "./enums/notification-severity.enum";
import { NotificationStatus } from "./enums/notification-status.enum";
import { NotificationType } from "./enums/notification-type.enum";

@Injectable()
export class NotificationsService implements INotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
    private readonly devicesService: DevicesService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
  ) {}

  // ─── List Notifications ───────────────────────────────────────────────────────

  async list(
    currentUser: ICurrentUser,
    query: QueryNotificationsDto,
  ): Promise<NotificationResponseDto[]> {
    const userObjectId = new Types.ObjectId(currentUser.userId);
    const filter: Record<string, any> = { userId: userObjectId };

    if (query.unreadOnly) {
      filter.readAt = null;
    }

    if (query.unackedOnly) {
      filter.severity = NotificationSeverity.CRITICAL;
      filter.ackedAt = null;
    }

    const items = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(query.offset)
      .limit(query.limit)
      .lean()
      .exec();

    return items.map((item) => this.toDto(item));
  }

  // ─── Unread Count ─────────────────────────────────────────────────────────────

  async unreadCount(
    currentUser: ICurrentUser,
  ): Promise<UnreadCountResponseDto> {
    const userObjectId = new Types.ObjectId(currentUser.userId);

    const [unread, unackedCritical] = await Promise.all([
      this.notificationModel
        .countDocuments({ userId: userObjectId, readAt: null })
        .exec(),
      this.notificationModel
        .countDocuments({
          userId: userObjectId,
          severity: NotificationSeverity.CRITICAL,
          ackedAt: null,
        })
        .exec(),
    ]);

    return {
      unreadCount: unread,
      unackedCriticalCount: unackedCritical,
    };
  }

  // ─── Mark Read ────────────────────────────────────────────────────────────────

  async markRead(
    currentUser: ICurrentUser,
    id: string,
  ): Promise<NotificationResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid notification ID");
    }

    const notif = await this.notificationModel.findById(id).exec();
    if (!notif) {
      throw new NotFoundException("Notification not found");
    }

    if (notif.userId.toString() !== currentUser.userId) {
      throw new ForbiddenException("Cannot access other users' notifications");
    }

    if (!notif.readAt) {
      notif.readAt = new Date();
      await notif.save();
    }

    return this.toDto(notif);
  }

  // ─── Mark Acknowledged ────────────────────────────────────────────────────────

  async markAck(
    currentUser: ICurrentUser,
    id: string,
  ): Promise<NotificationResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid notification ID");
    }

    const notif = await this.notificationModel.findById(id).exec();
    if (!notif) {
      throw new NotFoundException("Notification not found");
    }

    if (notif.userId.toString() !== currentUser.userId) {
      throw new ForbiddenException("Cannot access other users' notifications");
    }

    const now = new Date();
    notif.ackedAt = now;
    if (!notif.readAt) {
      notif.readAt = now;
    }
    await notif.save();

    return this.toDto(notif);
  }

  // ─── Create Notification (Trigger) ───────────────────────────────────────────

  async createNotification(
    dto: CreateNotificationDto,
  ): Promise<NotificationResponseDto> {
    const notif = await this.notificationModel.create({
      userId: new Types.ObjectId(dto.userId),
      branchId: new Types.ObjectId(dto.branchId),
      type: dto.type || NotificationType.GENERAL,
      severity: dto.severity || NotificationSeverity.INFO,
      title: dto.title,
      body: dto.body,
      data: dto.data || {},
      channels: dto.channels || ["inbox", "push"],
      status: NotificationStatus.PENDING,
      attempts: 0,
    });

    return this.toDto(notif);
  }

  // ─── Process Due (Worker) ─────────────────────────────────────────────────────

  async processDue(): Promise<TickResponseDto> {
    let processedCount = 0;

    // 1. Process pending notifications with atomic claim
    while (true) {
      const lockExpiry = new Date(Date.now() + 60 * 1000);

      // findOneAndUpdate atomically claims 1 row from PENDING -> SENDING with lockedUntil
      const item = await this.notificationModel
        .findOneAndUpdate(
          {
            $or: [
              { status: NotificationStatus.PENDING },
              {
                status: NotificationStatus.SENDING,
                lockedUntil: { $lte: new Date() },
              },
            ],
          },
          {
            $set: {
              status: NotificationStatus.SENDING,
              lockedUntil: lockExpiry,
            },
            $inc: { attempts: 1 },
          },
          { new: true, sort: { createdAt: 1 } },
        )
        .exec();

      if (!item) {
        break; // No more pending/stale items to process
      }

      await this.dispatchItem(item);
      processedCount++;
    }

    // 2. Check Expo receipts for sent items with tickets
    const receiptsChecked = await this.checkExpoReceipts();

    // 3. Escalation check: unacked critical items > 5 minutes old
    const escalatedCount = await this.checkCriticalEscalation();

    return {
      processedCount,
      receiptsChecked,
      escalatedCount,
    };
  }

  // ─── Internal Dispatch Methods ───────────────────────────────────────────────

  private async dispatchItem(item: NotificationDocument): Promise<void> {
    try {
      const user = await this.userModel.findById(item.userId).lean().exec();
      const branch = await this.branchModel
        .findById(item.branchId)
        .lean()
        .exec();

      const branchTz = branch?.timezone || "Asia/Bangkok";
      const isCritical = item.severity === NotificationSeverity.CRITICAL;

      // Quiet hours check for non-critical notifications
      if (!isCritical && user?.notificationPrefs?.quietHours?.enabled) {
        const { start, end } = user.notificationPrefs.quietHours;
        const currentBranchTime = this.getCurrentTimeInTimezone(branchTz);

        if (this.isInQuietHours(currentBranchTime, start, end)) {
          // Inside quiet hours: deliver silently to inbox only, skip external audible channels
          item.status = NotificationStatus.SENT;
          item.lockedUntil = null;
          await item.save();
          return;
        }
      }

      const channels = item.channels || ["inbox", "push"];

      // Channel 1: Expo Push
      if (channels.includes("push") || channels.includes("all")) {
        const tokens = await this.devicesService.getActiveTokensForUser(
          item.userId.toString(),
        );

        if (tokens.length > 0) {
          const tickets = await this.sendExpoPush(
            tokens,
            item.title,
            item.body,
            item.data,
          );
          item.expoTickets = tickets;
        }
      }

      // Channel 2: LINE Messaging API
      if (
        (channels.includes("line") || channels.includes("all")) &&
        user?.lineUserId
      ) {
        await this.sendLinePush(user.lineUserId, item.title, item.body);
      }

      // Channel 3: SMS
      if (
        (channels.includes("sms") || channels.includes("all")) &&
        user?.phoneE164
      ) {
        await this.smsService.sendSms(
          user.phoneE164,
          `${item.title}: ${item.body}`,
        );
      }

      item.status = NotificationStatus.SENT;
      item.lockedUntil = null;
      await item.save();
    } catch (err) {
      this.logger.error(`Failed to dispatch notification ${item._id}`, err);
      if (item.attempts >= 3) {
        item.status = NotificationStatus.FAILED;
        item.lockedUntil = null;
      } else {
        // Backoff retry: release lock
        item.lockedUntil = new Date(Date.now() + 30 * 1000);
      }
      await item.save();
    }
  }

  private async sendExpoPush(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<Array<{ id: string; token: string }>> {
    const ticketsOut: Array<{ id: string; token: string }> = [];
    const messages = tokens.map((token) => ({
      to: token,
      title,
      body,
      data,
      sound: "default",
    }));

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (response.ok) {
        const result: any = await response.json();
        const dataList = result?.data || [];
        for (let i = 0; i < dataList.length; i++) {
          const res = dataList[i];
          const token = tokens[i];
          if (res?.status === "ok" && res.id) {
            ticketsOut.push({ id: res.id, token });
          } else if (
            res?.status === "error" &&
            res?.details?.error === "DeviceNotRegistered"
          ) {
            await this.devicesService.handleInvalidToken(token);
          }
        }
      }
    } catch (err) {
      this.logger.warn("Failed to send Expo push", err);
    }

    return ticketsOut;
  }

  private async sendLinePush(
    lineUserId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const accessToken =
      this.configService.get<{ lineChannelAccessToken?: string }>(
        "staffOpsConfig",
      )?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!accessToken) {
      return;
    }

    try {
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [
            {
              type: "text",
              text: `🔔 ${title}\n\n${body}`,
            },
          ],
        }),
      });
    } catch (err) {
      this.logger.warn(`Failed to send LINE push to ${lineUserId}`, err);
    }
  }

  private async checkExpoReceipts(): Promise<number> {
    const pendingReceiptItems = await this.notificationModel
      .find({
        status: NotificationStatus.SENT,
        expoReceiptsChecked: false,
        "expoTickets.0": { $exists: true },
        createdAt: { $lte: new Date(Date.now() - 15 * 1000) },
      })
      .limit(50)
      .exec();

    if (pendingReceiptItems.length === 0) return 0;

    const ticketMap = new Map<string, string>(); // ticketId -> token
    const ticketIds: string[] = [];

    for (const item of pendingReceiptItems) {
      for (const t of item.expoTickets) {
        ticketMap.set(t.id, t.token);
        ticketIds.push(t.id);
      }
    }

    if (ticketIds.length === 0) return 0;

    try {
      const response = await fetch(
        "https://exp.host/--/api/v2/push/getReceipts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ ids: ticketIds }),
        },
      );

      if (response.ok) {
        const result: any = await response.json();
        const receipts = result?.data || {};

        for (const [id, receipt] of Object.entries(receipts)) {
          const rec = receipt as any;
          if (
            rec?.status === "error" &&
            rec?.details?.error === "DeviceNotRegistered"
          ) {
            const token = ticketMap.get(id);
            if (token) {
              await this.devicesService.handleInvalidToken(token);
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn("Failed checking Expo receipts", err);
    }

    const itemIds = pendingReceiptItems.map((i) => i._id);
    await this.notificationModel
      .updateMany(
        { _id: { $in: itemIds } },
        { $set: { expoReceiptsChecked: true } },
      )
      .exec();

    return pendingReceiptItems.length;
  }

  private async checkCriticalEscalation(): Promise<number> {
    const unackedCritical = await this.notificationModel
      .find({
        severity: NotificationSeverity.CRITICAL,
        status: NotificationStatus.SENT,
        ackedAt: null,
        escalatedAt: null,
        createdAt: { $lte: new Date(Date.now() - 5 * 60 * 1000) },
      })
      .limit(20)
      .exec();

    let count = 0;
    for (const item of unackedCritical) {
      item.escalatedAt = new Date();
      await item.save();

      this.logger.warn(
        `🚨 ESCALATION: Critical notification ${item._id} unacknowledged after 5 minutes! Title: "${item.title}"`,
      );

      // Alert managers / dispatchers via SMS mock
      await this.smsService.sendSms(
        "+66810000001",
        `[ESCALATION ALERT] Unacknowledged critical notification: ${item.title}`,
      );

      count++;
    }

    return count;
  }

  private getCurrentTimeInTimezone(tz: string): string {
    try {
      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return formatter.format(new Date());
    } catch {
      return "12:00";
    }
  }

  private isInQuietHours(
    currentTime: string,
    start: string,
    end: string,
  ): boolean {
    if (start === end) return false;
    if (start < end) {
      return currentTime >= start && currentTime < end;
    }
    // Overnight window (e.g. 22:00 -> 07:00)
    return currentTime >= start || currentTime < end;
  }

  private toDto(item: any): NotificationResponseDto {
    return {
      id: item._id.toString(),
      userId: item.userId.toString(),
      branchId: item.branchId.toString(),
      type: item.type,
      severity: item.severity,
      title: item.title,
      body: item.body,
      data: item.data || {},
      status: item.status,
      readAt: item.readAt ?? null,
      ackedAt: item.ackedAt ?? null,
      escalatedAt: item.escalatedAt ?? null,
      createdAt: item.createdAt,
    };
  }
}
