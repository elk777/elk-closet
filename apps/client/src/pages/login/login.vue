<template>
  <view class="login">
    <!-- 品牌区：与首页同一套标志与字体，让登录页看起来像应用的一部分而非拦截 -->
    <view class="brand">
      <image class="brand__logo" src="/static/logo-badge-new.png" mode="aspectFit" />
      <text class="brand__name">知衣</text>
      <text class="brand__slogan">把衣橱收进手机，每天替你搭一套</text>
    </view>

    <!-- 主体：说明「登录后能得到什么」，而不是只放一个按钮。
         审核关注用户是否知情、自愿，文案要让用途具体可见。 -->
    <view class="pitch">
      <view class="pitch__item">
        <text class="pitch__dot" />
        <!-- #ifdef MP-WEIXIN -->
        <text class="pitch__text">衣物、穿搭记录都归属你的微信账号</text>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <text class="pitch__text">衣物、穿搭记录都归属你的邮箱账号</text>
        <!-- #endif -->
      </view>
      <view class="pitch__item">
        <text class="pitch__dot" />
        <text class="pitch__text">换手机或重装，衣橱不会丢</text>
      </view>
      <view class="pitch__item">
        <text class="pitch__dot" />
        <!-- #ifdef MP-WEIXIN -->
        <text class="pitch__text">仅获取微信身份用于识别账号，不读取昵称头像</text>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <text class="pitch__text">只需邮箱验证码，不记录密码</text>
        <!-- #endif -->
      </view>
    </view>

    <!-- 唯一登录入口。用户必须主动点击才会调 uni.login——
         这是审核要求的「用户授权」动作，不能自动触发。 -->
    <view class="actions">
      <!-- #ifdef MP-WEIXIN -->
      <view class="btn" :class="{ 'btn--busy': loggingIn }" @click="onLogin">
        <text>{{ loggingIn ? '正在登录…' : '微信一键登录' }}</text>
      </view>
      <!-- #endif -->

      <!-- H5：邮箱验证码登录。两步交互（发码 → 验码），故与小程序分支结构不同 -->
      <!-- #ifndef MP-WEIXIN -->
      <view class="mailform">
        <input
          v-model="email"
          class="mailform__input"
          type="text"
          :disabled="verifying"
          placeholder="输入邮箱"
          @blur="onEmailBlur"
        />
        <view class="mailform__row">
          <input
            v-model="code"
            class="mailform__input mailform__input--code"
            type="number"
            maxlength="6"
            :disabled="verifying"
            placeholder="6 位验证码"
          />
          <view
            class="mailform__send"
            :class="{ 'mailform__send--dis': countdown > 0 || sending }"
            @click="onSendCode"
          >
            <text>{{
              sending ? '发送中…' : countdown > 0 ? `${countdown}s` : '获取验证码'
            }}</text>
          </view>
        </view>
        <view
          class="btn"
          :class="{ 'btn--busy': verifying }"
          @click="onEmailLogin"
        >
          <text>{{ verifying ? '正在登录…' : '登录 / 注册' }}</text>
        </view>
        <text class="mailform__hint">首次登录自动创建账号</text>
      </view>
      <!-- #endif -->

      <text class="agree">
        登录即表示同意
        <text class="agree__link" @click="showTerms">《用户协议》</text>
        与
        <text class="agree__link" @click="showPrivacy">《隐私政策》</text>
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 登录页：小程序审核要求的「用户主动授权」入口。
 *
 * 为什么需要这一页：微信已废弃 getUserProfile，静默 uni.login 建号用户全程无感，
 * 审核会判定为「未经授权收集用户信息」。合规做法是提供一个用户主动点击的按钮，
 * 点击后才执行登录。
 *
 * 设计取向：
 * - 不收集昵称/头像（那两者在设置页由用户自行选填），登录只换 openid
 * - 文案写清用途，不放「点击即同意」这类含糊表述
 * - 只有一个主按钮，不做手机号/密码等其它登录方式
 */
import { ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
// #ifndef MP-WEIXIN
import { sendEmailCode } from '../../api/auth.api';
// #endif
import { useUserStore } from '../../store/user';

const userStore = useUserStore();
/** 登录中：防连点重复调 uni.login（code 一次性，重复调用会浪费并发） */
const loggingIn = ref(false);

// ── H5 邮箱登录状态（整段用条件编译包裹，小程序包里不留这些符号）──
// #ifndef MP-WEIXIN
/** 输入的邮箱 */
const email = ref('');
/** 输入的验证码 */
const code = ref('');
/** 发码请求进行中 */
const sending = ref(false);
/** 登录请求进行中 */
const verifying = ref(false);
/** 发码冷却剩余秒数，>0 时按钮禁用并显示倒计时 */
const countdown = ref(0);
/** 倒计时定时器句柄，页面卸载时清理，避免切走后仍在跑 */
let countdownTimer: ReturnType<typeof setInterval> | null = null;

/** 邮箱格式的宽松校验：只挡明显错误的输入，最终以后端 IsEmail 为准 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// #endif

/**
 * 已登录时不应停留在登录页：直接放行到首页。
 *
 * 触发场景是从登录页返回键回到这里、或 reLaunch 时序竞争。
 * 不自动调 login——那会重新把静默登录带回来。
 */
onShow(() => {
  if (userStore.token && !loggingIn.value) {
    uni.reLaunch({ url: '/pages/index/index' });
  }
});

// #ifndef MP-WEIXIN
/** 页面卸载时清掉倒计时，防止定时器泄漏 */
onUnload(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

/** 输入框失焦时统一去空白并转小写，与后端归一化规则保持一致 */
function onEmailBlur() {
  email.value = email.value.trim().toLowerCase();
}

/** 启动 60 秒倒计时（与后端 EMAIL_COOLDOWN_SECONDS 对齐） */
function startCountdown(seconds: number) {
  countdown.value = seconds;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
}

/**
 * 获取验证码。
 *
 * 本地先校验邮箱格式再发请求：明显错误的输入不必往返一次后端，
 * 也能避免每天限流额度被自己的手误消耗掉。
 */
async function onSendCode() {
  if (sending.value || countdown.value > 0) return;
  const addr = email.value.trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) {
    uni.showToast({ title: '请输入正确的邮箱', icon: 'none' });
    return;
  }
  sending.value = true;
  try {
    await sendEmailCode(addr);
    startCountdown(60);
    uni.showToast({ title: '验证码已发送', icon: 'none' });
  } catch {
    // 请求器已按后端 message 弹出提示（限流/未启用等），此处不重复
  } finally {
    sending.value = false;
  }
}

/** H5 邮箱验证码登录 */
async function onEmailLogin() {
  if (verifying.value) return;
  const addr = email.value.trim().toLowerCase();
  if (!EMAIL_RE.test(addr)) {
    uni.showToast({ title: '请输入正确的邮箱', icon: 'none' });
    return;
  }
  if (!/^\d{6}$/.test(code.value)) {
    uni.showToast({ title: '请输入 6 位验证码', icon: 'none' });
    return;
  }
  verifying.value = true;
  try {
    await userStore.loginByEmail(addr, code.value);
    uni.reLaunch({ url: '/pages/index/index' });
  } catch {
    // 同 onSendCode：错误提示由请求器统一处理
  } finally {
    verifying.value = false;
  }
}
// #endif

/**
 * 用户点击登录（微信）。这是小程序端唯一的登录触发点。
 */
async function onLogin() {
  if (loggingIn.value) return;
  loggingIn.value = true;
  try {
    await userStore.login();
    // 登录成功回首页；首页 onShow 会走 ensureLogin 直接放行
    uni.reLaunch({ url: '/pages/index/index' });
  } catch {
    // 请求器/微信分支已给出具体提示，这里不再重复 toast
  } finally {
    loggingIn.value = false;
  }
}

/** 用户协议：暂用弹窗占位，上线前替换为正式内容 */
function showTerms() {
  uni.showModal({
    title: '用户协议',
    content: '知衣用于记录与管理个人衣物。数据仅存储于你的账号下，不会对外分享。',
    showCancel: false,
    confirmText: '我知道了',
  });
}

/**
 * 隐私政策：说明收集范围，与登录文案一致。
 *
 * 内容按平台分支：小程序只拿 openid，H5 只拿邮箱，两者的「收集了什么」
 * 完全不同，混写成一句会误导用户。
 */
function showPrivacy() {
  // 先落到变量再赋给 content：直接在对象字面量里写两个 content
  // 会被 vue-tsc 判为重复属性（它不处理条件编译注释）
  let content = '';
  // #ifdef MP-WEIXIN
  content =
    '登录时仅获取微信账号标识（openid）用于识别你的账号；不读取昵称、头像、通讯录等其它信息。昵称与头像可在设置页自行选填。衣物照片仅用于识别与展示，不会对外公开。';
  // #endif
  // #ifndef MP-WEIXIN
  content =
    '登录时仅通过邮箱验证码确认账号归属，不记录密码；邮箱仅用于登录与找回账号。昵称与头像可在设置页自行选填。衣物照片仅用于识别与展示，不会对外公开。';
  // #endif

  uni.showModal({
    title: '隐私政策',
    content,
    showCancel: false,
    confirmText: '我知道了',
  });
}
</script>

<style lang="scss">
.login {
  min-height: 100vh;
  background: $zy-bg;
  padding: 120rpx 48rpx 60rpx;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}
.brand__logo {
  width: 168rpx;
  height: 168rpx;
  border-radius: 40rpx;
}
.brand__name {
  font-size: 44rpx;
  font-weight: 700;
  color: $zy-ink;
  letter-spacing: 4rpx;
}
.brand__slogan {
  font-size: 26rpx;
  color: $zy-ink-2;
}

.pitch {
  margin-top: 96rpx;
  display: flex;
  flex-direction: column;
  gap: 32rpx;
}
.pitch__item {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}
.pitch__dot {
  width: 10rpx;
  height: 10rpx;
  margin-top: 14rpx;
  border-radius: 50%;
  background: $zy-ink-3;
  flex: 0 0 auto;
}
.pitch__text {
  flex: 1;
  font-size: 28rpx;
  line-height: 1.6;
  color: $zy-ink-2;
}

.actions {
  margin-top: auto;
  padding-top: 80rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28rpx;
}
.btn {
  width: 100%;
  height: 96rpx;
  border-radius: $zy-radius-pill;
  background: $zy-accent;
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn--busy {
  opacity: 0.6;
}

/* ── H5 邮箱登录表单 ── */
.mailform {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.mailform__input {
  width: 100%;
  height: 96rpx;
  padding: 0 32rpx;
  box-sizing: border-box;
  border-radius: $zy-radius-pill;
  background: #fff;
  border: 2rpx solid $zy-line;
  font-size: 30rpx;
  color: $zy-ink;
}
.mailform__row {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
/* 验证码输入占满剩余宽度，发送按钮固定宽度不被挤压 */
.mailform__input--code {
  flex: 1;
  min-width: 0;
}
.mailform__send {
  flex: 0 0 auto;
  height: 96rpx;
  padding: 0 32rpx;
  border-radius: $zy-radius-pill;
  border: 2rpx solid $zy-accent;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: $zy-accent;
  white-space: nowrap;
}
/* 冷却中 / 请求中：视觉弱化，点击由脚本层拦截 */
.mailform__send--dis {
  opacity: 0.45;
  border-color: $zy-ink-3;
  color: $zy-ink-3;
}
.mailform__hint {
  font-size: 22rpx;
  color: $zy-ink-3;
  text-align: center;
}
.agree {
  font-size: 22rpx;
  color: $zy-ink-3;
  text-align: center;
  line-height: 1.6;
}
.agree__link {
  color: $zy-ink-2;
}
</style>