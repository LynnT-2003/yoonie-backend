import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { IMailService } from "./interfaces/mail.service.interface";
import { verificationEmailContent } from "./templates/verification.template";
import { passwordResetEmailContent } from "./templates/password-reset.template";
import { passwordChangedEmailContent } from "./templates/password-changed.template";
import { welcomeEmailContent } from "./templates/welcome.template";
import { baseEmailTemplate } from "./templates/base.template";
import { ConfigurationError } from "../common/errors/configuration.error";

@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly companyName: string;
  private readonly logoUrl: string;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>("MAIL_HOST") ?? "",
      port: this.configService.get<number>("MAIL_PORT") ?? 587,
      secure: false, // true for 465, false for 587
      auth: {
        user: this.configService.get<string>("MAIL_USER") ?? "",
        pass: this.configService.get<string>("MAIL_PASSWORD") ?? "",
      },
    });
    this.companyName =
      this.configService.get<string>("COMPANY_NAME") ?? "Your Company";
    // Prefer COMPANY_LOGO_URL (new), fallback to LOGO_URL (legacy)
    this.logoUrl =
      this.configService.get<string>("COMPANY_LOGO_URL") ??
      this.configService.get<string>("LOGO_URL") ??
      "";
    this.from =
      this.configService.get<string>("MAIL_FROM") ??
      `${this.companyName} <noreply@example.com>`;
  }

  // ─── Base send ────────────────────────────────────────────────────────────────

  private async send(
    to: string,
    subject: string,
    content: string,
  ): Promise<void> {
    const html = baseEmailTemplate({
      companyName: this.companyName,
      logoUrl: this.logoUrl,
      content,
    });

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent → ${to} [${subject}]`);
    } catch (error) {
      this.logger.error(`Failed to send email → ${to} [${subject}]`, error);
      throw error;
    }
  }

  // ─── Verification ─────────────────────────────────────────────────────────────

  async sendVerificationEmail(
    to: string,
    displayName: string,
    rawToken: string,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>("BASE_URL");
    if (!baseUrl) {
      throw new ConfigurationError("BASE_URL");
    }
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${rawToken}`;
    const content = verificationEmailContent(displayName, verifyUrl);
    await this.send(to, "Verify your email address", content);
  }

  // ─── Password Reset ───────────────────────────────────────────────────────────

  async sendPasswordResetEmail(
    to: string,
    displayName: string,
    rawToken: string,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>("BASE_URL");
    if (!baseUrl) {
      throw new ConfigurationError("BASE_URL");
    }
    const resetBase =
      this.configService.get<string>("PASSWORD_RESET_URL") ??
      `${baseUrl}/reset-password`;
    const resetUrl = `${resetBase}${resetBase.includes("?") ? "&" : "?"}token=${rawToken}`;
    const content = passwordResetEmailContent(displayName, resetUrl);
    await this.send(to, "Reset your password", content);
  }

  // ─── Password Changed ─────────────────────────────────────────────────────────

  async sendPasswordChangedEmail(
    to: string,
    displayName: string,
  ): Promise<void> {
    const content = passwordChangedEmailContent(displayName);
    await this.send(to, "Your password has been changed", content);
  }

  // ─── Welcome ──────────────────────────────────────────────────────────────────

  async sendWelcomeEmail(to: string, displayName: string): Promise<void> {
    const content = welcomeEmailContent(displayName);
    await this.send(to, `Welcome to ${this.companyName}`, content);
  }

  // ─── Custom ───────────────────────────────────────────────────────────────────
  // Pass raw HTML content — will be wrapped in the base template automatically

  async sendCustomEmail(
    to: string,
    subject: string,
    content: string,
  ): Promise<void> {
    await this.send(to, subject, content);
  }
}
