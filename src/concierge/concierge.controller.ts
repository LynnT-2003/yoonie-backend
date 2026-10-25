import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { ConciergeKeyGuard } from "./concierge-key.guard";
import { ConciergeService } from "./concierge.service";
import {
  ConciergeAvailabilityQueryDto,
  ConciergeBookingDto,
  ConciergeHotelQueryDto,
  ConciergeRequestDto,
} from "./dto/concierge.dto";

/**
 * Guest-safe API for the AI concierge (n8n). Not a user login: the concierge proves itself
 * with x-concierge-key, and a guest proves a booking with its number + email or phone.
 */
@ApiTags("AI Concierge")
@ApiHeader({ name: "x-concierge-key", required: true })
@Public()
@UseGuards(ConciergeKeyGuard)
@Controller("concierge")
export class ConciergeController {
  constructor(private readonly conciergeService: ConciergeService) {}

  @Get("hotel")
  @ApiOperation({
    summary: "Room types and prices, services, dining hours and house policies",
  })
  hotel(@Query() query: ConciergeHotelQueryDto) {
    return this.conciergeService.hotel(query.branchCode);
  }

  @Get("availability")
  @ApiOperation({ summary: "Rooms left per type for the dates, with prices" })
  availability(@Query() query: ConciergeAvailabilityQueryDto) {
    return this.conciergeService.availability(
      query.branchCode,
      query.checkIn,
      query.checkOut,
    );
  }

  @Post("bookings/lookup")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "A guest's booking, by booking number + the email or phone on it",
  })
  lookup(@Body() dto: ConciergeBookingDto) {
    return this.conciergeService.lookupBooking(dto);
  }

  @Post("requests")
  @ApiOperation({
    summary:
      "A guest asks for something (towels, maintenance, transport…); the desk and housekeeping are notified",
  })
  request(@Body() dto: ConciergeRequestDto) {
    return this.conciergeService.request(dto);
  }
}
