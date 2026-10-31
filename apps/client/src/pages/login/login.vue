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
        <text class="pitch__text">衣物、穿搭记录都归属你的微信账号</text>
      </view>
      <view class="pitch__item">
        <text class="pitch__dot" />
        <text class="pitch__text">换手机或重装，衣橱不会丢</text>
      </view>
      <view class="pitch__item">
        <text class="pitch__dot" />
        <text class="pitch__text">仅获取微信身份用于识别账号，不读取昵称头像</text>
      </view>
    </view>

    <!-- 唯一登录入口。用户必须主动点击才会调 uni.login——
         这是审核要求的「用户授权」动作，不能自动触发。 -->
    <view class="actions">
      <view class="btn" :class="{ 'btn--busy': loggingIn }" @click="onLogin">
        <text>{{ loggingIn ? '正在登录…' : '微信一键登录' }}</text>
      </view>
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
import { onShow } from '@dcloudio/uni-app';
import { useUserStore } from '../../store/user';

const userStore = useUserStore();
/** 登录中：防连点重复调 uni.login（code 一次性，重复调用会浪费并发） */
const loggingIn = ref(false);

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

/**
 * 用户点击登录。这是唯一的登录触发点。
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

/** 隐私政策：说明收集范围，与登录文案一致 */
function showPrivacy() {
  uni.showModal({
    title: '隐私政策',
    content:
      '登录时仅获取微信账号标识（openid）用于识别你的账号；不读取昵称、头像、通讯录等其它信息。昵称与头像可在设置页自行选填。衣物照片仅用于识别与展示，不会对外公开。',
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