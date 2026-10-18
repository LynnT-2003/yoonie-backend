import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { ServiceService } from "./service.service";
import { QueryServiceDto } from "./dto/requests/query-service.dto";
import { ServiceResponseDto } from "./dto/responses/service-response.dto";

@ApiTags("Services & Experiences")
@ApiBearerAuth("JWT-auth")
@Controller("services")
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "List services, tours, spas, and airport transfers for a branch",
  })
  @ApiResponse({
    status: 200,
    description: "List of services",
    type: [ServiceResponseDto],
  })
  async findAll(@Query() query: QueryServiceDto) {
    return this.serviceService.findAllByBranch(query.branchId, query.category);
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Get service details" })
  @ApiResponse({
    status: 200,
    description: "Service details",
    type: ServiceResponseDto,
  })
  async findById(@Param("id") id: string) {
    return this.serviceService.findById(id);
  }
}
