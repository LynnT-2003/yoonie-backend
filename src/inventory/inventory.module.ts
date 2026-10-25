import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  InventorySlot,
  InventorySlotSchema,
} from "./entity/inventory-slot.entity";
import {
  InventoryHold,
  InventoryHoldSchema,
} from "./entity/inventory-hold.entity";
import { Room, RoomSchema } from "../room/entity/room.entity";
import { Service, ServiceSchema } from "../service/entity/service.entity";
import { InventoryRepo } from "./inventory.repo";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventorySlot.name, schema: InventorySlotSchema },
      { name: InventoryHold.name, schema: InventoryHoldSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Service.name, schema: ServiceSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepo],
  exports: [InventoryService, InventoryRepo, MongooseModule],
})
export class InventoryModule {}
