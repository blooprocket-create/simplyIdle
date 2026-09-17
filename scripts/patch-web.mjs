/**
 * Post-build script: patches dist/index.html for mobile web and social previews.
 * Run after `npx expo export --platform web`.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';

const filePath = 'dist/index.html';
/*
 * The Expo app answers at /legacy since the Phase 5 swap, so its canonical
 * URL and preview image have to say so. Left pointing at the bare origin it
 * would tell crawlers that the old game *is* the site root — which is now the
 * rewrite — and its `og:image` would resolve to a path that no longer exists,
 * because the preview files are copied next to this shell and this shell
 * moved.
 */
const baseUrl = 'https://simply-idle.vercel.app/legacy';
const previewImageSource = 'assets/social-preview.jpg';
const previewImageFallbackSource = 'assets/social-preview.png';
const previewImageFileName = 'social-preview.jpg';
const previewImageFallbackFileName = 'social-preview.png';
const pageTitle = 'Simply Idle';
const pageDescription =
  'Idle RPG / incremental auto-battler. Build your roster, push deeper waves, and rebirth stronger.';
const previewImageUrl = `${baseUrl}/${previewImageFileName}`;
const canonicalUrl = `${baseUrl}/`;
const legacyMobileCss = `
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

function stripMarkedBlock(html, startMarker, endMarker) {
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`\\s*${escapedStart}[\\s\\S]*?${escapedEnd}\\s*`, 'g'), '\n');
}

function requireReplace(html, pattern, replacement, errorMessage) {
  if (!pattern.test(html)) {
    throw new Error(errorMessage);
  }

  return html.replace(pattern, replacement);
}

if (!existsSync(previewImageSource)) {
  throw new Error(`Missing social preview asset at ${previewImageSource}`);
}

copyFileSync(previewImageSource, `dist/${previewImageFileName}`);

if (existsSync(previewImageFallbackSource)) {
  copyFileSync(previewImageFallbackSource, `dist/${previewImageFallbackFileName}`);
}

let html = readFileSync(filePath, 'utf8');

html = stripMarkedBlock(html, '<!-- simplyidle-mobile-meta:start -->', '<!-- simplyidle-mobile-meta:end -->');
html = stripMarkedBlock(html, '<!-- simplyidle-social-meta:start -->', '<!-- simplyidle-social-meta:end -->');
html = stripMarkedBlock(html, '/* simplyidle-mobile-css:start */', '/* simplyidle-mobile-css:end */');
html = html.replace(legacyMobileCss, '');

html = html.replace(/\s*<meta name="apple-mobile-web-app-capable"[^>]*>\s*/g, '\n');
html = html.replace(/\s*<meta name="apple-mobile-web-app-status-bar-style"[^>]*>\s*/g, '\n');
html = html.replace(/\s*<meta name="mobile-web-app-capable"[^>]*>\s*/g, '\n');
html = html.replace(/\s*<meta name="theme-color"[^>]*>\s*/g, '\n');
html = html.replace(/\s*<meta name="apple-touch-fullscreen"[^>]*>\s*/g, '\n');
html = html.replace(/\s*<meta name="description"[^>]*>\s*/g, '\n');
html = html.replace(/\s*<meta property="og:[^"]+"[^>]*>\s*/g, '\n');
html = html.replace(/\s*<meta name="twitter:[^"]+"[^>]*>\s*/g, '\n');
html = html.replace(/\s*<link rel="canonical"[^>]*>\s*/g, '\n');
html = html.replace(/\n{3,}/g, '\n\n');

html = requireReplace(
  html,
  /<title>[\s\S]*?<\/title>/,
  `    <title>${pageTitle}</title>`,
  'Could not find a <title> tag in dist/index.html.',
);

const mobileMeta = [
  '    <!-- simplyidle-mobile-meta:start -->',
  '    <meta name="apple-mobile-web-app-capable" content="yes" />',
  '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '    <meta name="mobile-web-app-capable" content="yes" />',
  '    <meta name="theme-color" content="#060B12" />',
  '    <meta name="apple-touch-fullscreen" content="yes" />',
  '    <!-- simplyidle-mobile-meta:end -->',
].join('\n');

const socialMeta = [
  '    <!-- simplyidle-social-meta:start -->',
  `    <meta name="description" content="${pageDescription}" />`,
  `    <link rel="canonical" href="${canonicalUrl}" />`,
  '    <meta property="og:type" content="website" />',
  `    <meta property="og:site_name" content="${pageTitle}" />`,
  `    <meta property="og:title" content="${pageTitle}" />`,
  `    <meta property="og:description" content="${pageDescription}" />`,
  `    <meta property="og:url" content="${canonicalUrl}" />`,
  `    <meta property="og:image" content="${previewImageUrl}" />`,
  `    <meta property="og:image:secure_url" content="${previewImageUrl}" />`,
  '    <meta property="og:image:type" content="image/jpeg" />',
  '    <meta property="og:image:width" content="1200" />',
  '    <meta property="og:image:height" content="630" />',
  '    <meta property="og:image:alt" content="Simply Idle social preview featuring legendary hero art." />',
  '    <meta name="twitter:card" content="summary_large_image" />',
  `    <meta name="twitter:title" content="${pageTitle}" />`,
  `    <meta name="twitter:description" content="${pageDescription}" />`,
  `    <meta name="twitter:image" content="${previewImageUrl}" />`,
  '    <meta name="twitter:image:type" content="image/jpeg" />',
  '    <meta name="twitter:image:alt" content="Simply Idle social preview featuring legendary hero art." />',
  '    <!-- simplyidle-social-meta:end -->',
].join('\n');

const mobileCss = `
      /* simplyidle-mobile-css:start */
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
      /* iOS Safari 100dvh fix */
      html { height: -webkit-fill-available; }
      body, #root { min-height: -webkit-fill-available; }
      #root { overflow: visible; }
      /* simplyidle-mobile-css:end */`;

html = requireReplace(
  html,
  /(\s*<meta\s+name="viewport")/,
  `\n${mobileMeta}\n$1`,
  'Could not find the viewport meta tag in dist/index.html.',
);

html = requireReplace(
  html,
  /(<title>[^<]*<\/title>)/,
  `$1\n${socialMeta}`,
  'Could not inject social meta tags into dist/index.html.',
);

html = requireReplace(
  html,
  /<\/style>/,
  `${mobileCss}\n    </style>`,
  'Could not find the expo-reset style block in dist/index.html.',
);

writeFileSync(filePath, html, 'utf8');
console.log(`Patched ${filePath} and copied ${previewImageFileName} for social previews.`);
