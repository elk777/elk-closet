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
  ScreenshotExtractResult,
  TryOnInput,
} from '@zhiyi/shared';
import type {
  AiCallOptions,
  AiClientOptions,
  AiProvider,
  GuessOutfitInput,
  RecognizeInput,
  ScreenshotExtractInput,
} from './ai-provider.interface';
import {
  parseRecognition,
  buildRecognitionSystemPrompt,
  RECOGNITION_USER_PROMPT,
} from './recognition.prompt';
import {
  buildScreenshotExtractSystemPrompt,
  parseScreenshotExtract,
  SCREENSHOT_EXTRACT_USER_PROMPT,
} from './screenshot-extract.prompt';
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
   * 能力级调用选项 → SDK 的 per-request 选项。
   *
   * 配了紧超时就同时关掉 SDK 内建重试（默认 2 次）：重试会把能力的
   * 超时预算翻三倍，且 AiService 已有主备兜底，原地重试无增量价值。
   * 未配则返回 undefined，走 client 默认（AI_TIMEOUT_MS + 默认重试）。
   */
  private requestOptions(
    opts?: AiCallOptions,
  ): Anthropic.RequestOptions | undefined {
    return opts?.timeoutMs
      ? { timeout: opts.timeoutMs, maxRetries: 0 }
      : undefined;
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
    opts?: AiCallOptions,
  ): Promise<RecognitionResult> {
    const raw = await this.callModel(input, model, opts);
    return parseRecognition(raw);
  }

  async extractScreenshot(
    input: ScreenshotExtractInput,
    model: string,
    opts?: AiCallOptions,
  ): Promise<ScreenshotExtractResult> {
    // 多张截图同一次调用（同一件商品信息互补），url source 由 Anthropic 侧抓取
    const content: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: SCREENSHOT_EXTRACT_USER_PROMPT },
      ...input.imageUrls.map(
        (url): Anthropic.ContentBlockParam => ({
          type: 'image',
          source: { type: 'url', url },
        }),
      ),
    ];

    const message = await this.client.messages.create(
      {
        model,
        max_tokens: 1024,
        system: buildScreenshotExtractSystemPrompt(input.categories),
        messages: [{ role: 'user', content }],
      },
      this.requestOptions(opts),
    );

    return parseScreenshotExtract(this.extractText(message));
  }

  async recommend(
    input: RecommendInput,
    model: string,
    opts?: AiCallOptions,
  ): Promise<RecommendOutput> {
    const message = await this.client.messages.create(
      {
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
      },
      this.requestOptions(opts),
    );

    return parseRecommend(this.extractText(message));
  }

  async guessOutfitItems(
    input: GuessOutfitInput,
    model: string,
    opts?: AiCallOptions,
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

    const message = await this.client.messages.create(
      {
        model,
        max_tokens: 1024,
        system: GUESS_OUTFIT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      },
      this.requestOptions(opts),
    );

    return parseGuessOutfit(this.extractText(message));
  }

  /**
   * 试穿：Anthropic 协议无图像编辑能力，显式抛错。
   *
   * 保留此实现只为满足 AiProvider 接口完整——试穿必须路由到支持图像编辑的
   * 渠道（如 OpenAI 协议下的图像模型）。误配到本渠道时启动虽能通过，
   * 调用即抛错，由上层降级为「试穿生成失败」，不静默出错图。
   */
  tryOn(): Promise<string> {
    return Promise.reject(
      new Error('Anthropic 协议不支持图像编辑，试穿请路由到图像生成渠道'),
    );
  }

  /**
   * 调用 Anthropic messages 接口做 vision 识别。
   * @param input 衣物图 URL + 用户品类候选集（拼进 system prompt）
   * @param model 使用的模型名
   * @param opts 单次调用选项（能力级超时等）
   * @returns 模型返回的纯文本（期望为 JSON 串）
   */
  private async callModel(
    input: RecognizeInput,
    model: string,
    opts?: AiCallOptions,
  ): Promise<string> {
    const message = await this.client.messages.create(
      {
        model,
        max_tokens: 1024,
        system: buildRecognitionSystemPrompt(input.categories),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: input.imageUrl } },
              { type: 'text', text: RECOGNITION_USER_PROMPT },
            ],
          },
        ],
      },
      this.requestOptions(opts),
    );

    return this.extractText(message);
  }
}
