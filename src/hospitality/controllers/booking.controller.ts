import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Types } from "mongoose";
import { Public } from "../../common/decorators/public.decorator";
import { InventoryService } from "../services/inventory.service";
import { OrderService } from "../services/order.service";
import { CreateHoldDto } from "../dto/hold-inventory.dto";
import { ConfirmPaymentDto } from "../dto/confirm-payment.dto";
import { Order } from "../schemas/order.schema";

@ApiTags("Hospitality - Bookings & Inventory")
@ApiBearerAuth("JWT-auth")
@Controller("hospitality")
export class BookingController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly orderService: OrderService,
  ) {}

  @Public()
  @Get("inventory/availability")
  @ApiOperation({ summary: "Check room type availability across date range" })
  @ApiResponse({ status: 200, description: "Available keys count" })
  async checkRoomAvailability(
    @Query("branchId") branchId: string,
    @Query("roomType") roomType: string,
    @Query("checkIn") checkIn: string,
    @Query("checkOut") checkOut: string,
  ): Promise<{ available: number }> {
    const available = await this.inventoryService.roomTypeAvailability(
      new Types.ObjectId(branchId),
      roomType,
      checkIn,
      checkOut,
    );
    return { available };
  }

  @Public()
  @Post("inventory/hold")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Atomically hold inventory slots for checkout" })
  @ApiResponse({ status: 201, description: "Hold created successfully" })
  async createHold(@Body() dto: CreateHoldDto) {
    const hold = await this.inventoryService.hold(
      new Types.ObjectId(dto.branchId),
      dto.cartId,
      dto.lines,
      dto.ttlMinutes ?? 15,
    );
    return hold;
  }

  @Public()
  @Delete("inventory/hold/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Release an active inventory hold" })
  @ApiResponse({ status: 200, description: "Hold released" })
  async releaseHold(@Param("id") id: string) {
    const released = await this.inventoryService.release(
      new Types.ObjectId(id),
    );
    return { released };
  }

  @Public()
  @Post("orders")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a composite multi-product order" })
  @ApiResponse({ status: 201, description: "Order created" })
  async createOrder(@Body() orderData: Partial<Order>) {
    return this.orderService.create(orderData);
  }

  @Public()
  @Get("orders/:id")
  @ApiOperation({ summary: "Get order details by ID" })
  @ApiResponse({ status: 200, description: "Order details" })
  async getOrder(@Param("id") id: string) {
    return this.orderService.findById(id);
  }

  @Public()
  @Post("orders/:id/confirm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirm order payment and convert held inventory to booked",
  })
  @ApiResponse({
    status: 200,
    description: "Order confirmed and inventory booked",
  })
  async confirmOrder(@Param("id") id: string, @Body() dto: ConfirmPaymentDto) {
    return this.orderService.confirmOrderPayment(
      id,
      dto.paymentRef,
      dto.paidThb,
    );
  }

  @Public()
  @Post("orders/:id/lines/:lineId/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel a single item line within an order" })
  @ApiResponse({
    status: 200,
    description: "Line cancelled and inventory refunded",
  })
  async cancelLine(
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body("reason") reason: string,
    @Body("refundThb") refundThb?: number,
  ) {
    return this.orderService.cancelOrderLine(
      id,
      lineId,
      reason ?? "Guest requested",
      refundThb ?? 0,
    );
  }
}
