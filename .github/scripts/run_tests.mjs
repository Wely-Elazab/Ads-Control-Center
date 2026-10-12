// بيفتح صفحة الاختبارات (Live/tests/index.html) في Chromium من غير واجهة، ويستنى النتيجة (window.__tests)،
// ويطبع كل اختبار فشل. بيفشل كمان لو أي نافذة جديدة اتفتحت أثناء الاختبارات (زي نافذة دخول فيسبوك حقيقية) —
// الاختبارات لازم متلمسش أي حساب حقيقي
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8765/tests/index.html';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const popups = [];
context.on('page', (p) => { if (p !== page) popups.push(p); });
page.on('pageerror', (e) => console.log('page error:', e.message));

const started = Date.now();
await page.goto(URL);
await page.waitForFunction(() => window.__tests && typeof window.__tests.failed === 'number', null, { timeout: 10 * 60 * 1000, polling: 1000 });
const r = await page.evaluate(() => ({
  passed: window.__tests.passed,
  failed: window.__tests.failed,
  failures: (window.__tests.failures || []).map((f) => ({ group: f.group || '', name: f.name, msg: String(f.msg || '') }))
}));

console.log(`tests: ${r.passed} passed, ${r.failed} failed (${Math.round((Date.now() - started) / 1000)}s)`);
for (const f of r.failures) console.log(`FAIL [${f.group}] ${f.name}\n     ${f.msg}`);
if (popups.length) console.log('windows opened during the tests:', popups.map((p) => p.url()));

await browser.close();
process.exit(r.failed || popups.length ? 1 : 0);
