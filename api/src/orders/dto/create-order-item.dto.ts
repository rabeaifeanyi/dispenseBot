import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  componentType!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
