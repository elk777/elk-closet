/**
 * AnthropicProvider：走 Anthropic 协议（/anthropic 端点）的 AI 实现。
 *
 * 用官方 @anthropic-ai/sdk，baseURL 指向网关的 /anthropic。
 * 识别走 vision：把衣物图 URL 作为 image 块 + 文本指令一起发，
 * 返回文本过共用的 parseRecognition（剥 markdown + Zod 校验）。
 */

import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type {
  GuessOutfitResult,
  RecognitionResult,
  RecommendInput,
  RecommendOutput,
} from '@zhiyi/shared';
import type {
  AiClientOptions,
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

export class AnthropicProvider implements AiProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;

  constructor(options: AiClientOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      // 显式置空 authToken：SDK 默认会读环境变量 ANTHROPIC_AUTH_TOKEN，
      // 自动附加 `Authorization: Bearer` 头。开发机若装了 Claude Code
      // 等工具会注入该变量，导致本请求同时带上「我们的 x-api-key」与
      // 「别处的 Bearer token」，网关优先认后者 → 401 → 推荐静默降级为 empty。
      // 只走 x-api-key 单一鉴权，杜绝环境变量串味。
      authToken: null,
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
    });
  }

  /**
   * 从 messages.create 的返回里稳健地取出第一个文本块内容。
   *
   * 为什么不直接 `message.content.find(...)`：部分兼容网关（如本项目用的
   * mimo 网关）响应 Content-Type 不是 application/json，@anthropic-ai/sdk
   * 遇到这种情况不会反序列化，而是把整个响应体作为「字符串」原样返回。
   * 此时 message 是 string、message.content 为 undefined，直接 .find 会抛
   * `Cannot read properties of undefined`，整条推荐/识别链静默降级。
   * 这里兼容两种形态：标准对象走 content 数组；字符串则先 JSON.parse 再取。
   *
   * @param message messages.create 的返回（可能是 Message 对象或 JSON 字符串）
   * @returns 第一个文本块的 text
   * @throws Error 无法解析出文本块时
   */
  private extractText(message: unknown): string {
    let msg = message;
    // 网关把响应当纯文本返回时，SDK 交回一个字符串——先自行反序列化。
    if (typeof msg === 'string') {
      const raw = msg;
      try {
        msg = JSON.parse(raw) as unknown;
      } catch {
        throw new Error(`Anthropic 返回无法解析为 JSON：${raw.slice(0, 200)}`);
      }
    }
    const content = (msg as { content?: unknown })?.content;
    if (!Array.isArray(content)) {
      throw new Error('Anthropic 返回中没有 content 数组');
    }
    const textBlock = content.find(
      (b): b is { type: 'text'; text: string } =>
        !!b && (b as { type?: string }).type === 'text' &&
        typeof (b as { text?: unknown }).text === 'string',
    );
    if (!textBlock) {
      throw new Error('Anthropic 返回中没有文本块');
    }
    return textBlock.text;
  }

  async recognize(
    input: RecognizeInput,
    model: string,
  ): Promise<RecognitionResult> {
    const raw = await this.callModel(input.imageUrl, model);
    return parseRecognition(raw);
  }

  async recommend(
    input: RecommendInput,
    model: string,
  ): Promise<RecommendOutput> {
    const message = await this.client.messages.create({
      model,
      // 推荐是结构化 JSON 任务，无需模型长篇推理。关掉 thinking：
      // 推理型模型（如 mimo）默认会先输出大段思考再出正文，实测单次耗时
      // 从 ~26s 降到 ~3.5s，是今日推荐超时的主因。关思考后正文很短，
      // max_tokens 1024 已足够（思考不再占预算，无截断风险）。
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: RECOMMEND_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildRecommendUserPrompt(input) },
      ],
    });

    return parseRecommend(this.extractText(message));
  }

  async guessOutfitItems(
    input: GuessOutfitInput,
    model: string,
  ): Promise<GuessOutfitResult> {
    // 多图内容块：打卡照在前，其后每个候选「先文本标注 id/简述，再贴图」，
    // 让模型能把视觉命中对应回具体 id。
    const content: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: GUESS_OUTFIT_USER_PROMPT },
      { type: 'text', text: '【今日穿搭照】' },
      { type: 'image', source: { type: 'url', url: input.photoUrl } },
    ];
    for (const c of input.candidates) {
      content.push({ type: 'text', text: `候选 id=${c.id}：${c.brief}` });
      content.push({ type: 'image', source: { type: 'url', url: c.imageUrl } });
    }

    const message = await this.client.messages.create({
      model,
      max_tokens: 1024,
      system: GUESS_OUTFIT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    return parseGuessOutfit(this.extractText(message));
  }

  /**
   * 调用 Anthropic messages 接口做 vision 识别。
   * @param imageUrl 衣物图 URL（走 image 块的 url 源）
   * @param model 使用的模型名
   * @returns 模型返回的纯文本（期望为 JSON 串）
   */
  private async callModel(imageUrl: string, model: string): Promise<string> {
    const message = await this.client.messages.create({
      model,
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
    return this.extractText(message);
  }
}
