import { Injectable } from "@nestjs/common";
import { IMailService } from "./interfaces/mail.service.interface";

@Injectable()
export class MailStubService implements IMailService {
  async sendVerificationEmail(
    _to: string,
    _displayName: string,
    _rawToken: string,
  ): Promise<void> {}
  async sendPasswordResetEmail(
    _to: string,
    _displayName: string,
    _rawToken: string,
  ): Promise<void> {}
  async sendPasswordChangedEmail(
    _to: string,
    _displayName: string,
  ): Promise<void> {}
  async sendWelcomeEmail(_to: string, _displayName: string): Promise<void> {}
  async sendCustomEmail(
    _to: string,
    _subject: string,
    _content: string,
  ): Promise<void> {}
}
