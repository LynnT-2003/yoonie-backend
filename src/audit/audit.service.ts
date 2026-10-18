import { Injectable, Logger } from "@nestjs/common";
import { AuditRepo } from "./audit.repo";
import { AuditAction } from "./enums/audit-action.enum";
import { AuditLogDocument } from "./entity/audit-log.entity";
import { ICurrentUser } from "../common/interfaces/user.interface";

export interface LogAuditEventParams {
  who: {
    userId?: string | null;
    email?: string | null;
    role?: string | null;
    isPlatformAdmin?: boolean;
  };
  action: AuditAction;
  targetType: string;
  targetId: string;
  branchId?: string | null;
  from?: any;
  to?: any;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepo: AuditRepo) {}

  async log(params: LogAuditEventParams): Promise<AuditLogDocument> {
    try {
      return await this.auditRepo.create({
        who: {
          userId: params.who.userId ?? null,
          email: params.who.email ?? null,
          role: params.who.role ?? null,
          isPlatformAdmin: params.who.isPlatformAdmin ?? false,
        },
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        branchId: params.branchId ?? null,
        from: params.from ?? null,
        to: params.to ?? null,
        metadata: params.metadata ?? {},
        when: new Date(),
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to record audit log: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  static fromCurrentUser(
    user?: ICurrentUser | null,
  ): LogAuditEventParams["who"] {
    if (!user) {
      return {
        userId: null,
        email: null,
        role: "GUEST",
        isPlatformAdmin: false,
      };
    }
    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
