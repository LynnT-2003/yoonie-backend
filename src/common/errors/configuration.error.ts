import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Thrown at request time when a service hits an env var that is unset or still
 * a placeholder (the boot-tolerance fixes in 98fa4e8 / a74cc5b let the app
 * boot in that state — see PrismaService and the auth/mail .get() throws).
 *
 * Extends HttpException with status 503 so Nest's filter pipeline routes it,
 * and carries the specific env var name + a setup hint so HttpExceptionFilter
 * can render structured guidance instead of a generic "Internal server error".
 *
 * 503 (Service Unavailable) is deliberate: it signals "this deployment isn't
 * finished being configured yet", which is recoverable by the operator —
 * distinct from a 500 (a genuine bug).
 */
export class ConfigurationError extends HttpException {
  /** The environment variable that is missing or still a placeholder. */
  readonly missingEnvVar: string;
  /** Human-readable instructions for fixing it. */
  readonly setupHint: string;

  /** Docs page covering env var setup for Yulio deployments. */
  static readonly DOCS_URL =
    "https://yuliolabs.com/docs?pillar=guides&id=guide-yulio-deploy#env-vars";

  constructor(missingEnvVar: string, setupHint?: string) {
    const hint =
      setupHint ??
      `${missingEnvVar} is not set. Set this environment variable in your ` +
        `Vercel project: Settings → Environment Variables. Then redeploy.`;
    // The HttpException payload here is what exception.getResponse() returns;
    // HttpExceptionFilter reads these fields off it.
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: "Backend is not fully configured",
        details: hint,
        missingEnvVar,
        docsUrl: ConfigurationError.DOCS_URL,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    this.missingEnvVar = missingEnvVar;
    this.setupHint = hint;
  }
}
