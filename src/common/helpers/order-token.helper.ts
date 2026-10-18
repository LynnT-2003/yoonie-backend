import * as crypto from "crypto";

const DEFAULT_SECRET =
  process.env.AUTH_TOKEN_SECRET || "order-token-fallback-secret-key-32ch";
const TOKEN_EXPIRY_DAYS = 30;

export function generateOrderToken(
  orderId: string,
  secret = DEFAULT_SECRET,
  expiresInDays = TOKEN_EXPIRY_DAYS,
): string {
  const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
  const payload = `${orderId}.${expiresAt}`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return `${payload}.${hmac}`;
}

export function verifyOrderToken(
  token: string | undefined | null,
  orderId: string,
  secret = DEFAULT_SECRET,
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [tOrderId, expiresAtStr, hmac] = parts;
  if (tOrderId !== orderId) return false;

  const expiresAt = Number(expiresAtStr);
  if (isNaN(expiresAt) || expiresAt < Date.now()) return false;

  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(`${tOrderId}.${expiresAtStr}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "utf-8"),
      Buffer.from(expectedHmac, "utf-8"),
    );
  } catch {
    return false;
  }
}
