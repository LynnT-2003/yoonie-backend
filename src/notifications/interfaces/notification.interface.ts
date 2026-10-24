import { Types } from "mongoose";
import { NotificationSeverity } from "../enums/notification-severity.enum";
import { NotificationStatus } from "../enums/notification-status.enum";
import { NotificationType } from "../enums/notification-type.enum";

export interface INotification {
  _id: string;
  userId: string | Types.ObjectId;
  branchId: string | Types.ObjectId;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  data: Record<string, any>;
  channels: string[];
  status: NotificationStatus;
  lockedUntil?: Date | null;
  attempts: number;
  readAt?: Date | null;
  ackedAt?: Date | null;
  escalatedAt?: Date | null;
  expoTickets: Array<{ id: string; token: string }>;
  expoReceiptsChecked: boolean;
  createdAt: Date;
  updatedAt: Date;
}
