import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://localhost:4173/next/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.getByRole('button', { name: /^More/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Settings', exact: true }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/claude-0/y-settings.png' });
const fit = await page.evaluate(() => {
  const s = document.querySelector('section[aria-label]');
  const scrolls = getComputedStyle(s).overflowY === 'auto';
  let lowest = 0;
  for (const n of s.querySelectorAll('dd, span, p')) lowest = Math.max(lowest, n.getBoundingClientRect().bottom);
  return { scrolls, unreachable: scrolls ? 0 : Math.max(0, Math.round(lowest - s.getBoundingClientRect().bottom)) };
});
console.log('settings:', JSON.stringify(fit));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
