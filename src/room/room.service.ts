import { Injectable, NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import { RoomRepo } from "./room.repo";
import { RoomDocument } from "./entity/room.entity";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";
import { R2Service } from "../storage/r2.service";
import { CreateRoomDto } from "./dto/requests/create-room.dto";

@Injectable()
export class RoomService {
  constructor(
    private readonly roomRepo: RoomRepo,
    private readonly r2Service: R2Service,
  ) {}

  async create(dto: CreateRoomDto): Promise<RoomDocument> {
    return this.roomRepo.create({
      branchId: new Types.ObjectId(dto.branchId),
      roomNumber: dto.roomNumber,
      floor: dto.floor,
      roomType: dto.roomType,
      maxOccupancy: dto.maxOccupancy,
      baseRateThb: dto.baseRateThb,
      amenities: dto.amenities || [],
      coverImage: dto.coverImage,
      images: dto.images || [],
      cleaningStatus: CleaningStatus.INSPECTED,
      isActive: true,
    });
  }

  async uploadImages(
    roomId: string,
    files: Express.Multer.File[],
    isCover: boolean = false,
  ): Promise<RoomDocument> {
    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }

    const folder = `rooms/${room.branchId.toString()}/${room.roomType.toLowerCase()}`;
    const uploadPromises = files.map((file) =>
      this.r2Service.uploadFile(file, folder),
    );
    const results = await Promise.all(uploadPromises);
    const urls = results.map((r) => r.url);

    const coverUrl = isCover && urls.length > 0 ? urls[0] : undefined;
    const updated = await this.roomRepo.addImages(
      room._id,
      urls,
      coverUrl,
    );
    return updated!;
  }

  async removeImage(roomId: string, imageUrl: string): Promise<RoomDocument> {
    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    const updated = await this.roomRepo.removeImage(room._id, imageUrl);
    return updated!;
  }

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
