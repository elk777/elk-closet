/**
 * MailService：验证码邮件发送。
 *
 * 选 Resend 的理由：免费额度（3000 封/月）足够个人项目，域名已验证即可
 * 用自己的域名发信，API 极简。备选 Brevo 免域名也能发，但发件人显示第三方
 * 域名，容易进垃圾箱。
 *
 * 可用性契约与 Redis 一致：**未配置不阻断启动**。
 * isConfigured() 为 false 时，上层返回「邮箱登录未启用」，而不是让整个服务起不来。
 * 未配置的场景包括：本地开发、CI、以及暂时不想开邮件功能的部署。
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { MailConfig } from '../config/configuration';

/** 验证码邮件主题 */
const SUBJECT = '【知衣】登录验证码';

/**
 * 发信失败时抛出的错误类型。
 *
 * 单独定义而非直接抛 Error：上层据此决定提示文案（「验证码发送失败」）
 * 与其他异常区分开，避免把内部错误信息漏给用户。
 */
export class MailSendError extends Error {
  constructor(cause: unknown) {
    super('验证码发送失败，请稍后重试');
    this.name = 'MailSendError';
    this.cause = cause;
  }
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: Resend | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const { apiKey, from } = config.get<MailConfig>('mail')!;
    this.from = from;
    // 两项都齐全才建 client：只有 apiKey 没有 from 会导致发信被 Resend 拒绝，
    // 与其运行时才失败，不如启动时就判定为「未启用」
    this.client = apiKey && from ? new Resend(apiKey) : null;
  }

  /**
   * 邮件功能是否可用（apiKey 与发件人均已配置）。
   * @returns 可用为 true
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * 发送验证码邮件。
   *
   * **不重试**：用户就坐在页面上，点一次「重新发送」比后台静默重试更符合预期，
   * 也避免重试期间限流计数被绕过。邮件服务商偶发失败是正常波动，交给用户处理即可。
   * @param to 收件邮箱
   * @param code 6 位数字验证码
   * @throws MailSendError 未配置或发送失败
   */
  async sendVerificationCode(to: string, code: string): Promise<void> {
    if (!this.client) {
      throw new MailSendError(new Error('邮件服务未配置'));
    }

    try {
      const { error } = await this.client.emails.send({
        from: this.from,
        to,
        subject: SUBJECT,
        html: buildHtml(code),
        // 纯文本兜底：部分邮件客户端禁用 HTML，不提供 text 会显示空白
        text: `你的知衣登录验证码是 ${code}，10 分钟内有效。如非本人操作请忽略本邮件。`,
      });

      if (error) {
        // 只记错误类型与简要信息，不记验证码本身（logging-guidelines 硬约束）
        this.logger.warn(
          `验证码邮件发送失败：${error.name ?? 'unknown'} - ${error.message ?? ''}`,
        );
        throw new MailSendError(error);
      }
    } catch (err) {
      if (err instanceof MailSendError) throw err;
      this.logger.warn(`验证码邮件发送异常：${String(err)}`);
      throw new MailSendError(err);
    }
  }
}

/**
 * 验证码邮件正文（HTML）。
 *
 * 内联样式而非 class：邮件客户端普遍剥离 `<style>`，只有内联样式可靠。
 * 版式取项目的简约中性色，与小程序/H5 视觉保持一致。
 * @param code 6 位验证码
 * @returns HTML 字符串
 */
function buildHtml(code: string): string {
  return `
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:16px;padding:40px 32px;">
            <tr>
              <td align="center" style="padding-bottom:8px;">
                <span style="font-size:20px;font-weight:700;color:#2b2b2b;letter-spacing:2px;">知衣</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:28px;">
                <span style="font-size:14px;color:#8a8a8a;">登录验证码</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:28px;">
                <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:8px;color:#2b2b2b;background:#f6f5f2;border-radius:12px;padding:16px 24px;">${code}</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:8px;">
                <span style="font-size:13px;color:#8a8a8a;line-height:1.7;">验证码 10 分钟内有效，请勿转发给他人。</span>
              </td>
            </tr>
            <tr>
              <td align="center">
                <span style="font-size:13px;color:#8a8a8a;line-height:1.7;">如非本人操作，忽略本邮件即可。</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}