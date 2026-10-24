import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Room, RoomSchema } from "./entity/room.entity";
import { RoomRepo } from "./room.repo";
import { RoomService } from "./room.service";
import { RoomController } from "./room.controller";
import { R2Module } from "../storage/r2.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Room.name, schema: RoomSchema }]),
    R2Module,
  ],
  controllers: [RoomController],
  providers: [RoomService, RoomRepo],
  exports: [RoomService, RoomRepo, MongooseModule],
})
export class RoomModule {}
