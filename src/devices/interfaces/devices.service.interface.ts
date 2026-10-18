import { ICurrentUser } from "../../common/interfaces/user.interface";
import { RegisterDeviceDto } from "../dto/request/register-device.dto";
import { DeviceResponseDto } from "../dto/response/device-response.dto";

export interface IDevicesService {
  register(
    currentUser: ICurrentUser,
    dto: RegisterDeviceDto,
  ): Promise<DeviceResponseDto>;
  unregister(currentUser: ICurrentUser, idOrToken: string): Promise<void>;
  getActiveTokensForUser(userId: string): Promise<string[]>;
  handleInvalidToken(token: string): Promise<void>;
}
