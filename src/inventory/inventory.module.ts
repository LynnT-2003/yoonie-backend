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
import { InventoryRepo } from "./inventory.repo";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventorySlot.name, schema: InventorySlotSchema },
      { name: InventoryHold.name, schema: InventoryHoldSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepo],
  exports: [InventoryService, InventoryRepo, MongooseModule],
})
export class InventoryModule {}
