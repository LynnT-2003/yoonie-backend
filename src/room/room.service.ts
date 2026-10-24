import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Types } from "mongoose";
import { RoomRepo } from "./room.repo";
import { RoomDocument } from "./entity/room.entity";
import { CleaningStatus } from "../common/enums/cleaning-status.enum";
import { R2Service } from "../storage/r2.service";
import { CreateRoomDto } from "./dto/requests/create-room.dto";
import { UpdateRoomDto } from "./dto/requests/update-room.dto";
import { ICurrentUser } from "../common/interfaces/user.interface";
import { validateBranchAccess } from "../common/helpers/branch-access.helper";

export interface RoomTypeCatalogItem {
  roomType: string;
  name: string;
  baseRateThb: number;
  maxOccupancy: number;
  amenities: string[];
  coverImage?: string;
  images: string[];
}

@Injectable()
export class RoomService {
  constructor(
    private readonly roomRepo: RoomRepo,
    private readonly r2Service: R2Service,
  ) {}

  async create(user: ICurrentUser, dto: CreateRoomDto): Promise<RoomDocument> {
    validateBranchAccess(user, dto.branchId);

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
    user: ICurrentUser,
    roomId: string,
    files: Express.Multer.File[],
    isCover: boolean = false,
  ): Promise<RoomDocument> {
    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    validateBranchAccess(user, room.branchId);

    const folder = `rooms/${room.branchId.toString()}/${room.roomType.toLowerCase()}`;
    const uploadPromises = files.map((file) =>
      this.r2Service.uploadFile(file, folder),
    );
    const results = await Promise.all(uploadPromises);
    const urls = results.map((r) => r.url);

    const coverUrl = isCover && urls.length > 0 ? urls[0] : undefined;
    const updated = await this.roomRepo.addImages(room._id, urls, coverUrl);
    return updated!;
  }

  async removeImage(
    user: ICurrentUser,
    roomId: string,
    imageUrl: string,
  ): Promise<RoomDocument> {
    const room = await this.roomRepo.findById(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    validateBranchAccess(user, room.branchId);

    const updated = await this.roomRepo.removeImage(room._id, imageUrl);
    return updated!;
  }

  async getRoomTypesCatalog(branchId: string): Promise<RoomTypeCatalogItem[]> {
    const rooms = await this.roomRepo.findAllByBranch(
      new Types.ObjectId(branchId),
    );
    const activeRooms = rooms.filter((r) => r.isActive !== false);
    const map = new Map<string, RoomTypeCatalogItem>();
    for (const r of activeRooms) {
      if (!map.has(r.roomType)) {
        map.set(r.roomType, {
          roomType: r.roomType,
          name: r.roomType.replace(/_/g, " "),
          baseRateThb: r.baseRateThb,
          maxOccupancy: r.maxOccupancy,
          amenities: r.amenities || [],
          coverImage: r.coverImage,
          images: r.images || [],
        });
      }
    }
    return Array.from(map.values());
  }

  async getRoomTypeCatalogById(id: string): Promise<RoomTypeCatalogItem> {
    const room = await this.roomRepo.findById(new Types.ObjectId(id));
    if (!room || room.isActive === false) {
      throw new NotFoundException(`Room type ${id} not found`);
    }
    return {
      roomType: room.roomType,
      name: room.roomType.replace(/_/g, " "),
      baseRateThb: room.baseRateThb,
      maxOccupancy: room.maxOccupancy,
      amenities: room.amenities || [],
      coverImage: room.coverImage,
      images: room.images || [],
    };
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

  async findById(id: string): Promise<RoomDocument> {
    const room = await this.roomRepo.findById(new Types.ObjectId(id));
    if (!room) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    return room;
  }

  async update(
    user: ICurrentUser,
    id: string,
    dto: UpdateRoomDto,
  ): Promise<RoomDocument> {
    const existing = await this.findById(id);
    validateBranchAccess(user, existing.branchId);

    const updateData: Record<string, unknown> = {};
    if (dto.roomNumber !== undefined) updateData.roomNumber = dto.roomNumber;
    if (dto.floor !== undefined) updateData.floor = dto.floor;
    if (dto.roomType !== undefined) updateData.roomType = dto.roomType;
    if (dto.maxOccupancy !== undefined)
      updateData.maxOccupancy = dto.maxOccupancy;
    if (dto.baseRateThb !== undefined) updateData.baseRateThb = dto.baseRateThb;
    if (dto.amenities !== undefined) updateData.amenities = dto.amenities;
    if (dto.coverImage !== undefined) updateData.coverImage = dto.coverImage;
    if (dto.images !== undefined) updateData.images = dto.images;
    if (dto.cleaningStatus !== undefined)
      updateData.cleaningStatus = dto.cleaningStatus;

    const updated = await this.roomRepo.update(
      new Types.ObjectId(id),
      updateData as any,
    );
    if (!updated) {
      throw new NotFoundException(`Room ${id} not found`);
    }
    return updated;
  }
}
