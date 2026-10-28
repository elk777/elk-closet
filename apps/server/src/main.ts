import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { ResponseInterceptor } from './common/response.interceptor';
import { HttpExceptionFilter } from './common/http-exception.filter';

/**
 * 后端入口。
 *
 * 为什么全局开 ValidationPipe：PRD 5.5「永不信任外部输入」的落地——
 * 所有进入接口的 DTO 统一校验，脏数据在边界就被拦下，不进业务层。
 *
 * port / prefix 从 ConfigService 读（已经过启动校验），不直接摸 process.env。
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const { port, apiPrefix, env } = config.get<AppConfig>('app')!;

  // 小程序 / App 跨域访问后端 API
  app.enableCors();

  // 统一 API 前缀，便于 Nginx 反代按 /api 分流
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 剥离 DTO 未声明的字段，防注入多余数据
      transform: true, // 自动按 DTO 类型转换入参
    }),
  );

  // 统一响应信封：成功包成 { code:0, data, timestamp }（无 message 字段）
  app.useGlobalInterceptors(new ResponseInterceptor());
  // 统一异常信封：失败包成 { code, message, path, timestamp }，message 可直接展示给用户
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(port);
  Logger.log(
    `知衣后端已启动（${env}）：http://localhost:${port}/${apiPrefix}`,
    'Bootstrap',
  );
}

void bootstrap();
