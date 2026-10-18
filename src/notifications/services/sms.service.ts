import { Injectable, Logger } from "@nestjs/common";
import { ISmsService } from "../interfaces/sms.service.interface";

@Injectable()
export class SmsService implements ISmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendSms(toPhoneE164: string, message: string): Promise<boolean> {
    this.logger.log(
      `[SMS DISPATCH MOCK] To: ${toPhoneE164} | Message: "${message}"`,
    );
    return true;
  }
}
