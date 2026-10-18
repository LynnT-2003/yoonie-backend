import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { NotificationsService } from "./notifications.service";

@Injectable()
export class NotificationsWorker {
  private readonly logger = new Logger(NotificationsWorker.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCronTick(): Promise<void> {
    const isWorkerEnabled =
      this.configService.get<{ workerEnabled?: boolean }>("staffOpsConfig")
        ?.workerEnabled || process.env.WORKER_ENABLED === "true";

    if (!isWorkerEnabled) {
      return;
    }

    try {
      const result = await this.notificationsService.processDue();
      if (result.processedCount > 0 || result.escalatedCount > 0) {
        this.logger.log(
          `Cron tick: processed=${result.processedCount}, receipts=${result.receiptsChecked}, escalated=${result.escalatedCount}`,
        );
      }
    } catch (err) {
      this.logger.error("Error running notifications worker cron tick", err);
    }
  }
}
