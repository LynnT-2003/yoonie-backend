import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { Request, Response } from "express";

/** One string for clients: ValidationPipe sends `message: string[]`; we join. */
function normalizeErrorMessage(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) return raw;
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => String(x)).filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return fallback;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const rawMessage =
      typeof exceptionResponse === "string"
        ? exceptionResponse
        : (exceptionResponse as { message?: unknown }).message;

    const message = normalizeErrorMessage(rawMessage, "An error occurred");

    const body: Record<string, unknown> = {
      success: false,
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    // ConfigurationError (and any HttpException whose payload carries these)
    // surfaces structured env-var setup guidance. We merge the extra fields
    // into the standard envelope rather than emitting a separate shape, so
    // every error response stays consistent for clients.
    if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
      const payload = exceptionResponse as Record<string, unknown>;
      for (const key of ["details", "missingEnvVar", "docsUrl"] as const) {
        if (payload[key] !== undefined) {
          body[key] = payload[key];
        }
      }
    }

    response.status(status).json(body);
  }
}
