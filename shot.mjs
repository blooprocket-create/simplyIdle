import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4173/next/', { waitUntil: 'networkidle' });
const offer = page.locator('[role="alertdialog"]');
for (let i = 0; i < 200; i++) { if (await offer.count()) break; await page.waitForTimeout(100); }
const boxes = await page.evaluate(() => {
  const pick = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  const r = n => n && ({ top: Math.round(n.top), bottom: Math.round(n.bottom) });
  return { offer: r(pick('[role="alertdialog"]')), burst: r(pick('[aria-label^="Burst"]')), shelf: r(pick('nav[aria-label="Main"]')) };
});
console.log(JSON.stringify(boxes));
const { offer: o, burst: b, shelf: s } = boxes;
if (o && b) console.log('offer/burst overlap px:', Math.round(o.bottom - b.top));
if (b && s) console.log('burst/shelf overlap px:', Math.round(b.bottom - s.top));
await page.screenshot({ path: '/tmp/claude-0/w-stacked.png' });
await browser.close();
