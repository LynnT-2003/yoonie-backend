import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Room, RoomSchema } from "./entity/room.entity";
import { RoomRepo } from "./room.repo";
import { RoomService } from "./room.service";
import { RoomController } from "./room.controller";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Room.name, schema: RoomSchema }]),
  ],
  controllers: [RoomController],
  providers: [RoomService, RoomRepo],
  exports: [RoomService, RoomRepo, MongooseModule],
})
export class RoomModule {}
