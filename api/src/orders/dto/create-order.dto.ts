import {
  IsArray,
  IsNotEmpty,
  ValidateNested,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @IsNotEmpty()
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
