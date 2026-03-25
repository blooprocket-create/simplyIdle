/**
 * Post-build script: patches dist/index.html for mobile web.
 * Run after `npx expo export --platform web`.
 */
import { readFileSync, writeFileSync } from 'fs';

const filePath = 'dist/index.html';
let html = readFileSync(filePath, 'utf8');

// ── 1. PWA / mobile meta tags ─────────────────────────────────────────────────
const mobileMeta = [
  '    <meta name="apple-mobile-web-app-capable" content="yes" />',
  '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '    <meta name="mobile-web-app-capable" content="yes" />',
  '    <meta name="theme-color" content="#060B12" />',
  '    <meta name="apple-touch-fullscreen" content="yes" />',
].join('\n');

html = html.replace(
  /(\s*<meta\s+name="viewport")/,
  '\n' + mobileMeta + '\n$1'
);

// ── 2. Mobile interaction CSS (injected inside the expo-reset <style> block) ──
const mobileCss = `
      /* ── Mobile web fixes ───────────────────────────────────────────── */
  /* Keep sizing predictable without disabling native scroll gestures */
  * { box-sizing: border-box; }
      /* Kill the grey/blue tap-highlight flash on iOS/Android Chrome */
      * { -webkit-tap-highlight-color: transparent; }
  /* Allow vertical page scrolling on mobile browsers */
  html, body { min-height: 100%; height: 100%; overflow-x: hidden; overflow-y: auto; }
  body {
    touch-action: pan-y pinch-zoom;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
      /* iOS Safari 100dvh fix — address bar eats space */
      html { height: -webkit-fill-available; }
  body, #root { min-height: -webkit-fill-available; }
  #root { overflow: visible; }`;

// Insert just before the closing </style> of the expo-reset block
html = html.replace('</style>', mobileCss + '\n    </style>');

writeFileSync(filePath, html, 'utf8');
console.log('✅  dist/index.html patched for mobile web');
