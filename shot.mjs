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

async function open(rail, label, file) {
  if (rail) {
    await page.getByRole('button', { name: /^More/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: label, exact: true }).click();
  } else {
    await page.getByRole('button', { name: new RegExp(`^${label}`, 'i') }).first().click();
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/claude-0/v-${file}.png` });
  const fit = await page.evaluate(() => {
    const s = document.querySelector('section[aria-label]');
    const scrolls = getComputedStyle(s).overflowY === 'auto';
    let lowest = 0;
    for (const n of s.querySelectorAll('dd, span, p')) lowest = Math.max(lowest, n.getBoundingClientRect().bottom);
    return { scrolls, clipped: Math.round(lowest - s.getBoundingClientRect().bottom) };
  });
  const clock = await page.locator('header').first().locator('span').last().innerText();
  console.log(`${file}: scrolls=${fit.scrolls} unreachable=${fit.scrolls ? 0 : Math.max(0, fit.clipped)}px clock=${clock}`);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(250);
}

await open(false, 'CHARACTER', 'character');
await open(false, 'CAMPAIGN', 'campaign');
await open(false, 'ROSTER', 'roster');
await open(true, 'Party', 'party');
await open(true, 'Codex', 'codex');
await open(true, 'Equipment', 'unbuilt');
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
