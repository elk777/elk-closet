import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { AppConfig, CorsConfig } from './config/configuration';
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
  const { origins } = config.get<CorsConfig>('cors')!;

  // 小程序不受同源策略约束；H5 需要跨域许可。
  // CORS_ORIGINS 为空表示不限制（本地开发 / 前后端同域部署时无需配置），
  // 配置了则严格按白名单放行——生产 H5 换域名后不会因为漏配而中断。
  app.enableCors(
    origins.length
      ? { origin: origins, credentials: true }
      : { origin: true },
  );

  // 统一 API 前缀，便于 Nginx 反代按 /api 分流
  app.setGlobalPrefix(apiPrefix);

  // 信任反向代理，让 req.ip 取到真实客户端地址。
  //
  // 生产部署是「Nginx → 本服务」，不配这项时 Express 会把连接来源
  // （即 127.0.0.1）当成客户端 IP —— 验证码的 IP 维度限流会退化成
  // 「全站共用一个额度」，10 次/小时一用完所有人发不了码。
  //
  // 取 1 而非 true：只信任最近一层代理（本题即本机 Nginx）。
  // 用 true 会信任 X-Forwarded-For 整条链，客户端可伪造前缀绕过限流。
  //
  // 必须拿到底层 Express 实例才能设这个值——Nest 的 INestApplication
  // 不暴露 set()，只有 httpAdapter 的实例才带 Express 的配置方法。
  const httpAdapter = app.getHttpAdapter().getInstance() as {
    set(key: string, value: unknown): void;
  };
  httpAdapter.set('trust proxy', 1);

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
