/**
 * 打卡预猜入参（PRD 4.7 系统预猜）。
 *
 * 只需一张打卡照 URL：后端取该用户在库未闲置衣物作候选，
 * 连同打卡照交给 AI 做多图视觉比对，返回命中的衣物 id。
 */

import { IsUrl } from 'class-validator';

export class GuessOutfitDto {
  /** 打卡美照 URL（前端直传对象存储后回传） */
  @IsUrl({}, { message: 'photoUrl 必须是合法 URL' })
  photoUrl!: string;
}
