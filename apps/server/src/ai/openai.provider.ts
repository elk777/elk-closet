/**
 * OpenAiProvider：走 OpenAI 兼容协议（/v1 端点）的 AI 实现。
 *
 * 用官方 openai SDK，baseURL 指向网关的 /v1。
 * 识别走 vision：把衣物图 URL 作为 image_url 内容 + 文本指令一起发，
 * 开 response_format=json_object 让模型只吐 JSON，返回文本过共用 parseRecognition。
 */

import OpenAI, { toFile } from 'openai';
import { ProxyAgent } from 'undici';
import type {
  GuessOutfitResult,
  RecognitionResult,
  RecommendInput,
  RecommendOutput,
  TryOnInput,
  TryOnResult,
} from '@zhiyi/shared';
import type {
  AiClientOptions,
  AiProvider,
  GuessOutfitInput,
  RecognizeInput,
} from './ai-provider.interface';
import {
  parseRecognition,
  buildRecognitionSystemPrompt,
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
import { buildTryOnPrompt } from './tryon.prompt';

export class OpenAiProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(options: AiClientOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
      // 渠道配了代理才挂 dispatcher：图像渠道（gpt-image-2）本机需走代理直连，
      // 生产直连时不配此字段即原样走系统网络。代理仅作用于本渠道 client。
      // 关键：undici 主版本必须与 Node 内置 undici 一致（package.json 已锁 ^7），
      // 否则 ProxyAgent 与全局 fetch 的 dispatch 协议错配，报「Connection error」。
      // 不要改传 fetch: undici.fetch 来绕——那会让 images.edit 的 multipart 上传
      // 因全局 FormData 与 undici Response 不同源而被 SDK 拒绝。
      // 类型收口：@types/node 内置的 undici-types 与安装的 undici 类型标注冲突，
      // 运行时行为正确。
      ...(options.proxyUrl
        ? {
            fetchOptions: {
              dispatcher: new ProxyAgent(options.proxyUrl),
            } as OpenAI.RequestOptions['fetchOptions'],
          }
        : {}),
    });
  }

  async recognize(
    input: RecognizeInput,
    model: string,
  ): Promise<RecognitionResult> {
    const raw = await this.callModel(input, model);
    return parseRecognition(raw);
  }

  async recommend(
    input: RecommendInput,
    model: string,
  ): Promise<RecommendOutput> {
    const completion = await this.client.chat.completions.create({
      model,
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
    model: string,
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
      model,
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
   * @param input 衣物图 URL + 用户品类候选集（拼进 system prompt）
   * @param model 使用的模型名
   * @returns 模型返回的纯文本（期望为 JSON 串）
   */
  private async callModel(
    input: RecognizeInput,
    model: string,
  ): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model,
      // 推理型模型（国产系普遍）思考链与正文共用预算，1024 会被思考吃光
      // 致 finish_reason=length、content 为空。与 recommend 对齐给到 4000。
      max_tokens: 4000,
      // 强制 JSON 输出，与 prompt 里的「只返回 JSON」双保险
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildRecognitionSystemPrompt(input.categories) },
        {
          role: 'user',
          content: [
            { type: 'text', text: RECOGNITION_USER_PROMPT },
            { type: 'image_url', image_url: { url: input.imageUrl } },
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

  /**
   * AI 试穿：全身照作底图 + 各单品图，走 images.edit 一次合成上身效果。
   *
   * gpt-image-2 支持多图 edit（最多 16 张）：第一张作人物底图，其余为要穿的单品。
   * 图片 URL 是又拍云公开 CDN，直连抓取（不走渠道代理——代理只为连图像 API 网关）。
   * @param input 全身照 + 本套单品图 + 可选场合/风格
   * @param model 图像模型名（如 gpt-image-2）
   * @returns 合成上身图的 base64（不含 data: 前缀）
   */
  async tryOn(input: TryOnInput, model: string): Promise<string> {
    // 底图在前、单品图在后：与 prompt 的「第一张是人物、其余是单品」表述对应
    const files = await Promise.all([
      this.urlToFile(input.bodyPhotoUrl, 'body'),
      ...input.items.map((it, i) => this.urlToFile(it.imageUrl, `item-${i}`)),
    ]);

    const res = await this.client.images.edit({
      model,
      image: files,
      prompt: buildTryOnPrompt(input),
    });

    // 两种返回形态都要兼容：小图常直接给 b64_json，大图不少网关会转存 CDN
    // 只回 url（省响应体）。统一收敛成 b64 交上层落对象存储。
    const first = res.data?.[0];
    if (first?.b64_json) {
      return first.b64_json;
    }
    if (first?.url) {
      const resp = await fetch(first.url);
      if (!resp.ok) {
        throw new Error(`抓取试穿结果图失败(${resp.status})：${first.url}`);
      }
      return Buffer.from(await resp.arrayBuffer()).toString('base64');
    }
    throw new Error('图像模型既未返回 b64_json 也未返回 url');
  }

  /**
   * 抓取图片 URL 转成 SDK 可上传的 File（multipart）。
   * @param url 公开可访问的图片 URL
   * @param name 文件名（仅标识用，扩展名让服务端按 content-type 判断）
   */
  private async urlToFile(
    url: string,
    name: string,
  ): Promise<Awaited<ReturnType<typeof toFile>>> {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`抓取试穿图失败(${resp.status})：${url}`);
    }
    const type = resp.headers.get('content-type') ?? 'image/jpeg';
    const buf = Buffer.from(await resp.arrayBuffer());
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    return toFile(buf, `${name}.${ext}`, { type });
  }
}
