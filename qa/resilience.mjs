import { chromium } from 'playwright';

const base = 'http://127.0.0.1:8000';
const payload = {
  title: 'Resume Resilience Test',
  lyrics: '[Verse]\nMorning light\n[Chorus]\nHold on',
  style_tags: 'English, warm acoustic pop, male vocal, 90 BPM',
  seed: 4242, steps: 8, cfg: 1.0, duration_seconds: 20,
  precision: '8bit', cot: 'off',
};
const created = await (await fetch(`${base}/api/songs/generate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
})).json();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate((job) => {
  localStorage.setItem('yue2_active_job', JSON.stringify({ id: job.id, title: job.title, type: job.type }));
}, created);
await page.reload({ waitUntil: 'networkidle' });

let banner = false;
try {
  await page.getByText('Generating Audio with YuE2').waitFor({ timeout: 15000 });
  banner = true;
} catch {}

// Simulate the idle/network drop that caused the disconnect.
await page.waitForTimeout(2000);
await context.setOffline(true);
await page.waitForTimeout(5000);
await context.setOffline(false);

let final = {};
for (let i = 0; i < 90; i++) {
  final = await (await fetch(`${base}/api/songs/${created.id}`)).json();
  if (['completed', 'failed', 'cancelled'].includes(final.status)) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(6000);
const body = await page.locator('body').innerText();
const audio = await page.locator('audio').count();
const disconnectMessage = body.includes('Progress stream disconnected');
await page.screenshot({ path: 'qa/reports/resilience.png', fullPage: true });
console.log(JSON.stringify({
  job: created.id, final_status: final.status, banner, audio,
  disconnectMessage, consoleErrors: errors.slice(0, 5),
}));
await browser.close();
