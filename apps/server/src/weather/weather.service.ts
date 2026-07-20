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
    /** 相对湿度 %（字符串） */
    humidity?: string;
    /** 风向，如「东南风」 */
    windDir?: string;
    /** 风力等级，如「2」 */
    windScale?: string;
    /** 降水量 mm（字符串） */
    precip: string;
  };
}

/** 和风 GeoAPI 城市查询接口的关注字段（其余字段忽略） */
interface QWeatherGeoResponse {
  /** '200' 为成功 */
  code?: string;
  location?: Array<{
    /** 地点名（区县级），如「朝阳」「西湖」 */
    name?: string;
    /** 上级行政区（地级市），如「北京」「杭州」 */
    adm2?: string;
  }>;
}

/** 天气缓存有效期：实时天气变化缓慢，10 分钟内同一地点复用，避免每次进页面都打和风 */
const WEATHER_TTL_MS = 10 * 60 * 1000;

/**
 * 城市名缓存有效期：同一坐标对应的城市名几乎恒定，故缓存极长（7 天），
 * 一个位置基本只查一次 GeoAPI，把额外调用量压到可忽略（省费用）。
 */
const CITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 单次和风请求超时：天气仅为增强项，超过 5s 即放弃降级，不拖垮推荐链路 */
const WEATHER_TIMEOUT_MS = 5000;

/** 单条缓存：命中的天气 + 写入时刻 */
interface WeatherCacheEntry {
  weather: RecommendWeather;
  at: number;
}

/** 城市名缓存条目：反查到的城市名 + 写入时刻 */
interface CityCacheEntry {
  city: string;
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

  /**
   * 按坐标缓存反查到的城市名（内存级）。
   * 同一坐标城市名几乎不变，故 TTL 极长（CITY_TTL_MS），一个位置基本只查一次 GeoAPI。
   */
  private readonly cityCache = new Map<string, CityCacheEntry>();

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
      // 天气与城市名并行取：城市名走独立长缓存，失败不影响天气主体（city 留空即可）
      const [weather, city] = await Promise.all([
        this.fetchNow(longitude, latitude),
        this.getCityName(longitude, latitude),
      ]);
      const merged: RecommendWeather = { ...weather, city };
      this.cache.set(key, { weather: merged, at: Date.now() });
      return merged;
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
    const precip = Number(now.precip);
    return {
      temp: Number(now.temp),
      feels: Number(now.feelsLike),
      // now 接口不含紫外线指数，本期不展示紫外线，留空描述（推荐 prompt 不强依赖）
      uv: '',
      // 降水量>0 视为有雨；now 无概率字段，用有无降水近似为 0/1（供推荐 prompt）
      rain: precip > 0 ? 1 : 0,
      desc: now.text,
      // 以下为展示增强字段（now 已返回，透传给前端天气卡，不额外调接口）
      humidity: now.humidity !== undefined ? Number(now.humidity) : undefined,
      windDir: now.windDir,
      windScale: now.windScale,
      // 实测降水量 mm，供前端合理展示（区别于上面近似的 0/1 概率）
      precip: Number.isNaN(precip) ? undefined : precip,
      // city 由 getCurrent 合并填入（走独立 GeoAPI + 长缓存）
      city: '',
    };
  }

  /**
   * 反查坐标对应的城市名（和风 GeoAPI）。
   *
   * 城市名对同一坐标几乎恒定，按坐标长缓存（CITY_TTL_MS），一个位置基本只查一次，
   * 额外调用量可忽略。查询失败不抛错——城市名是展示增强项，返回空串由前端隐去即可，
   * 绝不因城市名拖累天气主体。
   * @param lon 经度
   * @param lat 纬度
   * @returns 城市名；失败或无结果返回空串
   */
  private async getCityName(lon: number, lat: number): Promise<string> {
    const key = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    const cached = this.cityCache.get(key);
    if (cached && Date.now() - cached.at < CITY_TTL_MS) {
      return cached.city;
    }

    try {
      const host = this.normalizeHost(this.config.apiHost);
      const location = `${lon.toFixed(2)},${lat.toFixed(2)}`;
      const url = `${host}/geo/v2/city/lookup?location=${location}`;
      const res = await fetch(url, {
        headers: { 'X-QW-Api-Key': this.config.apiKey },
        signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`GeoAPI HTTP ${res.status}`);
      }

      const body = (await res.json()) as QWeatherGeoResponse;
      // 取首个匹配地点的地级市名（adm2，如「北京」「杭州」）。
      // 不用 name（区县级）：和风坐标反查上限两位小数（~1.1km），城区边界会落到相邻区，
      // 显示区县名易出错（朝阳→东城）；地级市粒度稳定且与天气数据粒度一致。name 仅作兜底。
      const first = body.location?.[0];
      const city = first?.adm2 ?? first?.name ?? '';
      this.cityCache.set(key, { city, at: Date.now() });
      return city;
    } catch (e) {
      // 城市名失败不影响天气：记日志、返回空串（前端隐去城市名）
      this.logger.warn(`反查城市名失败，城市名将留空：${String(e)}`);
      return cached?.city ?? '';
    }
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
