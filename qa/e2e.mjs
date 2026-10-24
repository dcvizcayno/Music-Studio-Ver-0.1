import { chromium } from 'playwright';

const url = process.env.QA_URL || 'http://127.0.0.1:8000';
const errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

let tabs = [];
let fileInput = 0;
let loaded = false;
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByText('YuE2 Song Studio').first().waitFor({ timeout: 10000 });
  loaded = true;
  for (const label of ['Text to Song', 'Cover Studio', 'Library', 'System Status', 'Settings']) {
    const count = await page.getByText(label, { exact: true }).count();
    if (count > 0) tabs.push(label);
  }
  await page.getByText('Cover Studio', { exact: true }).first().click();
  await page.waitForTimeout(600);
  fileInput = await page.locator('input[type="file"]').count();
} catch (error) {
  errors.push(String(error));
} finally {
  try {
    await page.screenshot({ path: 'qa/reports/ui.png', fullPage: true });
  } catch (error) {
    errors.push('screenshot: ' + String(error));
  }
  await browser.close();
}

console.log(JSON.stringify({
  ok: loaded && tabs.length >= 4 && fileInput > 0 && errors.length === 0,
  tabs,
  file_input: fileInput,
  console_errors: errors.length,
  errors: errors.slice(0, 5),
}));
