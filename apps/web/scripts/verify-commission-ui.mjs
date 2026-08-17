// Full UI verification of /admin/commission using mocked API responses —
// proves the frontend wiring (summary cards, tabs, add/edit/delete modals,
// row detail popup) end to end. The real API logic is separately unit-tested
// (admin-commission.test.ts); this validates the page against the contract.
//
// Run from apps/web:  node scripts/verify-commission-ui.mjs

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

const fakeExpenses = [
  {
    id: 'exp_1',
    period: '2026-08',
    amount_inr: 120000, // ₹1,200
    category: 'Instagram Ads',
    expense_date: '2026-08-10T06:00:00.000Z',
    notes: 'Boosted posts for the new kurti collection',
    created_at: '2026-08-10T06:00:00.000Z',
  },
  {
    id: 'exp_2',
    period: '2026-08',
    amount_inr: 50000, // ₹500
    category: 'Travel',
    expense_date: '2026-08-12T06:00:00.000Z',
    notes: 'Client visit — Delhi',
    created_at: '2026-08-12T06:00:00.000Z',
  },
];

// Stateful month payload — the add/delete flows mutate it so refetches
// (which the real API would reflect) show the change.
let monthExpenses = [...fakeExpenses];
const monthSummary = {
  month: '2026-08',
  summary: {
    total_payment_inr: 10000000, // ₹1,00,000
    commission_inr: 300000, // ₹3,000
    spent_inr: 170000, // ₹1,700
    remaining_inr: 130000, // ₹1,300
    expense_count: 2,
  },
  get expenses() {
    return monthExpenses;
  },
};

const overview = [
  { period: '2026-08', total_payment_inr: 10000000, commission_inr: 300000, spent_inr: 170000, remaining_inr: 130000, expense_count: 2 },
  { period: '2026-07', total_payment_inr: 8000000, commission_inr: 240000, spent_inr: 240000, remaining_inr: 0, expense_count: 1 },
  { period: '2026-06', total_payment_inr: 5000000, commission_inr: 150000, spent_inr: 0, remaining_inr: 150000, expense_count: 0 },
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(String(e)));

const created = [];
let patched = null;
let deleted = null;

// ── Mock the commission API contract ──
await page.route('**/v1/admin/commission/overview**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: overview }) }),
);
await page.route('**/v1/admin/commission/expenses?month=*', (route) => {
  const summary = { ...monthSummary.summary, expense_count: monthExpenses.length };
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { month: '2026-08', summary, expenses: monthExpenses } }),
  });
});
await page.route('**/v1/admin/csrf-token', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { csrf_token: 'mock-csrf' } }) }),
);
await page.route('**/v1/admin/commission/expenses', (route) => {
  if (route.request().method() === 'POST') {
    const payload = JSON.parse(route.request().postData() ?? '{}');
    created.push(payload);
    const newExpense = {
      id: 'exp_new',
      period: payload.period,
      amount_inr: payload.amount_inr,
      category: payload.category,
      expense_date: payload.expense_date,
      notes: payload.notes ?? null,
      created_at: new Date().toISOString(),
    };
    monthExpenses = [newExpense, ...monthExpenses];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: newExpense }),
    });
  }
  return route.continue();
});
await page.route('**/v1/admin/commission/expenses/*', (route) => {
  const method = route.request().method();
  if (method === 'PATCH') {
    patched = JSON.parse(route.request().postData() ?? '{}');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { ...fakeExpenses[0], ...patched } }),
    });
  }
  if (method === 'DELETE') {
    deleted = route.request().url().split('/').pop();
    monthExpenses = monthExpenses.filter((e) => e.id !== deleted);
    return route.fulfill({ status: 204, body: '' });
  }
  return route.continue();
});

// ── Authenticate + load ──
await page.goto('http://localhost:3000/admin/commission', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate((key) => sessionStorage.setItem('admin_key', key), adminKey);
await page.goto('http://localhost:3000/admin/commission', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('text=Commission Pool', { timeout: 20000 });

const report = {};

// 1. Current-month cards
report.cards = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    totalPayments: t.includes('₹1,00,000'),
    pool: t.includes('₹3,000'),
    spent: t.includes('₹1,700'),
    remaining: t.includes('₹1,300'),
  };
});

// 2. Monthly Summary tab table
report.summaryRows = await page.evaluate(() =>
  [...document.querySelectorAll('table tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()),
);

// 3. Switch to Expenditure tab
await page.getByRole('button', { name: 'Expenditure' }).click();
await page.waitForSelector('text=Expenditure · August 2026', { timeout: 10000 });
report.expenseGridRows = await page.evaluate(() =>
  [...document.querySelectorAll('.divide-y > button')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()),
);

// 4. Row click → detail popup
await page.getByText('Instagram Ads', { exact: false }).click();
await page.waitForSelector('text=Boosted posts for the new kurti collection', { timeout: 10000 });
report.detailPopup = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    category: t.includes('Instagram Ads'),
    amount: t.includes('₹1,200'),
    notes: t.includes('Boosted posts for the new kurti collection'),
    month: t.includes('August 2026'),
  };
});

// 5. Edit from the popup (fields: [0] amount, [1] where, [2] date)
//    IST date check: expense_date 2026-08-10T06:00:00Z is Aug 10 in IST, so
//    the date input must prefill "2026-08-10" and save as IST-midnight UTC.
await page.getByRole('button', { name: 'Edit expense' }).click();
await page.waitForSelector('text=Edit Expense', { timeout: 10000 });
const datePrefill = await page.locator('.max-w-md input').nth(2).inputValue();
await page.locator('.max-w-md input').nth(1).fill('Instagram + Meta ads');
await page.getByRole('button', { name: 'Save Changes' }).click();
await page.waitForTimeout(800);
report.edit = {
  patchedPayload: patched,
  popupClosed: !(await page.evaluate(() => document.body.innerText.includes('Edit Expense'))),
  datePrefillCorrect: datePrefill === '2026-08-10',
  dateStoredAsIstMidnight: patched?.expense_date === '2026-08-09T18:30:00.000Z',
};

// 6. Add expense from the Expenditure tab
await page.getByRole('button', { name: 'Add Expense' }).click();
await page.waitForSelector('text=Add Expense', { timeout: 10000 });
await page.locator('.max-w-md input').nth(0).fill('2500');
await page.locator('.max-w-md input').nth(1).fill('Google Ads');
await page.getByRole('button', { name: 'Record Expense' }).click();
await page.waitForTimeout(800);
report.add = { createdPayload: created[created.length - 1] };

// 7. Delete flow — the added expense should now be in the refetched grid
await page.waitForSelector('text=Google Ads', { timeout: 10000 });
await page.getByText('Google Ads', { exact: false }).first().click();
await page.waitForSelector('text=Delete expense', { timeout: 10000 });
await page.getByRole('button', { name: 'Delete expense' }).click();
await page.getByRole('button', { name: 'Yes, delete' }).click();
await page.waitForTimeout(800);
report.delete = {
  deletedId: deleted,
  stillInGrid: await page.evaluate(() => document.body.innerText.includes('Google Ads')),
};

report.consoleErrors = consoleErrors;
report.pageErrors = pageErrors;

console.log(JSON.stringify(report, null, 2));
await browser.close();
