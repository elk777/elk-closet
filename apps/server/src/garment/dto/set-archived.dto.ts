/**
 * 标记 / 取消衣物闲置入参（PRD 4.3 详情页操作 · 4.8 断舍离清单钩子）。
 *
 * 只承载一个布尔：archived=true 进断舍离清单，false 移出。
 * 单独成 DTO 而非直接收裸布尔，走全局 ValidationPipe 统一在边界校验。
 */

import { IsBoolean } from 'class-validator';

export class SetArchivedDto {
  /** 是否闲置：true 标记闲置，false 取消 */
  @IsBoolean()
  archived!: boolean;
}
