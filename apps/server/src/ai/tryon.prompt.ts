/**
 * AI 试穿的共用 prompt 构造（PRD 4.6）。
 *
 * 与识别/推荐不同，试穿是图像编辑任务：输入「一张全身照 + 该套单品图」，
 * 让模型把这些衣服合成到人物身上。prompt 只需一段自然语言编辑指令，
 * 无需 JSON 契约（输出是图，不是结构化文本）。
 *
 * 关键约束写进指令：保留人物样貌/体型/背景，只换衣着，输出单张写实上身图。
 */

import type { TryOnInput } from '@zhiyi/shared';

/**
 * 构造试穿的图像编辑指令。
 *
 * 首图恒为用户全身照，其后依次为各单品图；指令告诉模型把这些单品穿到
 * 第一张图的人物身上。带上单品简述与场合/风格软约束，提升合成贴合度。
 * @param input 试穿输入（全身照 + 单品 + 可选场合/风格）
 * @returns 传给图像模型的编辑指令文本
 */
export function buildTryOnPrompt(input: TryOnInput): string {
  const pieces = input.items
    .map((it, i) => `  ${i + 2}. ${it.brief || '一件服饰'}`)
    .join('\n');

  const constraints = [
    input.occasion ? `场合：${input.occasion}` : '',
    input.style ? `风格：${input.style}` : '',
  ]
    .filter(Boolean)
    .join('；');

  return `这是一组图片：第 1 张是一个人的全身照，之后的每张各是一件服饰单品。
请把这些单品自然地穿到第 1 张照片里的人物身上，生成一张写实的上身效果图。

单品清单：
${pieces}

严格要求：
1. 保留第 1 张照片里人物的样貌、发型、体型与背景，只改变身上的衣着。
2. 衣服的版型、颜色、材质尽量还原各单品图，穿着自然贴合、符合真实穿搭层次。
3. 输出单张完整的全身上身效果图，写实风格，不要拼图、不要文字水印。${
    constraints ? `\n4. 整体气质贴合——${constraints}。` : ''
  }`;
}
