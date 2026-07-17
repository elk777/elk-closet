/**
 * 天气模块。
 *
 * 只对外提供 WeatherService（取实时天气），供推荐模块注入。
 * 无控制器——天气不单独开接口，仅作为今日推荐的内部输入。
 */

import { Module } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Module({
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
