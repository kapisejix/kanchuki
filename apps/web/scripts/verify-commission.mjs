// Headless verification of the admin commission page.
// - Reads ADMIN_API_KEY from apps/api/.env at runtime (never printed).
// - Injects it into sessionStorage so the admin layout authenticates.
// - Captures console errors, page errors, failed requests, visible text,
//   and a screenshot — then prints a JSON report.
//
// Run from apps/web:  node scripts/verify-commission.mjs [--screenshot path.png]

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

function envValue(filePath, key) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    if (!line) return null;
    return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

const adminKey = envValue('../../apps/api/.env', 'ADMIN_API_KEY');
if (!adminKey) {
  console.error('ADMIN_API_KEY not found in apps/api/.env');
  process.exit(1);
}

const target = process.argv[2] ?? 'http://localhost:3000/admin/commission';
const screenshotPath = process.argv[3];

// Use the system Chrome — the repo's Playwright revision doesn't match the
// cached browsers on this machine (1223/1228 cached vs 1234 expected).
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('requestfailed', (req) =>
  failedRequests.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText ?? 'failed'}`),
);

// 1. Load once (unauthenticated — admin layout shows login), inject the key, reload.
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate((key) => sessionStorage.setItem('admin_key', key), adminKey);
await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 });

// 2. Wait for either the commission header or the error card.
await page.waitForFunction(
  () =>
    document.body.innerText.includes('Commission') ||
    document.body.innerText.includes('error'),
  { timeout: 20000 },
).catch(() => undefined);
await page.waitForTimeout(1500);

// 3. Snapshot what rendered.
const bodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 2000);
const title = await page.title();
const url = page.url();

if (screenshotPath) {
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

// 4. Assertions
const hasHeader = bodyText.includes('3% of each month');
const hasErrorCard = bodyText.includes('The API returned an error while loading commission data.');
const hasSummaryCards = bodyText.includes('Commission Pool');
const hasSidebar = bodyText.includes('Kanchuki Admin');

console.log(
  JSON.stringify(
    {
      url,
      title,
      hasHeader,
      hasErrorCard,
      hasSummaryCards,
      hasSidebar,
      consoleErrors,
      pageErrors,
      failedRequests,
      bodySnippet: bodyText,
    },
    null,
    2,
  ),
);

await browser.close();
