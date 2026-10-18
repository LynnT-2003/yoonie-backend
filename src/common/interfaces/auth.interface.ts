import { UserRole } from "../enums/user-role.enum";
import { IUserPublic } from "./user.interface";

// ─── JWT Payload ───────────────────────────────────────────────────────────────

// What gets signed into the JWT.
// Keep this minimal — it lives in every request header.
export interface IJwtPayload {
  sub: string; // userId (string — Mongo ObjectId or Postgres UUID)
  email: string | null;
  role: UserRole;
  jti?: string; // unique token id — prevents duplicate JWTs issued in the same second
  iat?: number; // issued at — added automatically by jsonwebtoken
  exp?: number; // expiry — added automatically by jsonwebtoken
}

// ─── Token Pair ────────────────────────────────────────────────────────────────

// Returned whenever tokens are issued (login, register, refresh, OAuth callback).
export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ─── Auth Response ─────────────────────────────────────────────────────────────

// The full response body sent to the client on successful auth.
// Combines the safe user shape with the token pair.
export interface IAuthResponse {
  user: IUserPublic;
  tokens: IAuthTokens;
}
