import { chromium } from 'playwright';
const [url, out] = process.argv.slice(2);
/*
 * The pinned playwright wants a browser build this image does not carry, and
 * `playwright install` is not available here — so point at the Chromium that
 * is installed. Full `chrome`, not `headless_shell`: the shell has no WebGL,
 * and a Babylon scene rendered without it is a blank rectangle.
 */
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 560, height: 780 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
try { await page.waitForFunction('window.__ready === true', { timeout: 20000 }); }
catch { console.log('NOT READY. errors:', errors.slice(0, 5)); }
// A couple of animation frames after ready, so the render loop has painted.
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
await page.screenshot({ path: out });
console.log('shot ->', out, errors.length ? `(errors: ${errors.slice(0,3).join(' | ')})` : '(no errors)');
await browser.close();
