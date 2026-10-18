import { ICurrentUser } from "../../common/interfaces/user.interface";
import { RoomTransitionDto } from "../dto/request/room-transition.dto";
import { StaffTasksResponseDto } from "../dto/response/staff-task.dto";
import { RoomTransitionResponseDto } from "../dto/response/room-transition-response.dto";
import { PickupTaskResponseDto } from "../dto/response/pickup-task-response.dto";
import { LineLinkTokenResponseDto } from "../dto/response/line-link-token-response.dto";

export interface IStaffService {
  getTasks(currentUser: ICurrentUser): Promise<StaffTasksResponseDto>;
  transitionRoom(
    currentUser: ICurrentUser,
    roomId: string,
    dto: RoomTransitionDto,
  ): Promise<RoomTransitionResponseDto>;
  startPickup(
    currentUser: ICurrentUser,
    dispatchId: string,
  ): Promise<PickupTaskResponseDto>;
  donePickup(
    currentUser: ICurrentUser,
    dispatchId: string,
  ): Promise<PickupTaskResponseDto>;
  createLineLinkToken(
    currentUser: ICurrentUser,
  ): Promise<LineLinkTokenResponseDto>;
  handleLineWebhook(
    signature: string,
    rawBody: Buffer | string,
    body: any,
  ): Promise<{ status: string }>;
}
