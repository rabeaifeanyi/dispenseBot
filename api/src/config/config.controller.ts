import { Controller, Get } from '@nestjs/common';
import { getComponentsConfig } from './config';

@Controller()
export class ComponentsConfigController {
  @Get('/config')
  getComponentsConfig() {
    return getComponentsConfig();
  }
}
