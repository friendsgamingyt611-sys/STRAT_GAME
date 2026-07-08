/**
 * main.js — entry point
 */
import { Game } from './Game.js';
import { UI }   from './UI.js';

window.addEventListener('DOMContentLoaded', async () => {
  const game = new Game();
  const ui   = new UI(game);
  window.__game = game;
  window.__ui   = ui;

  // Phone and ARM CPU architecture detection
  const isPhone = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 600;
  
  let isArm = false;
  // 1. Check navigator.platform / userAgent for ARM signatures
  const platform = (navigator.platform || '').toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (/arm|aarch64|arm64/i.test(platform) || /arm|aarch64|arm64/i.test(ua)) {
    isArm = true;
  }
  // Almost all iPhones/iPads/Android phones run ARM architecture
  if (/iphone|ipad|android/i.test(ua)) {
    isArm = true;
  }

  // 2. High-entropy userAgentData check (modern Chrome/Edge)
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      const values = await navigator.userAgentData.getHighEntropyValues(['architecture']);
      if (values.architecture && /arm|aarch64/i.test(values.architecture)) {
        isArm = true;
      }
    } catch (_) {}
  }

  // Apply specific phone UI if phone and arm detected
  if (isPhone && isArm) {
    document.body.classList.add('phone-arm-ui');
    console.log('[SOS] Phone & ARM architecture detected. Phone UI enabled.');
  }
});
