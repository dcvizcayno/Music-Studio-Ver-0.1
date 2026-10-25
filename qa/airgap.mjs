import { chromium } from 'playwright';

const studio = process.env.STUDIO_URL || 'http://127.0.0.1:8000';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const external = new Set();

page.on('request', (req) => {
  const url = req.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  try {
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') external.add(url);
  } catch {
    // ignore malformed requests
  }
});

await page.goto(studio, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log(JSON.stringify({ studio, external: [...external] }, null, 2));
await browser.close();

if (external.size > 0) {
  console.error('Air-gap runtime audit FAILED: external request(s) observed.');
  process.exit(1);
}
console.log('Air-gap runtime audit: PASS');
