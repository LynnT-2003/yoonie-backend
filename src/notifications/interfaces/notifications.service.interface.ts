import { ICurrentUser } from "../../common/interfaces/user.interface";
import { QueryNotificationsDto } from "../dto/request/query-notifications.dto";
import { CreateNotificationDto } from "../dto/request/create-notification.dto";
import { NotificationResponseDto } from "../dto/response/notification-response.dto";
import { UnreadCountResponseDto } from "../dto/response/unread-count-response.dto";
import { TickResponseDto } from "../dto/response/tick-response.dto";

export interface INotificationsService {
  list(
    currentUser: ICurrentUser,
    query: QueryNotificationsDto,
  ): Promise<NotificationResponseDto[]>;
  unreadCount(currentUser: ICurrentUser): Promise<UnreadCountResponseDto>;
  markRead(
    currentUser: ICurrentUser,
    id: string,
  ): Promise<NotificationResponseDto>;
  markAck(
    currentUser: ICurrentUser,
    id: string,
  ): Promise<NotificationResponseDto>;
  createNotification(
    dto: CreateNotificationDto,
  ): Promise<NotificationResponseDto>;
  processDue(): Promise<TickResponseDto>;
}
