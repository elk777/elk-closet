/**
 * 部署前配置体检：只解析 env 文件并做完整性检查，不连接任何服务。
 *
 * 为什么单独做成脚本：部署失败时人眼比对 env 极易漏项，而错误表现又都是
 * 模糊的「认证失败 / 连不上」，全靠猜。这里把「解析出来的到底是什么」直接
 * 打出来——尤其是密码是否含 URL 特殊字符（最常见的认证失败根因）。
 *
 * 用法（在 apps/server 目录下）：
 *   NODE_ENV=production node scripts/deploy-check.mjs
 */
import fs from 'node:fs';

// 与 config.module.ts 完全一致的加载顺序（靠前的优先）
const files = ['.env.production.local', '.env.local', '.env.production', '.env'];
const env = {};
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(`  跳过（不存在）: ${f}`); continue; }
  let n = 0;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in env)) { env[k] = v; n++; }
  }
  console.log(`  读到 ${n} 项: ${f}`);
}

const bad = [];
const mask = (s) => (!s ? '(空)' : s[0] + '*'.repeat(Math.max(0, s.length - 1)));
const isSecret = (k) => /SECRET|KEY|PASSWORD|TOKEN/.test(k);

console.log('\n── 数据库 ──');
const url = env.DATABASE_URL;
let u = null;
if (!url) {
  console.log('  DATABASE_URL: (空) ❌');
  bad.push('DATABASE_URL 没读到');
} else {
  try { u = new URL(url); } catch (e) { bad.push('DATABASE_URL 不是合法 URL：' + e.message); }
}
if (u) {
  const pwd = decodeURIComponent(u.password);
  console.log(`  用户名 : ${u.username}`);
  console.log(`  密码   : ${mask(pwd)}（长度 ${pwd.length}）`);
  console.log(`  主机   : ${u.hostname}`);
  console.log(`  端口   : ${u.port || '(未写，会回落 5432)'}`);
  console.log(`  库名   : ${u.pathname.replace(/^\//, '') || '(空)'}`);
  if (!pwd) bad.push('数据库密码为空');
  if (/[@:/?#\[\]]/.test(pwd)) bad.push('⚠️ 密码含 URL 特殊字符（@ : / ? # [ ]），必须 URL 编码，否则一定认证失败');
  if (u.hostname === 'localhost') bad.push('主机写的是 localhost，可能解析到 IPv6 ::1，建议改 127.0.0.1');
  if (!u.port) bad.push('连接串没写端口，会连 5432 —— 面板映射的端口通常不是这个');
}

console.log('\n── Redis ──');
console.log(`  HOST     : ${env.REDIS_HOST || '(未配，默认 localhost)'}`);
console.log(`  PORT     : ${env.REDIS_PORT || '(未配，默认 6379)'}`);
console.log(`  PASSWORD : ${mask(env.REDIS_PASSWORD)}`);
if (env.REDIS_HOST === 'redis') bad.push('⚠️ REDIS_HOST=redis 是 compose 服务名，宿主机解析不到，必须改 127.0.0.1');
if (!env.REDIS_PASSWORD) bad.push('REDIS_PASSWORD 为空（若容器设了密码，这里必须一致）');

console.log('\n── 必填项 ──');
for (const k of ['JWT_SECRET', 'WX_APPID', 'WX_SECRET', 'UPYUN_BUCKET', 'UPYUN_OPERATOR', 'UPYUN_PASSWORD', 'UPYUN_DOMAIN', 'RESEND_API_KEY', 'MAIL_FROM']) {
  const v = env[k];
  console.log(`  ${k}: ${v ? (isSecret(k) ? mask(v) : v) : '(空) ❌'}`);
  if (!v) bad.push(`${k} 为空`);
}

console.log('\n── AI 渠道与路由 ──');
const chReg = /^AI_CHANNEL_(.+?)__(PROTOCOL|BASE_URL|API_KEY)$/;
const chans = {};
for (const [k, v] of Object.entries(env)) {
  const m = chReg.exec(k);
  if (m) { (chans[m[1].toLowerCase()] ||= {})[m[2]] = v; }
}
const names = Object.keys(chans);
console.log(`  渠道: ${names.length ? names.join(', ') : '(无) ❌'}`);
if (!names.length) bad.push('一个 AI 渠道都没配');
for (const [n, c] of Object.entries(chans)) {
  if (!c.API_KEY) bad.push(`AI_CHANNEL_${n.toUpperCase()}__API_KEY 为空`);
  if (!['anthropic', 'openai'].includes(c.PROTOCOL)) bad.push(`AI_CHANNEL_${n.toUpperCase()}__PROTOCOL 必须是 anthropic 或 openai`);
}
for (const ab of ['RECOGNIZE', 'RECOMMEND', 'GUESS', 'TRYON']) {
  const c = (env[`AI_ROUTE_${ab}__CHANNEL`] || '').trim().toLowerCase();
  const m = (env[`AI_ROUTE_${ab}__MODEL`] || '').trim();
  console.log(`  ${ab.padEnd(9)}: ${c || '(空) ❌'} / ${m || '(空) ❌'}`);
  if (!c) bad.push(`AI_ROUTE_${ab}__CHANNEL 为空`);
  else if (!names.includes(c)) bad.push(`AI_ROUTE_${ab}__CHANNEL 指向不存在的渠道「${c}」`);
  if (!m) bad.push(`AI_ROUTE_${ab}__MODEL 为空`);
}

console.log('\n========== 结论 ==========');
if (bad.length) {
  console.log(`发现 ${bad.length} 个问题，逐条改完再重跑本脚本：`);
  bad.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
  process.exitCode = 1;
} else {
  console.log('✅ 全部通过，可以去跑迁移：');
  console.log('   NODE_ENV=production pnpm --filter @zhiyi/server exec prisma migrate deploy');
}
