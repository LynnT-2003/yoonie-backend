import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection, ConnectionStates } from "mongoose";

// Matches the placeholder MONGODB_URI shipped by yulio.manifest.json's db-mongoose
// module. Anchored to "user:password@cluster.mongodb.net" so a real Atlas URL
// with different credentials is NOT classified as a placeholder.
const PLACEHOLDER_MONGODB_URI =
  /^mongodb\+srv:\/\/user:password@cluster\.mongodb\.net/;

function isPlaceholderOrUnset(url: string | undefined): boolean {
  if (!url) return true;
  return PLACEHOLDER_MONGODB_URI.test(url);
}

/**
 * Logs MongoDB connection lifecycle events on app boot.
 * Mirrors the parity provided by db-postgres's PrismaService boot logging.
 *
 * Boot UX: when MONGODB_URI is unset or a placeholder, the user hasn't
 * configured their DB yet — emit a friendly one-liner explaining what to do.
 * When the URL is real but unreachable, emit a different actionable warning.
 * Never spam the stack trace at boot; route the underlying error through
 * Logger.debug for operators who need to debug.
 *
 * Event ordering note: mongoose fires `disconnected` before `error` when an
 * initial connect fails. To avoid an out-of-order "MongoDB disconnected" warn
 * before our friendly explanation, we inspect MONGODB_URI synchronously inside
 * onModuleInit and prime the boot-warning state BEFORE registering handlers.
 */
@Injectable()
export class MongoConnectionLogger implements OnModuleInit {
  private readonly logger = new Logger(MongoConnectionLogger.name);
  private hasEverConnected = false;
  private hasLoggedBootWarning = false;

  constructor(
    @InjectConnection()
    private readonly dbConnection: Connection,
  ) {}

  /**
   * The driver never retries a first connect that failed (an established
   * connection reconnects by itself). Keep trying until it succeeds, so a
   * blip at boot doesn't leave every query buffering until it times out.
   */
  private retryFirstConnect() {
    const uri = process.env.MONGODB_URI;
    if (this.hasEverConnected || isPlaceholderOrUnset(uri)) return;
    setTimeout(() => {
      if (
        this.hasEverConnected ||
        this.dbConnection.readyState === ConnectionStates.connected
      )
        return;
      this.dbConnection.openUri(uri!).catch(() => {
        // the 'error' handler schedules the next attempt
      });
    }, 2000).unref();
  }

  onModuleInit() {
    this.dbConnection.on("connected", () => {
      this.hasEverConnected = true;
      this.logger.log(
        `MongoDB connected: ${this.dbConnection.name} (host: ${this.dbConnection.host})`,
      );

      const collections = this.dbConnection.collections;
      const names = Object.keys(collections);
      if (names.length > 0) {
        this.logger.log(`Collections found: ${names.join(", ")}`);
      } else {
        this.logger.warn("No collections found in this database yet.");
      }
    });

    this.dbConnection.on("error", (err: Error) => {
      // Only emit the friendly boot warning once per process. Mongoose may
      // retry connection in the background and re-fire 'error' repeatedly;
      // we don't want to spam the operator's terminal.
      if (this.hasLoggedBootWarning) return;
      this.hasLoggedBootWarning = true;
      if (isPlaceholderOrUnset(process.env.MONGODB_URI)) {
        this.logger.warn(
          "MONGODB_URI not yet configured — set it in .env to connect to your database. " +
            "App will boot without a DB connection.",
        );
      } else {
        this.logger.warn(
          "Could not connect to MongoDB at boot. " +
            "Verify MONGODB_URI is correct. " +
            "App will continue; mongoose will retry in background.",
        );
      }
      // Operator hint at debug level. Use err.name + (err as any).code rather
      // than the full message — the message tends to contain raw DNS / network
      // strings that read as scary (e.g. "querySrv ENOTFOUND ..."). Operators
      // who need the full stack can flip the connection adapter's log level.
      const code = (err as { code?: string }).code ?? "unknown";
      this.logger.debug?.(`Mongo connect rejected — ${err.name} (${code})`);
      this.retryFirstConnect();
    });

    this.dbConnection.on("disconnected", () => {
      // Suppress disconnect noise that fires *before* a real connection was
      // ever established (initial-boot-fail path: mongoose fires
      // 'disconnected' before 'error' in lazy mode). A genuine disconnect of
      // a previously-established connection IS noteworthy and gets logged.
      if (!this.hasEverConnected) return;
      this.logger.warn("MongoDB disconnected");
    });
  }
}
