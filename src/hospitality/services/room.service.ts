import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Room, RoomDocument } from "../schemas/room.schema";
import { CleaningStatus } from "../common/hospitality.enums";

@Injectable()
export class RoomService {
  constructor(
    @InjectModel(Room.name)
    private readonly roomModel: Model<RoomDocument>,
  ) {}

  async findAllByBranch(
    branchId: string | Types.ObjectId,
  ): Promise<RoomDocument[]> {
    return this.roomModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .sort({ roomNumber: 1 })
      .exec();
  }

  async findByRoomNumber(
    branchId: string | Types.ObjectId,
    roomNumber: string,
  ): Promise<RoomDocument> {
    const room = await this.roomModel
      .findOne({ branchId: new Types.ObjectId(branchId), roomNumber })
      .exec();
    if (!room) {
      throw new NotFoundException(`Room ${roomNumber} not found`);
    }
    return room;
  }

  async updateCleaningStatus(
    roomId: string | Types.ObjectId,
    cleaningStatus: CleaningStatus,
    updatedBy?: Types.ObjectId,
  ): Promise<RoomDocument> {
    const room = await this.roomModel.findById(roomId).exec();
    if (!room) {
      throw new NotFoundException(`Room ${String(roomId)} not found`);
    }

    room.cleaningStatus = cleaningStatus;
    room.cleaningUpdatedAt = new Date();
    if (updatedBy) {
      room.cleaningUpdatedBy = updatedBy;
    }

    return room.save();
  }

  async getHousekeepingBoard(branchId: string | Types.ObjectId): Promise<{
    inspected: RoomDocument[];
    clean: RoomDocument[];
    inProgress: RoomDocument[];
    dirty: RoomDocument[];
  }> {
    const rooms = await this.findAllByBranch(branchId);
    return {
      inspected: rooms.filter(
        (r) => r.cleaningStatus === CleaningStatus.INSPECTED,
      ),
      clean: rooms.filter((r) => r.cleaningStatus === CleaningStatus.CLEAN),
      inProgress: rooms.filter(
        (r) => r.cleaningStatus === CleaningStatus.IN_PROGRESS,
      ),
      dirty: rooms.filter((r) => r.cleaningStatus === CleaningStatus.DIRTY),
    };
  }
}
