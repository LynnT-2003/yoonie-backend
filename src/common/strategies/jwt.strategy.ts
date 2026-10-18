import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { UserService } from "../../user/user.service";
import { IJwtPayload } from "../interfaces/auth.interface";
import { ICurrentUser } from "../interfaces/user.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    // Use a placeholder if JWT_ACCESS_SECRET is unset — getOrThrow would crash
    // here during DI construction (before any onModuleInit), defeating boot
    // tolerance. The placeholder won't validate any real token, so JWT auth
    // fails at request time with a 401 until the env var is set.
    const accessSecret =
      configService.get<string>("JWT_ACCESS_SECRET") ||
      "BOOT_PLACEHOLDER_JWT_ACCESS_SECRET";
    if (accessSecret === "BOOT_PLACEHOLDER_JWT_ACCESS_SECRET") {
      new Logger(JwtStrategy.name).warn(
        "JWT_ACCESS_SECRET not configured — using a placeholder. " +
          "JWT authentication will reject all tokens until you set it in your environment variables.",
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: accessSecret,
    });
  }

  // Passport calls this after verifying the token signature and expiry.
  // The return value is attached to req.user and picked up by @CurrentUser().
  async validate(payload: IJwtPayload): Promise<ICurrentUser> {
    const user = await this.userService.findById(payload.sub);

    if (!user || user.isSuspended) {
      throw new UnauthorizedException("User no longer exists or is suspended");
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: user.role,
      isSuspended: user.isSuspended || false,
      branchIds: (user.branchIds || []).map((id) => id.toString()),
      permissions: user.permissions || [],
      isPlatformAdmin: user.isPlatformAdmin || false,
    };
  }
}
