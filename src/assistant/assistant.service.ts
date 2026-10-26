import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssistantContextDto } from "./dto/assistant.dto";

const TIMEOUT_MS = 60_000;

/**
 * Talks to the two n8n assistants for the web. The browser never calls n8n:
 * the guest concierge gets the guest's message; the staff assistant gets the
 * caller's own Authorization header, so n8n acts with exactly their permissions.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(private readonly configService: ConfigService) {}

  private url(name: "N8N_GUEST_CHAT_URL" | "N8N_STAFF_WEBHOOK_URL") {
    const url = this.configService.get<string>(name) ?? process.env[name];
    if (!url) throw new ServiceUnavailableException("Yoonie isn't set up yet");
    return url;
  }

  private async post(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; data: Record<string, unknown> }> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      return { status: res.status, data };
    } catch (err) {
      this.logger.warn(`n8n unreachable: ${String(err)}`);
      throw new BadGatewayException("Yoonie is unavailable right now");
    }
  }

  async askGuest(sessionId: string, message: string) {
    const { status, data } = await this.post(this.url("N8N_GUEST_CHAT_URL"), {
      action: "sendMessage",
      sessionId: `web:${sessionId}`,
      chatInput: message,
    });
    const reply = data.output ?? data.text;
    if (status >= 400 || typeof reply !== "string") {
      this.logger.warn(`guest assistant answered ${status}`);
      throw new BadGatewayException("Yoonie is unavailable right now");
    }
    return { reply };
  }

  async askStaff(
    authorization: string,
    sessionId: string,
    message: string,
    context?: AssistantContextDto,
  ) {
    const { status, data } = await this.post(
      this.url("N8N_STAFF_WEBHOOK_URL"),
      { message, sessionId, context: context ?? { page: "other" } },
      { authorization },
    );
    if (status === 401) {
      throw new UnauthorizedException("Please sign in to Yoonie again");
    }
    if (status >= 400 || typeof data.reply !== "string") {
      this.logger.warn(`staff assistant answered ${status}`);
      throw new BadGatewayException("Yoonie is unavailable right now");
    }
    return { reply: data.reply };
  }
}
