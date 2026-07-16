/**
 * 全局异常过滤器：把所有抛出的错误包成统一响应信封。
 *
 * 呼应 PRD 5.6「每个异常都要有明确的用户可见反馈」：
 * - HttpException（含校验错误 / 业务 404 / 鉴权 401）→ 取其状态码与 message
 * - 其余未预期异常 → 统一 500，对外只给「服务异常」，细节记日志不外泄
 *
 * 与 ResponseInterceptor 配套：成功走拦截器（{ code:0, data, timestamp }），
 * 失败走本过滤器（{ code, message, path, timestamp }），前端按 code 分流解包。
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@zhiyi/shared';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.resolveMessage(exception, status);

    // 非预期异常记录完整堆栈供排查，但不外泄给用户
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception);
    }

    const body: ApiError = {
      code: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(body);
  }

  /**
   * 提取可展示给用户的错误信息。
   * ValidationPipe 的错误 message 是数组，取第一条最具体的提示。
   */
  private resolveMessage(exception: unknown, status: number): string {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return '服务异常，请稍后再试';
    }
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') return res;
      if (typeof res === 'object' && res !== null) {
        const msg = (res as { message?: string | string[] }).message;
        if (Array.isArray(msg)) return msg[0];
        if (typeof msg === 'string') return msg;
      }
      return exception.message;
    }
    return '未知错误';
  }
}
