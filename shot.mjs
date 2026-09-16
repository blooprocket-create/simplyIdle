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
await page.getByRole('button', { name: 'Achievements', exact: true }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/claude-0/x-achievements.png' });

// Is any card title still being clipped rather than wrapped?
const clipped = await page.evaluate(() =>
  [...document.querySelectorAll('article')]
    .map(a => a.firstElementChild?.firstElementChild)
    .filter(t => t && t.scrollWidth > t.clientWidth + 1)
    .map(t => t.textContent).slice(0, 5));
console.log('clipped titles:', clipped.length ? clipped : 'none');
await page.getByRole('button', { name: 'Close' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^ROSTER/i }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/claude-0/x-roster.png' });
const clipped2 = await page.evaluate(() =>
  [...document.querySelectorAll('article')]
    .map(a => a.firstElementChild?.firstElementChild)
    .filter(t => t && t.scrollWidth > t.clientWidth + 1)
    .map(t => t.textContent).slice(0, 5));
console.log('roster clipped titles:', clipped2.length ? clipped2 : 'none');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
