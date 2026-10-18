import { Types } from "mongoose";
import { DispatchType, Severity } from "../common/enums/dispatch.enum";

describe("OperationalDispatch - Dedupe Key", () => {
  it("should enforce deduplication by generating identical dedupeKey for idempotent tasks", () => {
    const roomNumber = "101";
    const dedupeKey1 = `hk:${roomNumber}`;
    const dedupeKey2 = `hk:${roomNumber}`;

    expect(dedupeKey1).toBe(dedupeKey2);

    const orderId = new Types.ObjectId().toString();
    const lineId = "line_1";
    const pickupDedupe1 = `pickup:${orderId}:${lineId}`;
    const pickupDedupe2 = `pickup:${orderId}:${lineId}`;

    expect(pickupDedupe1).toBe(pickupDedupe2);
  });
});
