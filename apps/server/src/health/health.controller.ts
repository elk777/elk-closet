import { Controller, Get } from '@nestjs/common';
import { CATEGORIES } from '@zhiyi/shared';

/**
 * 健康检查。
 *
 * 除了探活，这里刻意引用了 @zhiyi/shared 的 CATEGORIES，
 * 用来验证 monorepo 的共享包链接在后端侧真正生效——
 * 若 workspace 配置有误，此处会在编译期直接报错，提前暴露问题。
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      time: new Date().toISOString(),
      /** 回显共享包内置分类模板的数量，确认 shared 包已正确加载（品类运行时白名单在用户分类表） */
      categories: CATEGORIES.length,
    };
  }
}
