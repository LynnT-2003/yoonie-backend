import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Types } from "mongoose";
import { Public } from "../common/decorators/public.decorator";
import { InventoryService } from "./inventory.service";
import { CreateHoldDto } from "./dto/requests/create-hold.dto";
import { CheckAvailabilityQueryDto } from "./dto/requests/check-availability.dto";
import { InventoryHoldResponseDto } from "./dto/responses/inventory-hold-response.dto";
import { AvailabilityResponseDto } from "./dto/responses/availability-response.dto";
import { ReleaseHoldResponseDto } from "./dto/responses/release-hold-response.dto";

@ApiTags("Inventory & Availability")
@ApiBearerAuth("JWT-auth")
@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Public()
  @Get("availability")
  @ApiOperation({ summary: "Check room type availability across date range" })
  @ApiResponse({
    status: 200,
    description: "Available keys count",
    type: AvailabilityResponseDto,
  })
  async checkRoomAvailability(
    @Query() query: CheckAvailabilityQueryDto,
  ): Promise<AvailabilityResponseDto> {
    const available = await this.inventoryService.roomTypeAvailability(
      new Types.ObjectId(query.branchId),
      query.roomType,
      query.checkIn,
      query.checkOut,
    );
    return {
      available,
      branchId: query.branchId,
      roomType: query.roomType,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
    };
  }

  @Public()
  @Post("hold")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Atomically hold inventory slots for checkout" })
  @ApiResponse({
    status: 201,
    description: "Hold created successfully",
    type: InventoryHoldResponseDto,
  })
  async createHold(@Body() dto: CreateHoldDto) {
    return this.inventoryService.hold(
      new Types.ObjectId(dto.branchId),
      dto.cartId,
      dto.lines,
      dto.ttlMinutes ?? 15,
    );
  }

  @Public()
  @Delete("hold/:id")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: "x-hold-token",
    description: "Hold token returned upon hold creation",
    required: false,
  })
  @ApiQuery({
    name: "token",
    description: "Hold token returned upon hold creation",
    required: false,
  })
  @ApiOperation({
    summary: "Release an active inventory hold (hold token required)",
  })
  @ApiResponse({
    status: 200,
    description: "Hold released",
    type: ReleaseHoldResponseDto,
  })
  async releaseHold(
    @Param("id") id: string,
    @Query("token") queryToken?: string,
    @Headers("x-hold-token") headerToken?: string,
  ): Promise<ReleaseHoldResponseDto> {
    const token = queryToken || headerToken;
    const released = await this.inventoryService.releaseWithToken(
      new Types.ObjectId(id),
      token,
    );
    return { released };
  }
}
