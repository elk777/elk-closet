/**
 * AuthService：登录与签发 JWT。
 *
 * 两个入口：
 * - devLogin：开发/联调用，无需微信环境，固定或指定测试用户直接拿 token
 * - wxMiniLogin：微信小程序静默登录（PRD 4.9），code 换 openid 后建号发 token
 *
 * 两条路径最终都落到 UserService.findOrCreate，保证同一身份稳定映射到同一 user。
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../prisma/client';
import type { AppConfig, WxConfig } from '../config/configuration';
import { UserService } from '../user/user.service';
import type { JwtPayload } from './jwt-payload.interface';

/** 开发登录用的固定测试身份，保证多次登录拿到同一账号 */
const DEV_OPENID = 'dev-openid-local';

/** 微信 jscode2session 接口地址 */
const JSCODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

/** 微信接口超时：偶尔会慢，8s 足够，再久就当鉴权失败让前端重试 */
const WX_REQUEST_TIMEOUT_MS = 8000;

/** jscode2session 响应中本项目关心的字段（session_key 不入库，不取） */
interface Jscode2sessionResult {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 微信错误码 → 面向用户的文案。
 *
 * 40029 / 40163 是 code 无效或已被使用，用户重开小程序即可，属「过期」；
 * 其余（45011 频率限制、-1 系统繁忙）是服务侧波动，文案上不做区分，
 * 避免把内部细节暴露给用户。
 * @param errcode 微信返回的错误码
 */
function wxErrorMessage(errcode: number): string {
  if (errcode === 40029 || errcode === 40163) {
    return '登录已过期，请重新进入小程序';
  }
  return '微信登录失败，请重试';
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 生产环境缺微信凭证直接拒绝启动。
   *
   * 放在启动期而非首次登录时：配置缺失是部署错误，不该等到用户点开小程序
   * 才发现全站登不上。与 dev-login 的「生产禁用」配对——生产必须走真登录。
   */
  onModuleInit() {
    const app = this.config.get<AppConfig>('app')!;
    if (!app.isProduction) return;
    const wx = this.config.get<WxConfig>('wx')!;
    if (!wx.appid || !wx.secret) {
      throw new Error(
        '生产环境缺少 WX_APPID / WX_SECRET，微信小程序登录无法工作',
      );
    }
  }

  /**
   * 开发登录：无需微信环境，直接建/取一个本地测试用户并发 token。
   * @param openid 可选，指定测试身份以模拟多用户；缺省用固定 DEV_OPENID
   * @returns token 与用户
   */
  async devLogin(openid?: string) {
    const user = await this.users.findOrCreate({
      wxMiniOpenid: openid ?? DEV_OPENID,
    });
    return this.buildAuthResult(user);
  }

  /**
   * 微信小程序静默登录（PRD 4.9）：code → openid → 建号发 JWT。
   *
   * 失败一律抛 UnauthorizedException：登录是鉴权动作，不能按「可降级」处理
   * （规则见 error-handling.md——外部服务波动才降级，鉴权失败要明确告知）。
   * @param code wx.login 拿到的临时登录凭证
   * @returns token 与用户
   */
  async wxMiniLogin(code: string) {
    const wx = this.config.get<WxConfig>('wx')!;
    if (!wx.appid || !wx.secret) {
      throw new UnauthorizedException('微信登录未配置');
    }

    const data = await this.callJscode2session(wx.appid, wx.secret, code);
    if (data.errcode || !data.openid) {
      // 只记错误码不记 code / openid（logging-guidelines 的硬约束）
      this.logger.warn(
        `微信 jscode2session 失败 errcode=${data.errcode ?? 'unknown'}`,
      );
      throw new UnauthorizedException(
        wxErrorMessage(data.errcode ?? -1),
      );
    }

    const user = await this.users.findOrCreate({
      wxMiniOpenid: data.openid,
      ...(data.unionid ? { unionid: data.unionid } : {}),
    });
    return this.buildAuthResult(user);
  }

  /**
   * 调微信 jscode2session 换 openid。
   *
   * 网络异常与超时统一按登录失败处理：微信侧不返回业务错误码时，前端能做的
   * 也只有重试，没必要区分。
   * @param appid 小程序 AppID
   * @param secret 小程序 AppSecret
   * @param code wx.login 拿到的临时凭证
   * @returns 微信响应（errcode 存在即失败）
   */
  private async callJscode2session(
    appid: string,
    secret: string,
    code: string,
  ): Promise<Jscode2sessionResult> {
    const url = new URL(JSCODE2SESSION_URL);
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(WX_REQUEST_TIMEOUT_MS),
      });
      return (await res.json()) as Jscode2sessionResult;
    } catch (err) {
      this.logger.warn(`微信 jscode2session 请求失败：${String(err)}`);
      throw new UnauthorizedException('微信登录失败，请重试');
    }
  }

  /**
   * 邮箱验证码登录（H5 端）。
   *
   * 验证码校验由 EmailCodeService 完成，这里只负责「验证通过后建号发票」。
   * 拆开的理由：验证码的生成、限流、消费是独立的一整套状态机，
   * 塞进 AuthService 会让本类同时管「身份」和「临时凭证」两件事。
   * @param email 已验证归属的邮箱
   * @returns token 与用户（与微信登录同一返回结构，前端无需分支处理）
   */
  async emailLogin(email: string) {
    const user = await this.users.findOrCreateByEmail(email);
    return this.buildAuthResult(user);
  }

  /** 用用户主键签发 JWT（secret / 有效期已在 JwtModule 注册时配好） */
  private buildAuthResult(user: User) {
    const payload: JwtPayload = { sub: user.id };
    const token = this.jwt.sign(payload);
    return { token, user };
  }
}
