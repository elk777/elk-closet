/**
 * WeatherService：取实时天气，供今日推荐用（PRD 4.5）。
 *
 * 对接和风天气实时天气接口（now），输出映射到 shared 的 RecommendWeather。
 * 设计原则——天气是推荐的「增强项」而非「前置依赖」：
 * - 未配置 apiKey / apiHost：直接返回 null，上层按季节降级出推荐，不报错
 * - 取值失败（网络/额度/鉴权）：记日志并返回 null，同样降级
 * 绝不因天气挂掉而阻断整条推荐链路。
 *
 * 鉴权方式：和风新版账号走专属 apiHost + apiKey（请求头 X-QW-Api-Key）。
 * 若账号仍用旧的 key 查询参数方式，只需改本文件 fetchNow 的鉴权处即可。
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RecommendWeather } from '@zhiyi/shared';
import type { WeatherConfig } from '../config/configuration';

/** 和风实时天气 now 接口的关注字段（其余字段忽略） */
interface QWeatherNowResponse {
  /** '200' 为成功，其余为错误码 */
  code: string;
  now?: {
    /** 实测温度 ℃（字符串） */
    temp: string;
    /** 体感温度 ℃（字符串） */
    feelsLike: string;
    /** 天气描述，如「多云」 */
    text: string;
    /** 降水量 mm（字符串） */
    precip: string;
  };
}

/** 天气缓存有效期：实时天气变化缓慢，10 分钟内同一地点复用，避免每次进页面都打和风 */
const WEATHER_TTL_MS = 10 * 60 * 1000;

/** 单次和风请求超时：天气仅为增强项，超过 5s 即放弃降级，不拖垮推荐链路 */
const WEATHER_TIMEOUT_MS = 5000;

/** 单条缓存：命中的天气 + 写入时刻 */
interface WeatherCacheEntry {
  weather: RecommendWeather;
  at: number;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly config: WeatherConfig;

  /**
   * 按地点缓存最近一次天气（内存级）。
   * key 为归一化坐标（两位小数），同一片区域共享一条，进一步减少调用。
   */
  private readonly cache = new Map<string, WeatherCacheEntry>();

  constructor(configService: ConfigService) {
    this.config = configService.get<WeatherConfig>('weather')!;
  }

  /** 天气服务是否已配置（apiHost + apiKey 齐全才算可用） */
  private get enabled(): boolean {
    return Boolean(this.config.apiHost && this.config.apiKey);
  }

  /**
   * 取指定坐标的实时天气；坐标缺省时用配置的兜底城市。
   * @param lon 经度；不传用 defaultLon
   * @param lat 纬度；不传用 defaultLat
   * @returns 映射后的天气；未配置或取值失败时返回 null（上层降级）
   */
  async getCurrent(
    lon?: number,
    lat?: number,
  ): Promise<RecommendWeather | null> {
    if (!this.enabled) return null;

    const longitude = lon ?? this.config.defaultLon;
    const latitude = lat ?? this.config.defaultLat;

    // 缓存命中且未过期：直接复用，不打和风
    const key = `${longitude.toFixed(2)},${latitude.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < WEATHER_TTL_MS) {
      return cached.weather;
    }

    try {
      const weather = await this.fetchNow(longitude, latitude);
      this.cache.set(key, { weather, at: Date.now() });
      return weather;
    } catch (e) {
      this.logger.warn(`取天气失败，推荐将按季节降级：${String(e)}`);
      // 取值失败时兜底用过期缓存（有总比没有强），彻底没有才返回 null
      return cached?.weather ?? null;
    }
  }

  /**
   * 调和风实时天气 now 接口并映射为 RecommendWeather。
   * @param lon 经度
   * @param lat 纬度
   * @returns 映射后的天气
   * @throws 网络异常 / 非 200 业务码 / 缺 now 字段时抛错，由 getCurrent 兜底
   */
  private async fetchNow(
    lon: number,
    lat: number,
  ): Promise<RecommendWeather> {
    // 和风 location 参数为「经度,纬度」，最多两位小数
    const location = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    // 归一化 host：容忍填写时漏写协议（补 https://）与末尾斜杠
    const host = this.normalizeHost(this.config.apiHost);
    const url = `${host}/v7/weather/now?location=${location}`;

    // 天气是推荐的「增强项」，绝不能因和风卡住而拖垮整条推荐链路，
    // 故 5s 超时即放弃（超时抛错，由 getCurrent 兜底为过期缓存或 null 降级）。
    const res = await fetch(url, {
      headers: { 'X-QW-Api-Key': this.config.apiKey },
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`和风天气 HTTP ${res.status}`);
    }

    const body = (await res.json()) as QWeatherNowResponse;
    if (body.code !== '200' || !body.now) {
      throw new Error(`和风天气业务码 ${body.code}`);
    }

    const now = body.now;
    return {
      temp: Number(now.temp),
      feels: Number(now.feelsLike),
      // now 接口不含紫外线指数，本期先留空描述（推荐 prompt 不强依赖）
      uv: '',
      // 降水量>0 视为有雨；now 无概率字段，用有无降水近似为 0/1
      rain: Number(now.precip) > 0 ? 1 : 0,
      desc: now.text,
    };
  }

  /**
   * 归一化 apiHost：容忍配置里漏写协议或多写末尾斜杠。
   * 和风账号专属域名默认走 HTTPS，未写协议时补 https://。
   * @param raw 原始配置值
   * @returns 形如 https://xxx.qweatherapi.com 的规范前缀
   */
  private normalizeHost(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
}
