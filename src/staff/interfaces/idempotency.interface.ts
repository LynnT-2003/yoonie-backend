import { Types } from "mongoose";
import { IdempotencyState } from "../enums/idempotency-state.enum";

export interface IIdempotencyKey {
  _id: string;
  userId: string | Types.ObjectId;
  key: string;
  methodPath: string;
  bodyHash: string;
  state: IdempotencyState;
  response?: any;
  createdAt: Date;
  updatedAt?: Date;
}
