import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ClientSession, Model, Types } from "mongoose";
import {
  InventorySlot,
  InventorySlotDocument,
} from "./entity/inventory-slot.entity";
import {
  InventoryHold,
  InventoryHoldDocument,
} from "./entity/inventory-hold.entity";
import { HoldStatus, SlotStatus } from "../common/enums/inventory.enum";

@Injectable()
export class InventoryRepo {
  constructor(
    @InjectModel(InventorySlot.name)
    private readonly slotModel: Model<InventorySlotDocument>,
    @InjectModel(InventoryHold.name)
    private readonly holdModel: Model<InventoryHoldDocument>,
  ) {}

  async findSlotByKey(
    slotKey: string,
    session?: ClientSession,
  ): Promise<InventorySlotDocument | null> {
    return this.slotModel.findOne({ slotKey }, null, { session }).exec();
  }

  async findSlotsForAvailability(
    branchId: Types.ObjectId,
    kind: string,
    resourceKey: string,
    startDate: string,
    endDate: string,
  ): Promise<Pick<InventorySlot, "capacity" | "held" | "booked">[]> {
    return this.slotModel
      .find({
        branchId,
        kind,
        resourceKey,
        businessDate: { $gte: startDate, $lt: endDate },
        status: SlotStatus.OPEN,
      })
      .select("capacity held booked")
      .lean();
  }

  async incrementHold(
    slotKey: string,
    qty: number,
    session?: ClientSession,
  ): Promise<number> {
    const res = await this.slotModel.updateOne(
      {
        slotKey,
        status: SlotStatus.OPEN,
        $expr: { $lte: [{ $add: ["$held", "$booked", qty] }, "$capacity"] },
      },
      { $inc: { held: qty } },
      { ...(session ? { session } : {}) },
    );
    return res.modifiedCount;
  }

  async decrementHold(
    slotKey: string,
    qty: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.slotModel.updateOne(
      { slotKey, held: { $gte: qty } },
      { $inc: { held: -qty } },
      { ...(session ? { session } : {}) },
    );
  }

  async convertHoldToBooked(
    slotKey: string,
    qty: number,
    session?: ClientSession,
  ): Promise<number> {
    const res = await this.slotModel.updateOne(
      { slotKey, held: { $gte: qty } },
      { $inc: { held: -qty, booked: qty } },
      { ...(session ? { session } : {}) },
    );
    return res.modifiedCount;
  }

  /** Books capacity directly (no hold), used when staff move an existing booking to another slot. */
  async incrementBooked(slotKey: string, qty: number): Promise<number> {
    const res = await this.slotModel.updateOne(
      {
        slotKey,
        status: SlotStatus.OPEN,
        $expr: { $lte: [{ $add: ["$held", "$booked", qty] }, "$capacity"] },
      },
      { $inc: { booked: qty } },
    );
    return res.modifiedCount;
  }

  async returnBooked(
    slotKey: string,
    qty: number,
    session?: ClientSession,
  ): Promise<number> {
    const res = await this.slotModel.updateOne(
      { slotKey, booked: { $gte: qty } },
      { $inc: { booked: -qty } },
      { ...(session ? { session } : {}) },
    );
    return res.modifiedCount;
  }

  async createHold(
    data: Partial<InventoryHold>,
    session?: ClientSession,
  ): Promise<InventoryHoldDocument> {
    const [hold] = await this.holdModel.create([data], {
      ...(session ? { session } : {}),
    });
    return hold;
  }

  async findHoldById(
    id: Types.ObjectId,
    session?: ClientSession,
  ): Promise<InventoryHoldDocument | null> {
    return this.holdModel.findById(id, null, { session }).exec();
  }

  async claimHoldForConfirmation(
    holdId: Types.ObjectId,
    orderId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<InventoryHoldDocument | null> {
    return this.holdModel.findOneAndUpdate(
      {
        _id: holdId,
        status: HoldStatus.ACTIVE,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: HoldStatus.CONVERTED,
          orderId,
          purgeAt: new Date(Date.now() + 7 * 864e5),
        },
      },
      { ...(session ? { session } : {}), new: false },
    );
  }

  async releaseHold(
    holdId: Types.ObjectId,
    as: HoldStatus.RELEASED | HoldStatus.EXPIRED = HoldStatus.RELEASED,
    session?: ClientSession,
  ): Promise<InventoryHoldDocument | null> {
    return this.holdModel.findOneAndUpdate(
      { _id: holdId, status: HoldStatus.ACTIVE },
      { $set: { status: as, purgeAt: new Date(Date.now() + 864e5) } },
      { ...(session ? { session } : {}), new: false },
    );
  }

  async findExpiredHolds(batch = 200): Promise<{ _id: Types.ObjectId }[]> {
    return this.holdModel
      .find(
        { status: HoldStatus.ACTIVE, expiresAt: { $lte: new Date() } },
        { _id: 1 },
      )
      .limit(batch)
      .lean();
  }
}
