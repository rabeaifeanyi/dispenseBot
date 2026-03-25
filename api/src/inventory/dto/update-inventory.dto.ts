import { IsInt, Min, Max, IsOptional } from 'class-validator';

export class UpdateInventoryDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  totalStock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  currentMagazineStock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  warningStock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  magazineCount?: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  magazineSize?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxOrderQuantity?: number;
}
