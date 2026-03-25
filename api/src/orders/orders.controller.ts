import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Logger,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { McClientService, McStatusResponse } from './mc-client.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '@prisma/client';

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly mcClientService: McClientService
  ) {}

  @Post()
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: OrderStatus) {
    return this.ordersService.updateStatus(id, status);
  }

  @Post(':id/pickup')
  markAsPickedUp(@Param('id') id: string) {
    return this.ordersService.updateStatus(id, OrderStatus.PICKED_UP);
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }

  @Post(':id/magazine-reset')
  magazineReset(@Param('id') id: string) {
    return this.ordersService.magazineReset(id);
  }

  @Get('mc/health')
  async checkMcHealth() {
    const isHealthy = await this.mcClientService.checkMcHealth();
    return {
      connected: isHealthy,
      status: isHealthy ? 'ok' : 'error',
      message: isHealthy ? 'MC ok' : 'MC not available',
    };
  }

  @Get('mc/status')
  async getMcStatus(): Promise<McStatusResponse | null> {
    return this.mcClientService.getMcStatus();
  }

  @Post('mc/standalone-magazine-change')
  async standaloneMagazineChange() {
    return this.ordersService.standaloneMagazineChange();
  }

  @Post('mc/magazine-change/start')
  async startMagazineChange() {
    await this.mcClientService.startMagazineChange();
    return { ok: true };
  }

  @Post('mc/magazine-change/force')
  async forceStartMagazineChange(@Body() body: { part: number }) {
    await this.mcClientService.forceStartMagazineChange(body.part);
    return { ok: true };
  }

  @Post('mc/acknowledge')
  async acknowledgeMcCompletion() {
    const { activeOrder } = await this.ordersService.getQueueStatus();

    if (activeOrder && activeOrder.status === OrderStatus.ORDER_READY) {
      await this.ordersService.updateStatus(
        activeOrder.id,
        OrderStatus.PICKED_UP
      );
    }

    await this.ordersService.triggerQueueProcessing();
    return { ok: true };
  }

  @Get('queue/status')
  async getQueueStatus() {
    return this.ordersService.getQueueStatus();
  }

  @Post('queue/process')
  async processQueue() {
    return this.ordersService.triggerQueueProcessing();
  }
}
