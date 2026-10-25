import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";

/**
 * The AI concierge (n8n) is the only caller of /concierge: it sends the shared key in
 * x-concierge-key. Guests never hold this key; they reach these routes only through the concierge.
 */
@Injectable()
export class ConciergeKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected =
      this.configService.get<string>("CONCIERGE_API_KEY") ??
      process.env.CONCIERGE_API_KEY ??
      "";
    if (!expected) {
      throw new ServiceUnavailableException("Concierge is not configured");
    }
    const sent = context.switchToHttp().getRequest().headers[
      "x-concierge-key"
    ] as unknown;
    const a = Buffer.from(typeof sent === "string" ? sent : "");
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid concierge key");
    }
    return true;
  }
}
