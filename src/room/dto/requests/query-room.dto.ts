import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional } from "class-validator";
import { CleaningStatus } from "../../../common/enums/cleaning-status.enum";
import { RoomTypeCode } from "../../../common/enums/room-type.enum";

export class QueryRoomDto {
  @ApiPropertyOptional({
    example: "665a1b2c3d4e5f6a7b8c9d0e",
    description: "Branch ObjectId to filter rooms by",
  })
  @IsMongoId()
  @IsNotEmpty()
  branchId!: string;

  @ApiPropertyOptional({
    enum: RoomTypeCode,
    example: RoomTypeCode.STANDARD_KING,
    description: "Filter by room type",
  })
  @IsEnum(RoomTypeCode)
  @IsOptional()
  roomType?: RoomTypeCode;

  @ApiPropertyOptional({
    enum: CleaningStatus,
    example: CleaningStatus.DIRTY,
    description: "Filter by housekeeping cleaning status",
  })
  @IsEnum(CleaningStatus)
  @IsOptional()
  cleaningStatus?: CleaningStatus;

  @ApiPropertyOptional({
    example: 2,
    description: "Filter by floor number",
  })
  @IsOptional()
  floor?: number;
}
