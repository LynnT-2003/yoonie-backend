import {
  ConflictException,
  ExecutionContext,
  UnprocessableEntityException,
} from "@nestjs/common";
import { of, throwError } from "rxjs";
import { Types } from "mongoose";
import * as crypto from "crypto";
import { IdempotencyInterceptor } from "./interceptors/idempotency.interceptor";
import { IdempotencyState } from "./enums/idempotency-state.enum";

describe("IdempotencyInterceptor", () => {
  let interceptor: IdempotencyInterceptor;
  let mockIdempotencyModel: any;

  const userId = new Types.ObjectId().toString();
  const idempotencyKey = "client-req-uuid-123";

  beforeEach(() => {
    mockIdempotencyModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue(true),
      deleteOne: jest.fn().mockResolvedValue(true),
    };

    interceptor = new IdempotencyInterceptor(mockIdempotencyModel);
  });

  const createMockContext = (headers: any, body: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          body,
          method: "POST",
          path: "/api/staff/rooms/123/transition",
          user: { userId },
        }),
      }),
    }) as any;

  it("should pass through normally if Idempotency-Key header is absent", async () => {
    const context = createMockContext({}, { toStatus: "IN_PROGRESS" });
    const nextHandler = {
      handle: jest.fn().mockReturnValue(of({ success: true })),
    };

    const observable = await interceptor.intercept(context, nextHandler);
    observable.subscribe((res) => {
      expect(res).toEqual({ success: true });
      expect(mockIdempotencyModel.create).not.toHaveBeenCalled();
    });
  });

  it("should create IN_PROGRESS record, call handler, and mark COMPLETED on success", async () => {
    const body = { toStatus: "IN_PROGRESS" };
    const context = createMockContext(
      { "idempotency-key": idempotencyKey },
      body,
    );
    const handlerResult = { roomId: "123", cleaningStatus: "IN_PROGRESS" };
    const nextHandler = {
      handle: jest.fn().mockReturnValue(of(handlerResult)),
    };

    mockIdempotencyModel.create.mockResolvedValue(true);

    const observable = await interceptor.intercept(context, nextHandler);
    observable.subscribe((res) => {
      expect(res).toEqual(handlerResult);
      expect(mockIdempotencyModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: idempotencyKey,
          state: IdempotencyState.IN_PROGRESS,
        }),
      );
      expect(mockIdempotencyModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ key: idempotencyKey }),
        expect.objectContaining({
          $set: expect.objectContaining({
            state: IdempotencyState.COMPLETED,
            response: handlerResult,
          }),
        }),
      );
    });
  });

  it("should replay stored response when same key + same body arrives", async () => {
    const body = { toStatus: "IN_PROGRESS" };
    const bodyHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const storedResponse = {
      roomId: "123",
      cleaningStatus: "IN_PROGRESS",
      isNoOp: false,
    };

    const context = createMockContext(
      { "idempotency-key": idempotencyKey },
      body,
    );
    const nextHandler = { handle: jest.fn() };

    // Duplicate key error on create
    mockIdempotencyModel.create.mockRejectedValue({ code: 11000 });
    mockIdempotencyModel.findOne.mockResolvedValue({
      key: idempotencyKey,
      bodyHash,
      state: IdempotencyState.COMPLETED,
      response: storedResponse,
    });

    const observable = await interceptor.intercept(context, nextHandler);
    observable.subscribe((res) => {
      expect(res).toEqual(storedResponse);
      expect(nextHandler.handle).not.toHaveBeenCalled(); // Handler must not be re-executed!
    });
  });

  it("should throw 422 UnprocessableEntityException when same key is used with a different body", async () => {
    const bodyA = { toStatus: "IN_PROGRESS" };
    const bodyB = { toStatus: "CLEAN" }; // Different body!
    const bodyHashA = crypto
      .createHash("sha256")
      .update(JSON.stringify(bodyA))
      .digest("hex");

    const context = createMockContext(
      { "idempotency-key": idempotencyKey },
      bodyB,
    );
    const nextHandler = { handle: jest.fn() };

    mockIdempotencyModel.create.mockRejectedValue({ code: 11000 });
    mockIdempotencyModel.findOne.mockResolvedValue({
      key: idempotencyKey,
      bodyHash: bodyHashA,
      state: IdempotencyState.COMPLETED,
    });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });

  it("should throw 409 ConflictException when a retry arrives while key is IN_PROGRESS", async () => {
    const body = { toStatus: "IN_PROGRESS" };
    const context = createMockContext(
      { "idempotency-key": idempotencyKey },
      body,
    );
    const nextHandler = { handle: jest.fn() };

    mockIdempotencyModel.create.mockRejectedValue({ code: 11000 });
    mockIdempotencyModel.findOne.mockResolvedValue({
      key: idempotencyKey,
      state: IdempotencyState.IN_PROGRESS,
    });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toThrow(
      ConflictException,
    );
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });
});
