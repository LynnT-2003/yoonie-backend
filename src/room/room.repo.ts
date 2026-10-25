import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Room, RoomDocument } from "./entity/room.entity";

@Injectable()
export class RoomRepo {
  constructor(
    @InjectModel(Room.name)
    private readonly roomModel: Model<RoomDocument>,
  ) {}

  async create(data: Partial<Room>): Promise<RoomDocument> {
    const room = new this.roomModel(data);
    return room.save();
  }

  async findById(id: string | Types.ObjectId): Promise<RoomDocument | null> {
    return this.roomModel.findById(id).exec();
  }

  async findByRoomNumber(
    branchId: Types.ObjectId,
    roomNumber: string,
  ): Promise<RoomDocument | null> {
    return this.roomModel.findOne({ branchId, roomNumber }).exec();
  }

  async findAllByBranch(branchId: Types.ObjectId): Promise<RoomDocument[]> {
    return this.roomModel.find({ branchId }).sort({ roomNumber: 1 }).exec();
  }

  async addImages(
    roomId: Types.ObjectId,
    imageUrls: string[],
    coverImageUrl?: string,
  ): Promise<RoomDocument | null> {
    const update: any = {
      $addToSet: { images: { $each: imageUrls } },
    };
    if (coverImageUrl) {
      update.$set = { coverImage: coverImageUrl };
    }
    return this.roomModel
      .findByIdAndUpdate(roomId, update, { new: true })
      .exec();
  }

  async removeImage(
    roomId: Types.ObjectId,
    imageUrl: string,
  ): Promise<RoomDocument | null> {
    return this.roomModel
      .findByIdAndUpdate(roomId, { $pull: { images: imageUrl } }, { new: true })
      .exec();
  }

  async update(
    roomId: Types.ObjectId,
    data: Partial<Room>,
  ): Promise<RoomDocument | null> {
    return this.roomModel
      .findByIdAndUpdate(roomId, { $set: data }, { new: true })
      .exec();
  }
}
