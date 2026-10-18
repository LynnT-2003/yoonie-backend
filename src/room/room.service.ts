import { Injectable, NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import { RoomRepo } from "./room.repo";
import { RoomDocument } from "./entity/room.entity";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";

@Injectable()
export class RoomService {
  constructor(private readonly roomRepo: RoomRepo) {}

  async findAllByBranch(branchId: string): Promise<RoomDocument[]> {
    return this.roomRepo.findAllByBranch(new Types.ObjectId(branchId));
  }

  async findByRoomNumber(
    branchId: string,
    roomNumber: string,
  ): Promise<RoomDocument> {
    const room = await this.roomRepo.findByRoomNumber(
      new Types.ObjectId(branchId),
      roomNumber,
    );
    if (!room) {
      throw new NotFoundException(`Room ${roomNumber} not found`);
    }
    return room;
  }

  async updateCleaningStatus(
    roomId: string,
    cleaningStatus: CleaningStatus,
    updatedBy?: string,
  ): Promise<RoomDocument> {
    const room = await this.roomRepo.updateCleaning(
      new Types.ObjectId(roomId),
      cleaningStatus,
      updatedBy ? new Types.ObjectId(updatedBy) : undefined,
    );
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    return room;
  }

  async getHousekeepingBoard(branchId: string): Promise<{
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
