import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Observable, of } from "rxjs";
import { tap } from "rxjs/operators";
import * as crypto from "crypto";
import {
  IdempotencyKey,
  IdempotencyKeyDocument,
} from "../entity/idempotency-key.entity";
import { IdempotencyState } from "../enums/idempotency-state.enum";
import { ICurrentUser } from "../../common/interfaces/user.interface";

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectModel(IdempotencyKey.name)
    private readonly idempotencyModel: Model<IdempotencyKeyDocument>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const rawKey =
      req.headers["idempotency-key"] || req.headers["x-idempotency-key"];

    if (!rawKey || typeof rawKey !== "string") {
      return next.handle();
    }

    const key = rawKey.trim();
    if (!key) {
      return next.handle();
    }

    const user = req.user as ICurrentUser | undefined;
    if (!user || !user.userId) {
      return next.handle();
    }

    const userObjectId = new Types.ObjectId(user.userId);
    const methodPath = `${req.method}:${req.baseUrl || ""}${req.path}`;
    const bodyHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body ?? {}))
      .digest("hex");

    try {
      await this.idempotencyModel.create({
        userId: userObjectId,
        key,
        methodPath,
        bodyHash,
        state: IdempotencyState.IN_PROGRESS,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        const existing = await this.idempotencyModel.findOne({
          userId: userObjectId,
          key,
        });

        if (existing) {
          if (existing.state === IdempotencyState.IN_PROGRESS) {
            throw new ConflictException(
              "A request with this Idempotency-Key is currently in progress",
            );
          }

          if (existing.bodyHash !== bodyHash) {
            throw new UnprocessableEntityException(
              "Idempotency-Key already used with a different request payload",
            );
          }

          return of(existing.response);
        }
      }
      throw err;
    }

    return next.handle().pipe(
      tap({
        next: async (result) => {
          try {
            await this.idempotencyModel.updateOne(
              { userId: userObjectId, key },
              {
                $set: {
                  state: IdempotencyState.COMPLETED,
                  response: result,
                  updatedAt: new Date(),
                },
              },
            );
          } catch {
            // Non-critical persistence failure for cached response
          }
        },
        error: async () => {
          try {
            await this.idempotencyModel.deleteOne({
              userId: userObjectId,
              key,
              state: IdempotencyState.IN_PROGRESS,
            });
          } catch {
            // Ignore rollback cleanup failure
          }
        },
      }),
    );
  }
}
