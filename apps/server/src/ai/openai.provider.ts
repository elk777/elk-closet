/**
 * OpenAiProvider：走 OpenAI 兼容协议（/v1 端点）的 AI 实现。
 *
 * 用官方 openai SDK，baseURL 指向网关的 /v1。
 * 识别走 vision：把衣物图 URL 作为 image_url 内容 + 文本指令一起发，
 * 开 response_format=json_object 让模型只吐 JSON，返回文本过共用 parseRecognition。
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  GuessOutfitResult,
  RecognitionResult,
  RecommendInput,
  RecommendOutput,
} from '@zhiyi/shared';
import type { AiConfig } from '../config/configuration';
import type {
  AiProvider,
  GuessOutfitInput,
  RecognizeInput,
} from './ai-provider.interface';
import {
  parseRecognition,
  RECOGNITION_SYSTEM_PROMPT,
  RECOGNITION_USER_PROMPT,
} from './recognition.prompt';
import {
  buildRecommendUserPrompt,
  parseRecommend,
  RECOMMEND_SYSTEM_PROMPT,
} from './recommend.prompt';
import {
  GUESS_OUTFIT_SYSTEM_PROMPT,
  GUESS_OUTFIT_USER_PROMPT,
  parseGuessOutfit,
} from './guess-outfit.prompt';

@Injectable()
export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: ConfigService) {
    const ai = config.get<AiConfig>('ai')!;
    this.model = ai.openai.model;
    this.client = new OpenAI({
      apiKey: ai.openai.apiKey,
      baseURL: ai.openai.baseUrl,
      timeout: ai.timeoutMs,
    });
  }

  async recognize(input: RecognizeInput): Promise<RecognitionResult> {
    const raw = await this.callModel(input.imageUrl);
    return parseRecognition(raw);
  }

  async recommend(input: RecommendInput): Promise<RecommendOutput> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      // 推理模型的思考过程与正文共用预算，给足以免 JSON 被截断（Unterminated）
      max_tokens: 4000,
      // 强制 JSON 输出，与 prompt 里的「只返回 JSON」双保险
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RECOMMEND_SYSTEM_PROMPT },
        { role: 'user', content: buildRecommendUserPrompt(input) },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI 返回中没有文本内容');
    }
    return parseRecommend(text);
  }

  async guessOutfitItems(
    input: GuessOutfitInput,
  ): Promise<GuessOutfitResult> {
    // 多图内容块：打卡照在前，其后每个候选「先文本标注 id/简述，再贴图」，
    // 让模型能把视觉命中对应回具体 id。
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: GUESS_OUTFIT_USER_PROMPT },
      { type: 'text', text: '【今日穿搭照】' },
      { type: 'image_url', image_url: { url: input.photoUrl } },
    ];
    for (const c of input.candidates) {
      content.push({ type: 'text', text: `候选 id=${c.id}：${c.brief}` });
      content.push({ type: 'image_url', image_url: { url: c.imageUrl } });
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GUESS_OUTFIT_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI 返回中没有文本内容');
    }
    return parseGuessOutfit(text);
  }

  /**
   * 调用 OpenAI chat.completions 做 vision 识别。
   * @param imageUrl 衣物图 URL（走 image_url 内容块）
   * @returns 模型返回的纯文本（期望为 JSON 串）
   */
  private async callModel(imageUrl: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      // 强制 JSON 输出，与 prompt 里的「只返回 JSON」双保险
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RECOGNITION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: RECOGNITION_USER_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('OpenAI 返回中没有文本内容');
    }
    return text;
  }
}
