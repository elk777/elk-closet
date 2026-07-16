/**
 * AnthropicProvider：走 Anthropic 协议（/anthropic 端点）的 AI 实现。
 *
 * 用官方 @anthropic-ai/sdk，baseURL 指向网关的 /anthropic。
 * 识别走 vision：把衣物图 URL 作为 image 块 + 文本指令一起发，
 * 返回文本过共用的 parseRecognition（剥 markdown + Zod 校验）。
 */

import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RecognitionResult } from '@zhiyi/shared';
import type { AiConfig } from '../config/configuration';
import type { AiProvider, RecognizeInput } from './ai-provider.interface';
import {
  parseRecognition,
  RECOGNITION_SYSTEM_PROMPT,
  RECOGNITION_USER_PROMPT,
} from './recognition.prompt';

@Injectable()
export class AnthropicProvider implements AiProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService) {
    const ai = config.get<AiConfig>('ai')!;
    this.model = ai.anthropic.model;
    this.client = new Anthropic({
      apiKey: ai.anthropic.apiKey,
      baseURL: ai.anthropic.baseUrl,
      timeout: ai.timeoutMs,
    });
  }

  async recognize(input: RecognizeInput): Promise<RecognitionResult> {
    const raw = await this.callModel(input.imageUrl);
    return parseRecognition(raw);
  }

  /**
   * 调用 Anthropic messages 接口做 vision 识别。
   * @param imageUrl 衣物图 URL（走 image 块的 url 源）
   * @returns 模型返回的纯文本（期望为 JSON 串）
   */
  private async callModel(imageUrl: string): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: RECOGNITION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: RECOGNITION_USER_PROMPT },
          ],
        },
      ],
    });

    // 取第一个文本块作为返回
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Anthropic 返回中没有文本块');
    }
    return textBlock.text;
  }
}
