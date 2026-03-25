import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.inventory.findMany({
      include: { component: true },
    });
  }

  async findByComponentId(componentId: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { componentId },
      include: { component: true },
    });

    if (!inventory) {
      throw new NotFoundException(
        `Inventory for component ${componentId} not found`
      );
    }

    return inventory;
  }

  async update(componentId: string, updateInventoryDto: UpdateInventoryDto) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { componentId },
    });

    if (!inventory) {
      throw new NotFoundException(
        `Inventory for component ${componentId} not found`
      );
    }

    if (updateInventoryDto.maxOrderQuantity !== undefined) {
      const magazineCount =
        updateInventoryDto.magazineCount ?? inventory.magazineCount;
      if (updateInventoryDto.maxOrderQuantity > magazineCount) {
        throw new Error(
          `maxOrderQuantity (${updateInventoryDto.maxOrderQuantity}) cannot exceed magazineCount (${magazineCount})`
        );
      }
    }

    if (updateInventoryDto.currentMagazineStock !== undefined) {
      const effectiveTotalStock =
        updateInventoryDto.totalStock ?? inventory.totalStock;
      updateInventoryDto.currentMagazineStock = Math.max(
        0,
        Math.min(updateInventoryDto.currentMagazineStock, effectiveTotalStock)
      );
    }

    return this.prisma.inventory.update({
      where: { componentId },
      data: {
        ...updateInventoryDto,
        lastRestocked:
          updateInventoryDto.totalStock !== undefined ? new Date() : undefined,
      },
      include: { component: true },
    });
  }

  async adjustStock(componentId: string, adjustment: number) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { componentId },
    });

    if (!inventory) {
      throw new NotFoundException(
        `Inventory for component ${componentId} not found`
      );
    }

    return this.prisma.inventory.update({
      where: { componentId },
      data: {
        totalStock: { increment: adjustment },
        lastRestocked: adjustment > 0 ? new Date() : undefined,
      },
      include: { component: true },
    });
  }
}
