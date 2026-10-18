import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { OrderService } from "./order.service";
import { CreateOrderDto } from "./dto/requests/create-order.dto";
import { ConfirmPaymentDto } from "./dto/requests/confirm-payment.dto";
import { CancelOrderLineDto } from "./dto/requests/cancel-order-line.dto";
import { OrderResponseDto } from "./dto/responses/order-response.dto";
import { Order } from "./entity/order.entity";

@ApiTags("Orders & Bookings")
@ApiBearerAuth("JWT-auth")
@Controller("orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a composite multi-product order" })
  @ApiResponse({
    status: 201,
    description: "Order created",
    type: OrderResponseDto,
  })
  async createOrder(@Body() orderData: CreateOrderDto) {
    return this.orderService.create(orderData as unknown as Partial<Order>);
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Get order details by order ID" })
  @ApiResponse({
    status: 200,
    description: "Order details",
    type: OrderResponseDto,
  })
  async getOrder(@Param("id") id: string) {
    return this.orderService.findById(id);
  }

  @Public()
  @Post(":id/confirm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirm order payment and convert inventory hold to booked",
  })
  @ApiResponse({
    status: 200,
    description: "Order confirmed and inventory booked",
    type: OrderResponseDto,
  })
  async confirmOrder(@Param("id") id: string, @Body() dto: ConfirmPaymentDto) {
    return this.orderService.confirmOrderPayment(
      id,
      dto.paymentRef,
      dto.paidThb,
    );
  }

  @Public()
  @Post(":id/lines/:lineId/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel a single item line within an order" })
  @ApiResponse({
    status: 200,
    description: "Line cancelled and inventory refunded",
    type: OrderResponseDto,
  })
  async cancelLine(
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() dto: CancelOrderLineDto,
  ) {
    return this.orderService.cancelOrderLine(
      id,
      lineId,
      dto.reason ?? "Guest requested",
      dto.refundThb ?? 0,
    );
  }
}
