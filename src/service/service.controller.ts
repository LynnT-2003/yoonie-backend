import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { ServiceService } from "./service.service";
import { QueryServiceDto } from "./dto/requests/query-service.dto";
import { CreateServiceDto } from "./dto/requests/create-service.dto";
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

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "coverImage", maxCount: 1 },
      { name: "images", maxCount: 10 },
    ]),
  )
  @ApiOperation({
    summary: "Create a new service or experience (with optional images in one shot)",
    description:
      "Creates a new service/tour/spa/transfer. Supports both JSON and multipart/form-data with image file uploads (coverImage + images[]).",
  })
  @ApiConsumes("multipart/form-data", "application/json")
  @ApiResponse({
    status: 201,
    description: "Service created successfully",
    type: ServiceResponseDto,
  })
  async create(
    @Body() dto: CreateServiceDto,
    @UploadedFiles()
    files?: {
      coverImage?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    return this.serviceService.create(dto, files);
  }

  @Public()
  @Post(":id/images")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("images", 10))
  @ApiOperation({
    summary: "Upload & attach photos to an existing service in 1 call",
    description:
      "Uploads image files to Cloudflare R2 and immediately appends the resulting URLs to the service's image gallery in MongoDB.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["images"],
      properties: {
        images: {
          type: "array",
          items: { type: "string", format: "binary" },
          description: "One or more image files to upload and attach",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Images uploaded and service updated",
    type: ServiceResponseDto,
  })
  async uploadImages(
    @Param("id") id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("isCover") isCover?: boolean,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("At least one image file must be provided");
    }
    return this.serviceService.uploadImages(id, files, isCover);
  }

  @Public()
  @Delete(":id/images")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove an image from a service" })
  @ApiResponse({
    status: 200,
    description: "Image removed from service",
    type: ServiceResponseDto,
  })
  async removeImage(
    @Param("id") id: string,
    @Query("imageUrl") imageUrl: string,
  ) {
    if (!imageUrl) {
      throw new BadRequestException("Query parameter 'imageUrl' is required");
    }
    return this.serviceService.removeImage(id, imageUrl);
  }
}
