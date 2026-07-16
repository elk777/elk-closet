/**
 * AI 模块。
 *
 * 按 AI_PROVIDER 配置注入对应 Provider 实现（anthropic | openai），
 * 对外只暴露 AiService——业务模块注入 AiService 即可，
 * 换协议只改配置，不动任何业务代码（PRD 5.5.5）。
 */

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../config/configuration';
import { AI_PROVIDER, type AiProvider } from './ai-provider.interface';
import { AiService } from './ai.service';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';

@Module({
  providers: [
    AnthropicProvider,
    OpenAiProvider,
    AiService,
    {
      // 按配置选择当前生效的 Provider 实现
      provide: AI_PROVIDER,
      inject: [ConfigService, AnthropicProvider, OpenAiProvider],
      useFactory: (
        config: ConfigService,
        anthropic: AnthropicProvider,
        openai: OpenAiProvider,
      ): AiProvider => {
        const { provider } = config.get<AiConfig>('ai')!;
        return provider === 'openai' ? openai : anthropic;
      },
    },
  ],
  exports: [AiService],
})
export class AiModule {}
