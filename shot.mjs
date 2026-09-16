import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://localhost:4173/next/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const control = () => page.locator('[aria-label^="Burst"]');
console.log('charging:', await control().getAttribute('aria-label'));
await page.screenshot({ path: '/tmp/claude-0/b-charging.png' });

// Wait for the window to arm.
for (let i = 0; i < 120; i++) {
  const label = await control().getAttribute('aria-label');
  if (label && label.includes('ready')) break;
  await page.waitForTimeout(250);
}
console.log('armed:', await control().getAttribute('aria-label'));
await page.screenshot({ path: '/tmp/claude-0/b-armed.png' });

// Poll until the control says "Now", then press — the player's job.
let pressedAt = null;
for (let i = 0; i < 80; i++) {
  const label = await control().getAttribute('aria-label');
  if (label && label.includes('Now')) { pressedAt = label; break; }
  await page.waitForTimeout(40);
}
console.log('pressed on:', pressedAt);
if (pressedAt) {
  await page.screenshot({ path: '/tmp/claude-0/b-peak.png' });
  await control().click();
  await page.waitForTimeout(300);
  console.log('after press:', await control().getAttribute('aria-label'));
  await page.screenshot({ path: '/tmp/claude-0/b-spent.png' });
}
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
