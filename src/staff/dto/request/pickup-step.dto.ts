import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import {
  PickupIssueKind,
  PickupStage,
} from "../../../common/enums/pickup.enum";

export class PickupStepDto {
  @ApiProperty({
    enum: PickupStage,
    description: "The step the driver has reached. Steps only move forward.",
    example: PickupStage.AT_AIRPORT,
  })
  @IsEnum(PickupStage)
  stage!: PickupStage;

  @ApiPropertyOptional({ example: "Parked at P2, walking to door 4" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class PickupIssueDto {
  @ApiProperty({
    enum: PickupIssueKind,
    example: PickupIssueKind.FLIGHT_DELAYED,
  })
  @IsEnum(PickupIssueKind)
  kind!: PickupIssueKind;

  @ApiPropertyOptional({ example: "Board says TG917 now lands 15:10" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
