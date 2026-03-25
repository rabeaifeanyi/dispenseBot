import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll() {
    return this.inventoryService.findAll();
  }

  @Get(':componentId')
  findByComponentId(@Param('componentId') componentId: string) {
    return this.inventoryService.findByComponentId(componentId);
  }

  @Patch(':componentId')
  update(
    @Param('componentId') componentId: string,
    @Body() updateInventoryDto: UpdateInventoryDto
  ) {
    return this.inventoryService.update(componentId, updateInventoryDto);
  }

  @Patch(':componentId/adjust')
  adjustStock(
    @Param('componentId') componentId: string,
    @Body('adjustment') adjustment: number
  ) {
    return this.inventoryService.adjustStock(componentId, adjustment);
  }
}
