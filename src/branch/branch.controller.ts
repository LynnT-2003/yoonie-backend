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
import { BranchService } from "./branch.service";
import { CreateBranchDto } from "./dto/requests/create-branch.dto";
import { BranchResponseDto } from "./dto/responses/branch-response.dto";

@ApiTags("Branches")
@ApiBearerAuth("JWT-auth")
@Controller("branches")
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "List all active hotel property branches" })
  @ApiResponse({
    status: 200,
    description: "List of branches",
    type: [BranchResponseDto],
  })
  async findAll() {
    return this.branchService.findAll();
  }

  @Public()
  @Get(":code")
  @ApiOperation({ summary: "Get branch details by branch code" })
  @ApiResponse({
    status: 200,
    description: "Branch details",
    type: BranchResponseDto,
  })
  async findByCode(@Param("code") code: string) {
    return this.branchService.findByCode(code);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new branch property" })
  @ApiResponse({
    status: 201,
    description: "Branch created",
    type: BranchResponseDto,
  })
  async create(@Body() dto: CreateBranchDto) {
    return this.branchService.create(dto);
  }
}
