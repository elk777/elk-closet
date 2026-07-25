/**
 * AI 模块。
 *
 * 按渠道表构建「渠道名 → Provider 实例」注册表（AI_CHANNELS）：
 * 每个渠道按其协议 new 出对应协议的 Provider（client 固定 baseUrl/apiKey），
 * model 由能力路由在调用时传入。对外只暴露 AiService——业务模块注入 AiService，
 * 换模型/换渠道只改 env，不动任何业务代码（PRD 5.5.5）。
 */

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../config/configuration';
import { AI_CHANNELS, type AiProvider } from './ai-provider.interface';
import { AiService } from './ai.service';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';

@Module({
  providers: [
    AiService,
    {
      // 渠道注册表：启动时按渠道表逐条 new 出 Provider 实例
      provide: AI_CHANNELS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Map<string, AiProvider> => {
        const ai = config.get<AiConfig>('ai')!;
        const channels = new Map<string, AiProvider>();
        for (const [name, ch] of Object.entries(ai.channels)) {
          const options = {
            baseUrl: ch.baseUrl,
            apiKey: ch.apiKey,
            timeoutMs: ai.timeoutMs,
            proxyUrl: ch.proxyUrl,
          };
          channels.set(
            name,
            ch.protocol === 'openai'
              ? new OpenAiProvider(options)
              : new AnthropicProvider(options),
          );
        }
        return channels;
      },
    },
  ],
  exports: [AiService],
})
export class AiModule {}
