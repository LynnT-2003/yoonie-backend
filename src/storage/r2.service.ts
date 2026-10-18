import { randomUUID } from "crypto";
import * as path from "path";
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PresignedUrlResponseDto } from "./dto/responses/presigned-url-response.dto";
import { UploadFileResponseDto } from "./dto/responses/upload-file-response.dto";

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucketName: string;
  private readonly publicUrl: string;
  private readonly isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    const accountId =
      this.configService.get<string>("CLOUDFLARE_R2_ACCOUNT_ID") ||
      this.configService.get<string>("R2_ACCOUNT_ID");
    const accessKeyId =
      this.configService.get<string>("CLOUDFLARE_R2_ACCESS_KEY_ID") ||
      this.configService.get<string>("R2_ACCESS_KEY_ID");
    const secretAccessKey =
      this.configService.get<string>("CLOUDFLARE_R2_SECRET_ACCESS_KEY") ||
      this.configService.get<string>("R2_SECRET_ACCESS_KEY");
    this.bucketName =
      this.configService.get<string>("CLOUDFLARE_R2_BUCKET_NAME") ||
      this.configService.get<string>("R2_BUCKET_NAME") ||
      "yoonie-media";
    this.publicUrl = (
      this.configService.get<string>("CLOUDFLARE_R2_PUBLIC_URL") ||
      this.configService.get<string>("R2_PUBLIC_URL") ||
      `https://${this.bucketName}.r2.dev`
    ).replace(/\/+$/, "");

    if (accountId && accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.isConfigured = true;
      this.logger.log(
        `Cloudflare R2 initialized with bucket: ${this.bucketName}`,
      );
    } else {
      this.logger.warn(
        "Cloudflare R2 credentials not fully set. R2Service running in unconfigured mode.",
      );
    }
  }

  /**
   * Generates a presigned PUT URL allowing clients (frontend/mobile) to upload directly
   * to Cloudflare R2 without routing heavy image payloads through the API server.
   */
  async getPresignedUploadUrl(
    filename: string,
    contentType: string,
    folder: string = "uploads",
    expiresInSeconds: number = 900,
  ): Promise<PresignedUrlResponseDto> {
    const ext = path.extname(filename).toLowerCase() || ".jpg";
    const sanitizedFolder = folder.replace(/^\/+|\/+$/g, "");
    const key = `${sanitizedFolder}/${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const publicUrl = `${this.publicUrl}/${key}`;

    if (!this.isConfigured || !this.s3Client) {
      this.logger.warn(`R2 not configured. Returning mock presigned URL for ${key}`);
      return {
        uploadUrl: `https://mock-r2.local/upload/${key}?mockToken=true`,
        key,
        publicUrl,
        expiresInSeconds,
      };
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client as any, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        uploadUrl,
        key,
        publicUrl,
        expiresInSeconds,
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to generate R2 presigned upload URL: ${error.message}`,
      );
    }
  }

  /**
   * Directly upload an image buffer (from Multer) to Cloudflare R2.
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = "uploads",
  ): Promise<UploadFileResponseDto> {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const sanitizedFolder = folder.replace(/^\/+|\/+$/g, "");
    const key = `${sanitizedFolder}/${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const publicUrl = `${this.publicUrl}/${key}`;

    if (!this.isConfigured || !this.s3Client) {
      this.logger.warn(`R2 not configured. Mocking upload for key ${key}`);
      return {
        key,
        url: publicUrl,
        contentType: file.mimetype,
        sizeBytes: file.size,
      };
    }

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return {
        key,
        url: publicUrl,
        contentType: file.mimetype,
        sizeBytes: file.size,
      };
    } catch (error: any) {
      this.logger.error(`Failed to upload file to R2: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to upload file to Cloudflare R2: ${error.message}`,
      );
    }
  }

  /**
   * Delete an object from Cloudflare R2 by key.
   */
  async deleteFile(key: string): Promise<boolean> {
    if (!this.isConfigured || !this.s3Client) {
      this.logger.warn(`R2 not configured. Mocking deletion of ${key}`);
      return true;
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to delete file from R2: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to delete file from Cloudflare R2: ${error.message}`,
      );
    }
  }

  /**
   * Returns the fully qualified CDN URL for a stored key.
   */
  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key.replace(/^\/+/, "")}`;
  }
}
