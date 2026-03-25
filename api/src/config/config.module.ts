import { Module } from '@nestjs/common';
import { ComponentsConfigController } from './config.controller';

@Module({
  controllers: [ComponentsConfigController],
})
export class ComponentsConfigModule {}
