export interface ISmsService {
  sendSms(toPhoneE164: string, message: string): Promise<boolean>;
}
