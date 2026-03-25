import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DispensedAmounts,
  McClientService,
  McStatusResponse,
} from './mc-client.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { getComponentsConfig } from '../config/config';

type OrderItemRef = {
  orderItemId: string;
  componentId: string;
  componentType: string;
  quantity: number;
  dispensedQuantity: number;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private orderQueue: string[] = [];
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private mcClient: McClientService
  ) {}

  async create(createOrderDto: CreateOrderDto) {
    const orderNumber = `ORD-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`;

    const { magazineChangeNeeded, totalItems } = await this.validateOrder(
      createOrderDto
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const componentByType = new Map<
        string,
        {
          id: string;
          inventory: {
            id: string;
            estimatedMagazineStock: number;
            magazineSize: number;
          } | null;
        }
      >();

      for (const item of createOrderDto.items) {
        const component = await tx.component.findFirst({
          where: { type: item.componentType },
          include: { inventory: true },
        });

        if (!component) {
          throw new NotFoundException(
            `Component ${item.componentType} not found`
          );
        }

        componentByType.set(item.componentType, component);

        if (component.inventory) {
          const newEstimated = Math.min(
            component.inventory.magazineSize,
            Math.max(
              0,
              component.inventory.estimatedMagazineStock - item.quantity
            )
          );
          await tx.inventory.update({
            where: { id: component.inventory.id },
            data: { estimatedMagazineStock: newEstimated },
          });
        }
      }

      return tx.order.create({
        data: {
          orderNumber,
          status: OrderStatus.PENDING,
          totalItems,
          description: createOrderDto.description || null,
          magazineChangeNeeded,
          items: {
            create: createOrderDto.items.map((item) => {
              const component = componentByType.get(item.componentType)!;
              return {
                componentId: component.id,
                quantity: item.quantity,
              };
            }),
          },
        },
        include: {
          items: {
            include: { component: true },
          },
        },
      });
    });

    this.orderQueue.push(order.id);
    this.logger.log(
      `Order ${order.orderNumber} queued (position: ${this.orderQueue.length})`
    );

    void this.checkAndProcessQueue();

    return order;
  }

  async findAll() {
    return this.prisma.order.findMany({
      include: {
        items: {
          include: { component: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { component: true },
        },
      },
    });

    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    if (
      status === OrderStatus.PICKED_UP &&
      order.status !== OrderStatus.ORDER_READY
    ) {
      throw new BadRequestException(
        `Can only mark as PICKED_UP if status is ORDER_READY. Current status: ${order.status}`
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        status,
        completedAt:
          status === OrderStatus.PICKED_UP ? new Date() : order.completedAt,
      },
    });

    if (status === OrderStatus.PICKED_UP) {
      this.logger.log(
        `Order ${updatedOrder.orderNumber} marked PICKED_UP. Processing next order...`
      );
      setTimeout(() => void this.checkAndProcessQueue(), 100);
    }

    return updatedOrder;
  }

  async cancelOrder(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            component: { include: { inventory: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    const allowed = new Set<OrderStatus>([
      OrderStatus.PENDING,
      OrderStatus.MAGAZINE_CHANGE_NEEDED,
    ]);

    if (!allowed.has(order.status)) {
      throw new BadRequestException(
        `Can only cancel PENDING or MAGAZINE_CHANGE_NEEDED orders. Current status: ${order.status}`
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const inv = item.component.inventory;
        if (!inv) continue;

        if (order.status === OrderStatus.MAGAZINE_CHANGE_NEEDED) {
          // totalStock and currentMagazineStock were already decremented by
          // storeDispensedQuantities when the magazine change was detected.
          // Deducting them again here would cause a double-deduction.
          // Only restore the estimatedMagazineStock reservation for the portion
          // that was never dispensed (the order won't complete).
          const dispensed = item.dispensedQuantity;
          const remaining = item.quantity - dispensed;

          if (remaining > 0) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                estimatedMagazineStock: Math.min(
                  inv.magazineSize,
                  inv.estimatedMagazineStock + remaining
                ),
              },
            });
          }
        } else {
          const restored = Math.min(
            inv.magazineSize,
            inv.estimatedMagazineStock + item.quantity
          );
          await tx.inventory.update({
            where: { id: inv.id },
            data: { estimatedMagazineStock: restored },
          });
        }
      }

      return tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.ABORTED,
          abortedAt: new Date(),
        },
      });
    });

    this.orderQueue = this.orderQueue.filter((orderId) => orderId !== id);
    void this.checkAndProcessQueue();

    return updatedOrder;
  }

  async magazineReset(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            component: { include: { inventory: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException(`Order ${id} not found`);

    if (order.status !== OrderStatus.MAGAZINE_CHANGE_NEEDED) {
      throw new BadRequestException(
        `Magazine reset requires MAGAZINE_CHANGE_NEEDED status. Current: ${order.status}`
      );
    }

    const mcStatus = await this.mcClient.getMcStatus();

    const cfg = getComponentsConfig();
    const changeFlags: Record<string, number> = {};
    for (const partCfg of Object.values(cfg.parts)) {
      const idx = partCfg.mc.magazinIndex;
      changeFlags[`magazin${idx}_gewechselt`] = mcStatus?.[
        `magazin${idx}_wechseln`
      ]
        ? 1
        : 0;
    }

    try {
      await this.mcClient.confirmMagazineChange(changeFlags);
    } catch (error: any) {
      this.logger.warn(
        `MC did not finish magazine change for order ${order.orderNumber}: ${
          error?.message ?? String(error)
        }`
      );
      throw new BadRequestException(
        'MC did not complete magazine change. Please retry magazine reset.'
      );
    }

    const changedPartTypes = new Set<string>();
    for (const [partType, partCfg] of Object.entries(cfg.parts)) {
      const idx = partCfg.mc.magazinIndex;
      if (changeFlags[`magazin${idx}_gewechselt`] === 1) {
        changedPartTypes.add(partType);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const inv = item.component.inventory;
        if (!inv) continue;

        if (changedPartTypes.has(item.component.type)) {
          // Fresh magazine inserted → reset to full capacity
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              currentMagazineStock: inv.magazineSize,
              estimatedMagazineStock: inv.magazineSize,
            },
          });
          this.logger.log(
            `${item.component.type}: magazine changed → refilled to ${inv.magazineSize}`
          );
        }
      }

      await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.PROCESSING_ORDER,
          magazineChangeNeeded: false,
        },
      });
    });

    this.logger.log(
      `Magazine reset confirmed for order ${order.orderNumber}, continuing...`
    );

    const items: OrderItemRef[] = order.items.map((item) => ({
      orderItemId: item.id,
      componentId: item.componentId,
      componentType: item.component.type,
      quantity: item.quantity,
      dispensedQuantity: item.dispensedQuantity,
    }));

    this.sendContinuationOrder(id, items).catch((error) => {
      this.logger.error(
        `Failed to continue order after magazine change: ${error.message}`
      );
    });

    return this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { component: true } } },
    });
  }

  private async sendContinuationOrder(
    orderId: string,
    items: OrderItemRef[]
  ): Promise<void> {
    const remainingMap = new Map<string, number>();
    for (const item of items) {
      const remaining = item.quantity - item.dispensedQuantity;
      if (remaining > 0) {
        remainingMap.set(
          item.componentType,
          (remainingMap.get(item.componentType) ?? 0) + remaining
        );
      }
    }

    if (remainingMap.size === 0) {
      this.logger.log(
        `Order ${orderId}: all items already dispensed, marking ORDER_READY`
      );
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.ORDER_READY, completedAt: new Date() },
      });
      return;
    }

    try {
      const dispensed = await this.mcClient.sendOrderToMc(remainingMap);
      await this.applyDispensedToInventoryAndOrder(orderId, dispensed);
    } catch (error: any) {
      if (error?.message?.includes('MC_MAGAZINE_CHANGE_NEEDED')) {
        this.logger.warn(
          `Magazine change needed again during continuation of order ${orderId}`
        );
        const dispensed = this.parseDispensedFromError(error.message);
        await this.storeDispensedQuantities(orderId, dispensed);
        await this.prisma.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.MAGAZINE_CHANGE_NEEDED,
            magazineChangeNeeded: true,
          },
        });
        return;
      }
      this.logger.error(
        `Continuation order failed for ${orderId}: ${error.message}`
      );
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.ABORTED, abortedAt: new Date() },
      });
    }
  }

  async triggerQueueProcessing() {
    await this.checkAndProcessQueue();

    const pending = await this.prisma.order.count({
      where: { status: OrderStatus.PENDING },
    });

    const processing = await this.prisma.order.findFirst({
      where: {
        status: {
          in: [
            OrderStatus.PROCESSING_ORDER,
            OrderStatus.ORDER_READY,
            OrderStatus.MAGAZINE_CHANGE_NEEDED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Queue processing triggered',
      pendingOrders: pending,
      activeOrder: processing?.orderNumber || null,
    };
  }

  async getQueueStatus() {
    await this.updateProcessingOrderStatusFromMc();

    const activeOrder = await this.prisma.order.findFirst({
      where: {
        status: {
          in: [
            OrderStatus.PROCESSING_ORDER,
            OrderStatus.ORDER_READY,
            OrderStatus.MAGAZINE_CHANGE_NEEDED,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        items: { include: { component: true } },
      },
    });

    const queuedOrders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        items: { include: { component: true } },
      },
    });

    const mcStatusData = await this.mcClient.getMcStatus();
    const mcInMagChange = mcStatusData?.status_bin === '0100';
    const hasMagChangeOrder =
      activeOrder?.status === OrderStatus.MAGAZINE_CHANGE_NEEDED;
    const mcNeedsMagazineChange = mcInMagChange && !hasMagChangeOrder;

    return {
      isAutomatBusy: !!activeOrder,
      queueLength: queuedOrders.length,
      activeOrder: activeOrder || null,
      queuedOrders,
      mcNeedsMagazineChange,
    };
  }

  async standaloneMagazineChange(): Promise<{ ok: boolean }> {
    const mcStatusData = await this.mcClient.getMcStatus();

    if (!mcStatusData || mcStatusData.status_bin !== '0100') {
      throw new BadRequestException(
        `Standalone magazine change requires MC in MAG_CHANGE state. Current: ${
          mcStatusData?.status_bin ?? 'unknown'
        }`
      );
    }

    const cfg = getComponentsConfig();
    const changeFlags: Record<string, number> = {};
    for (const partCfg of Object.values(cfg.parts)) {
      const idx = partCfg.mc.magazinIndex;
      changeFlags[`magazin${idx}_gewechselt`] = mcStatusData[
        `magazin${idx}_wechseln`
      ]
        ? 1
        : 0;
    }

    try {
      await this.mcClient.confirmMagazineChange(changeFlags);
    } catch (error: any) {
      this.logger.warn(
        `Standalone magazine change did not complete: ${
          error?.message ?? String(error)
        }`
      );
      throw new BadRequestException(
        'MC did not complete magazine change. Please retry.'
      );
    }

    const changedPartTypes = new Set<string>();
    for (const [partType, partCfg] of Object.entries(cfg.parts)) {
      const idx = partCfg.mc.magazinIndex;
      if (changeFlags[`magazin${idx}_gewechselt`] === 1) {
        changedPartTypes.add(partType);
      }
    }

    if (changedPartTypes.size > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const partType of changedPartTypes) {
          const component = await tx.component.findFirst({
            where: { type: partType },
            include: { inventory: true },
          });
          if (!component?.inventory) continue;
          const inv = component.inventory;
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              currentMagazineStock: inv.magazineSize,
              estimatedMagazineStock: inv.magazineSize,
            },
          });
          this.logger.log(
            `${partType}: standalone magazine change → refilled to ${inv.magazineSize}`
          );
        }
      });
    }

    this.logger.log('Standalone magazine change completed, triggering queue');
    await this.triggerQueueProcessing();
    return { ok: true };
  }

  private async validateOrder(createOrderDto: CreateOrderDto) {
    let magazineChangeNeeded = false;

    for (const item of createOrderDto.items) {
      const component = await this.prisma.component.findFirst({
        where: { type: item.componentType },
        include: { inventory: true },
      });

      if (!component) {
        throw new NotFoundException(
          `Component ${item.componentType} not found`
        );
      }
      if (!component.inventory) {
        throw new BadRequestException(
          `No inventory configured for ${item.componentType}`
        );
      }

      const inv = component.inventory;

      if (inv.currentMagazineStock === 0) {
        throw new BadRequestException(
          `Magazine for ${item.componentType} is empty. Cannot accept orders.`
        );
      }

      const estimatedStock = Math.min(
        inv.estimatedMagazineStock,
        inv.magazineSize
      );

      const maxOrderable = Math.min(
        (inv.maxOrderQuantity - 1) * inv.magazineSize + estimatedStock,
        inv.totalStock
      );

      if (item.quantity > maxOrderable) {
        throw new BadRequestException(
          `Insufficient stock for ${item.componentType}. Max orderable: ${maxOrderable}, Requested: ${item.quantity}`
        );
      }

      if (item.quantity > estimatedStock) {
        magazineChangeNeeded = true;
      }
    }

    const totalItems = createOrderDto.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    return { magazineChangeNeeded, totalItems };
  }

  private async checkAndProcessQueue() {
    if (this.isProcessing || this.orderQueue.length === 0) return;

    const activeOrder = await this.prisma.order.findFirst({
      where: {
        status: {
          in: [
            OrderStatus.PROCESSING_ORDER,
            OrderStatus.ORDER_READY,
            OrderStatus.MAGAZINE_CHANGE_NEEDED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeOrder) {
      this.logger.debug(
        `Queue blocked: active order ${activeOrder.orderNumber} is ${activeOrder.status}`
      );
      return;
    }

    const mcReady = await this.mcClient.checkMcHealth();
    if (!mcReady) return;

    this.isProcessing = true;

    try {
      const orderId = this.orderQueue.shift();
      if (!orderId) return;

      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { component: true } },
        },
      });

      if (!order) return;

      const items: OrderItemRef[] = order.items.map((item) => ({
        orderItemId: item.id,
        componentId: item.componentId,
        componentType: item.component.type,
        quantity: item.quantity,
        dispensedQuantity: item.dispensedQuantity,
      }));

      await this.processOrderWithMc(order.id, items);
    } catch (error) {
      this.logger.error(
        `Failed to process order: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async processOrderWithMc(
    orderId: string,
    items: OrderItemRef[]
  ): Promise<void> {
    try {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PROCESSING_ORDER },
      });

      const orderMap = new Map<string, number>();
      for (const item of items) {
        orderMap.set(
          item.componentType,
          (orderMap.get(item.componentType) ?? 0) + item.quantity
        );
      }

      const dispensed = await this.mcClient.sendOrderToMc(orderMap);
      await this.applyDispensedToInventoryAndOrder(orderId, dispensed);
    } catch (error: any) {
      if (error?.message?.includes('MC_MAGAZINE_CHANGE_NEEDED')) {
        this.logger.warn(`Magazine change needed during order ${orderId}`);
        const dispensed = this.parseDispensedFromError(error.message);
        await this.storeDispensedQuantities(orderId, dispensed);
        await this.prisma.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.MAGAZINE_CHANGE_NEEDED,
            magazineChangeNeeded: true,
          },
        });
        return;
      }

      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.ABORTED, abortedAt: new Date() },
      });

      throw error;
    }
  }

  private computeFifoDeltas(
    items: OrderItemRef[],
    dispensed: DispensedAmounts
  ): Map<string, number> {
    const byType = new Map<string, OrderItemRef[]>();
    for (const item of items) {
      const list = byType.get(item.componentType) ?? [];
      list.push(item);
      byType.set(item.componentType, list);
    }
    for (const list of byType.values()) {
      list.sort((a, b) => a.orderItemId.localeCompare(b.orderItemId));
    }

    const deltas = new Map<string, number>();

    for (const [type, raw] of Object.entries(dispensed)) {
      const cumulative =
        typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
      if (cumulative <= 0) continue;

      const lines = byType.get(type) ?? [];
      let remaining = cumulative;
      for (const line of lines) {
        if (remaining <= 0) break;
        const headroom = Math.max(0, line.quantity - line.dispensedQuantity);
        const delta = Math.min(headroom, remaining);
        if (delta > 0) {
          deltas.set(
            line.orderItemId,
            (deltas.get(line.orderItemId) ?? 0) + delta
          );
          remaining -= delta;
        }
      }
    }

    return deltas;
  }

  private async applyDispensedToInventoryAndOrder(
    orderId: string,
    dispensed: DispensedAmounts
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      let totalDispensedThisCycle = 0;

      const rows = await tx.orderItem.findMany({
        where: { orderId },
        include: { component: true },
        orderBy: { id: 'asc' },
      });

      const items: OrderItemRef[] = rows.map((row) => ({
        orderItemId: row.id,
        componentId: row.componentId,
        componentType: row.component.type,
        quantity: row.quantity,
        dispensedQuantity: row.dispensedQuantity,
      }));

      const deltas = this.computeFifoDeltas(items, dispensed);

      for (const [orderItemId, amount] of deltas) {
        if (amount <= 0) continue;

        const item = items.find((i) => i.orderItemId === orderItemId);
        if (!item) continue;

        const inventory = await tx.inventory.findUnique({
          where: { componentId: item.componentId },
        });

        if (!inventory) {
          this.logger.warn(`No inventory for component ${item.componentId}`);
          continue;
        }

        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            totalStock: Math.max(0, inventory.totalStock - amount),
            currentMagazineStock: Math.max(
              0,
              inventory.currentMagazineStock - amount
            ),
          },
        });

        await tx.orderItem.update({
          where: { id: orderItemId },
          data: { dispensedQuantity: { increment: amount } },
        });

        totalDispensedThisCycle += amount;
        this.logger.log(
          `${item.componentType}: dispensed ${amount}, ` +
            `inventory ${inventory.currentMagazineStock} → ${Math.max(
              0,
              inventory.currentMagazineStock - amount
            )}`
        );
      }

      const updatedItems = await tx.orderItem.findMany({
        where: { orderId },
      });
      const totalDispensed = updatedItems.reduce(
        (sum, i) => sum + i.dispensedQuantity,
        0
      );

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.ORDER_READY,
          dispensedItems: totalDispensed,
          completedAt: new Date(),
        },
      });
    });
  }

  private async storeDispensedQuantities(
    orderId: string,
    dispensed: DispensedAmounts
  ): Promise<void> {
    const rows = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: { component: true },
      orderBy: { id: 'asc' },
    });

    const items: OrderItemRef[] = rows.map((row) => ({
      orderItemId: row.id,
      componentId: row.componentId,
      componentType: row.component.type,
      quantity: row.quantity,
      dispensedQuantity: row.dispensedQuantity,
    }));

    const deltas = this.computeFifoDeltas(items, dispensed);
    let totalDispensedThisCycle = 0;

    for (const [orderItemId, amount] of deltas) {
      if (amount <= 0) continue;

      const item = items.find((i) => i.orderItemId === orderItemId);
      if (!item) continue;

      await this.prisma.orderItem.update({
        where: { id: orderItemId },
        data: { dispensedQuantity: { increment: amount } },
      });

      const inventory = await this.prisma.inventory.findUnique({
        where: { componentId: item.componentId },
      });
      if (inventory) {
        await this.prisma.inventory.update({
          where: { id: inventory.id },
          data: {
            totalStock: Math.max(0, inventory.totalStock - amount),
            currentMagazineStock: Math.max(
              0,
              inventory.currentMagazineStock - amount
            ),
          },
        });
        this.logger.log(
          `${item.componentType}: dispensed ${amount} (pre-change segment), ` +
            `inventory ${inventory.currentMagazineStock} → ${Math.max(
              0,
              inventory.currentMagazineStock - amount
            )}`
        );
      }

      totalDispensedThisCycle += amount;
    }

    if (totalDispensedThisCycle > 0) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { dispensedItems: { increment: totalDispensedThisCycle } },
      });
    }
  }

  private parseDispensedFromError(errorMessage: string): DispensedAmounts {
    try {
      const match = errorMessage.match(/\{[\s\S]*\}/);
      if (!match) return {};
      const statusData = JSON.parse(match[0]) as McStatusResponse;
      return this.mcClient.parseAmounts(statusData);
    } catch {
      return {};
    }
  }

  private async updateProcessingOrderStatusFromMc() {
    const mcStatus = await this.mcClient.getMcStatus();
    if (!mcStatus) return;

    const statusBin = mcStatus.status_bin;

    if (statusBin === '0001') {
      const orderReady = await this.prisma.order.findFirst({
        where: { status: OrderStatus.ORDER_READY },
        orderBy: { createdAt: 'asc' },
      });
      if (orderReady) {
        const result = await this.prisma.order.updateMany({
          where: { id: orderReady.id, status: OrderStatus.ORDER_READY },
          data: { status: OrderStatus.PICKED_UP, completedAt: new Date() },
        });
        if (result.count > 0) {
          this.logger.log(
            `MC ready (0001), marking order ${orderReady.orderNumber} as PICKED_UP`
          );
          setTimeout(() => void this.checkAndProcessQueue(), 100);
        }
      }
    }

    if (statusBin === '0011') {
      const processingOrder = await this.prisma.order.findFirst({
        where: { status: OrderStatus.PROCESSING_ORDER },
        orderBy: { createdAt: 'asc' },
      });
      if (processingOrder) {
        await this.prisma.order.updateMany({
          where: {
            id: processingOrder.id,
            status: OrderStatus.PROCESSING_ORDER,
          },
          data: { status: OrderStatus.ORDER_READY },
        });
      }
    }
  }
}
