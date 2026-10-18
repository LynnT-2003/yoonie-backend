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
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import {
  FileFieldsInterceptor,
  FileInterceptor,
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
  @ApiOperation({ summary: "Get branch details by branch code or ID" })
  @ApiResponse({
    status: 200,
    description: "Branch details",
    type: BranchResponseDto,
  })
  async findByCode(@Param("code") code: string) {
    return this.branchService.findByCode(code);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a new branch property",
    description: "Creates a new branch property with property details and image URLs.",
  })
  @ApiResponse({
    status: 201,
    description: "Branch created",
    type: BranchResponseDto,
  })
  async create(@Body() dto: CreateBranchDto) {
    return this.branchService.create(dto);
  }

  @Public()
  @Post(":idOrCode/images")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("images", 10))
  @ApiOperation({
    summary: "Upload & attach photos to an existing branch in 1 call",
    description:
      "Uploads image files to Cloudflare R2 and immediately appends URLs to the branch's image gallery in MongoDB.",
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
    description: "Images uploaded and branch updated",
    type: BranchResponseDto,
  })
  async uploadImages(
    @Param("idOrCode") idOrCode: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Query("isHero") isHero?: boolean,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("At least one image file must be provided");
    }
    return this.branchService.uploadImages(idOrCode, files, isHero);
  }

  @Public()
  @Post(":idOrCode/logo")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    summary: "Upload & update branch brand logo in 1 call",
    description:
      "Uploads a logo image file to Cloudflare R2 and immediately sets logoUrl on the branch in MongoDB.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "Brand logo image file (SVG, PNG, WebP)",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Logo uploaded and branch updated",
    type: BranchResponseDto,
  })
  async uploadLogo(
    @Param("idOrCode") idOrCode: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("A logo image file must be provided");
    }
    return this.branchService.uploadLogo(idOrCode, file);
  }

  @Public()
  @Delete(":idOrCode/images")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove an image from a branch gallery" })
  @ApiResponse({
    status: 200,
    description: "Image removed from branch",
    type: BranchResponseDto,
  })
  async removeImage(
    @Param("idOrCode") idOrCode: string,
    @Query("imageUrl") imageUrl: string,
  ) {
    if (!imageUrl) {
      throw new BadRequestException("Query parameter 'imageUrl' is required");
    }
    return this.branchService.removeImage(idOrCode, imageUrl);
  }
}
