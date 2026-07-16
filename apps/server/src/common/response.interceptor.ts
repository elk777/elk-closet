/**
 * 全局响应拦截器：把 controller 返回值包成统一成功信封（PRD 5.6）。
 *
 * controller 只管返回业务数据，拦截器统一包成 ApiSuccess<T>：{ code:0, data, timestamp }，
 * 前端一律按 ApiResponse 解包，不用为每个接口猜返回结构。
 * 失败分支由 HttpExceptionFilter 包成 ApiError，两者共同覆盖 ApiResponse 联合。
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { ApiSuccess } from '@zhiyi/shared';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiSuccess<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0 as const,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
