import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { R2Service } from "./r2.service";
import { GetPresignedUrlDto } from "./dto/requests/get-presigned-url.dto";
import { PresignedUrlResponseDto } from "./dto/responses/presigned-url-response.dto";
import { UploadFileResponseDto } from "./dto/responses/upload-file-response.dto";

@ApiTags("Storage / Cloudflare R2")
@Controller("storage")
export class R2Controller {
  constructor(private readonly r2Service: R2Service) {}

  @Public()
  @Post("presigned-url")
  @ApiOperation({
    summary: "Get Presigned Upload URL",
    description:
      "Generates a presigned Cloudflare R2 PUT URL. The frontend or mobile app can upload the image directly to Cloudflare without routing the binary data through the server.",
  })
  @ApiResponse({
    status: 201,
    description: "Presigned URL generated successfully",
    type: PresignedUrlResponseDto,
  })
  async getPresignedUrl(
    @Body() dto: GetPresignedUrlDto,
  ): Promise<PresignedUrlResponseDto> {
    return this.r2Service.getPresignedUploadUrl(
      dto.filename,
      dto.contentType,
      dto.folder,
    );
  }

  @Public()
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp|avif|gif|svg\+xml)$/)) {
          return cb(
            new BadRequestException(
              "Only image files (jpeg, png, webp, avif, gif, svg) are allowed",
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: "Upload Image Directly (Multipart)",
    description:
      "Uploads an image file directly to the backend server, which forwards and persists it to Cloudflare R2.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiQuery({
    name: "folder",
    required: false,
    example: "rooms",
    description: "Target folder prefix in R2 bucket (e.g. rooms, restaurants, services, avatars)",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "Image file to upload (max 10MB)",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "File uploaded successfully",
    type: UploadFileResponseDto,
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query("folder") folder?: string,
  ): Promise<UploadFileResponseDto> {
    if (!file) {
      throw new BadRequestException("No file provided in multipart payload");
    }
    return this.r2Service.uploadFile(file, folder || "uploads");
  }

  @Public()
  @Delete()
  @ApiOperation({
    summary: "Delete Image",
    description: "Deletes an image object from the Cloudflare R2 bucket by its key (e.g. rooms/photo.jpg).",
  })
  @ApiQuery({
    name: "key",
    required: true,
    example: "rooms/1729267200000-a1b2c3d4.jpg",
    description: "R2 object key to delete",
  })
  @ApiResponse({
    status: 200,
    description: "File deleted successfully",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        key: { type: "string", example: "rooms/1729267200000-a1b2c3d4.jpg" },
      },
    },
  })
  async deleteFile(@Query("key") key: string) {
    if (!key) {
      throw new BadRequestException("Query parameter 'key' is required");
    }
    await this.r2Service.deleteFile(key);
    return { success: true, key };
  }
}
