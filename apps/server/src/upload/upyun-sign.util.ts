/**
 * 又拍云表单 API 直传签名（新版 operator 鉴权）。
 *
 * 用途：后端只算「授权凭证」交给前端，前端拿它直传又拍云——
 * operator 密码永不下发，且用 policy 把上传目录/大小/有效期锁死，防前端乱传。
 *
 * 签名规则（又拍云表单 API 新版鉴权，官方文档）：
 *   Authorization = "UPYUN <operator>:<signature>"
 *   signature = Base64(HMAC-SHA1(md5(password), signString))
 *   signString = 各元素以 & 连接，空元素跳过：Method & URI & Date & Policy & Content-MD5
 * 表单直传不发 Date / Content-MD5，故实际为 Method & URI & Policy。
 */

import { createHash, createHmac } from 'node:crypto';

/** 生成签名所需的入参 */
export interface UpyunSignParams {
  bucket: string;
  operator: string;
  password: string;
  /** 保存路径（含目录前缀与文件名），如 garments/uxxx/abc.jpg */
  saveKey: string;
  /** 签名过期的 Unix 时间戳（秒） */
  expiration: number;
  /** 允许的文件体积上限（字节），写进 policy 由又拍云强制 */
  maxFileSize: number;
}

/** 前端直传所需的全部凭证 */
export interface UpyunSignResult {
  /** 表单 POST 目标地址 */
  uploadUrl: string;
  /** base64 policy，作为表单字段 */
  policy: string;
  /** 授权串 "UPYUN operator:signature"，作为表单字段 */
  authorization: string;
  /** 最终保存路径，供前端回传后端入库 */
  saveKey: string;
}

/** 又拍云表单 API 上传域名 */
const UPYUN_FORM_ENDPOINT = 'https://v0.api.upyun.com';

/**
 * 计算又拍云表单直传的 policy 与 authorization。
 * @param params 桶/操作员/密码/保存路径/有效期/大小上限
 * @returns 前端直传所需凭证（不含明文密码）
 */
export function makeUpyunFormSign(params: UpyunSignParams): UpyunSignResult {
  const { bucket, operator, password, saveKey, expiration, maxFileSize } =
    params;

  // policy：又拍云据此强制保存路径、有效期与体积上限
  const policyObject = {
    bucket,
    'save-key': saveKey,
    expiration,
    'content-length-range': `0,${maxFileSize}`,
  };
  const policy = Buffer.from(JSON.stringify(policyObject)).toString('base64');

  const method = 'POST';
  const uri = `/${bucket}`;
  // 表单直传不带 Date / Content-MD5，签名串仅 Method & URI & Policy
  const signString = [method, uri, policy].join('&');

  // 密码先 md5 作为 HMAC 密钥（又拍云新版鉴权约定）
  const secret = createHash('md5').update(password).digest('hex');
  const signature = createHmac('sha1', secret)
    .update(signString)
    .digest('base64');

  return {
    uploadUrl: `${UPYUN_FORM_ENDPOINT}/${bucket}`,
    policy,
    authorization: `UPYUN ${operator}:${signature}`,
    saveKey,
  };
}
