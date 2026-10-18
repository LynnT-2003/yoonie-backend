import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { RestaurantService } from "./restaurant.service";
import { QueryRestaurantDto } from "./dto/requests/query-restaurant.dto";
import { RestaurantResponseDto } from "./dto/responses/restaurant-response.dto";

@ApiTags("Restaurants & Dining")
@ApiBearerAuth("JWT-auth")
@Controller("restaurants")
export class RestaurantController {
  constructor(private readonly restaurantService: RestaurantService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "List all restaurants and dining venues for a branch",
  })
  @ApiResponse({
    status: 200,
    description: "List of restaurants",
    type: [RestaurantResponseDto],
  })
  async findAll(@Query() query: QueryRestaurantDto) {
    return this.restaurantService.findAllByBranch(query.branchId);
  }

  @Public()
  @Get(":id")
  @ApiOperation({
    summary: "Get restaurant details including tables and meal shifts",
  })
  @ApiResponse({
    status: 200,
    description: "Restaurant details",
    type: RestaurantResponseDto,
  })
  async findById(@Param("id") id: string) {
    return this.restaurantService.findById(id);
  }
}
