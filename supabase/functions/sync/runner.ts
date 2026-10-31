// المُشغّل: كل ١٠ دقايق (pg_cron → action: run) لملخص كل مستخدم (من ٣١ أكتوبر ٢٠٢٦ الملخص لكل مستخدم بحساباته — digest.ts):
//   - فحص التنبيهات العاجلة لكل حساب مرة في الساعة (مش بالليل بتوقيت المستخدم) — رسالة عاجلة واحدة فيها كل حساباته
//   - الملخص في الأيام والساعة اللي المستخدم اختارها بتوقيته، رسالة واحدة فيها قسم لكل حساب: الأيام من آخر ملخص، مقارنةً بالفترة اللي قبلها
//     مباشرةً بنفس الطول، + التعديلات على الإعلانات ونتيجتها + حالة التنبيهات العاجلة («حُلّت/مستمرة»).
//     مبنحفظش محتوى الملخص — آخر يوم غطّاه بس (last_summary_until)
//
// المحرك هو نفسه اللي في الأداة (js/i18n.js + alerts.js + core.js + diagnosis.js + meta.js) — مش نسخة تانية منه، عشان اللي
// بيوصل بالبريد يطابق اللي العميل بيشوفه في الأداة بالظبط. الملفات دي سكريبتات متصفح بتتشارك النطاق العام،
// فبتتحمّل بـ eval غير مباشر (نفس النطاق العام) مع بدائل بسيطة للمتصفح (document وlocalStorage وFB.api).
// بتتجاب من GitHub على commit ثابت (ENGINE_COMMIT): محتواه مقفول برقمه، فمحدش يقدر يغيّر الكود اللي بيشتغل
// هنا جنب مفاتيح Meta المحفوظة. لو الموقع اتحدّث بعده، بنسجّل «runner-engine-outdated» في heartbeat
// لحد ما ENGINE_COMMIT يتحدّث والدالة تتنشر تاني.
//
// القواعد المتفق عليها: التنبيه العاجل بيتبعت بس لما يكون فيه عاجل (مش في ميعاد ثابت)، ومنفصل عن الملخص.
// نفس التنبيه ميتكررش: تذكير واحد بس لو استمر يومين كمان. «ساء» = ظهرت مشكلة عاجلة جديدة على نفس
// العنصر أو مشكلة «مهمة» بقت «عاجلة» — دي بصمة جديدة فبتتبعت. مبنحفظش أي أرقام — النوع والعنصر والتواريخ بس.

import { GRAPH, SITE, db, rpc, esc, sendEmail, mailHtml } from './lib.ts';
import { unseal, stopUrl, accountName, daysText, hourText } from './digest.ts';
import { joinReminders } from './join.ts';

const ENGINE_COMMIT = '77d24cc6aa4b0fbd3b13772a7a1e5755b1a9faa8';
const ENGINE_FILES = ['i18n.js', 'alerts.js', 'core.js', 'diagnosis.js', 'meta.js'];
const ENGINE_RAW = 'https://raw.githubusercontent.com/Wely-Elazab/Ads-Control-Center/' + ENGINE_COMMIT + '/Live/js/';

const QUIET_FROM = 23, QUIET_UNTIL = 7;   // مفيش رسائل بالليل بتوقيت الحساب — اللي يظهر بالليل بيتبعت ٧ الصبح لو لسه قائم
const REMIND_AFTER_MS = 48 * 3600000;     // تذكير واحد بس، لو المشكلة استمرت يومين بعد أول رسالة
const RESOLVE_AFTER_MS = 24 * 3600000;    // «اتحلّت» = مظهرتش ٢٤ ساعة كاملة (اختفاء ساعة ورجوع = نفس المشكلة)
const EXPIRY_WARN_MS = 5 * 86400000;      // صلاحية Meta هتخلص خلال ٥ أيام → رسالة واحدة تطلب فتح الأداة
const TIME_BUDGET_MS = 110000;            // حد الدالة ١٥٠ ثانية — منبدأش حساب بعد كده، والباقي في التشغيل الجاي (بعد ١٠ دقايق)
// مهلة لكل طلب Meta، ونهاية للتشغيل كله (مراجعة المرحلة ٢، ١٧ أكتوبر — Google SRE، فصل ٢٢: «Deadlines» و«Queries of death»).
// من غيرهم طلب واحد معلّق كان بيخلّي Supabase تقطع التشغيل كله عند ١٥٠ ثانية من غير «نبض»، ولو نفس الحساب علّق كل مرة
// كان هيفضل أول القايمة (checked_at مبيتسجّلش) فيوقف رسايل كل الحسابات. الطلب اللي مهلته خلصت بيفشل زي عطل الشبكة = «حاول تاني»
const GRAPH_TIMEOUT_MS = 40000;            // الطلب العادي ثواني (قياس ١٢ أكتوبر): ٤٠ هامش واسع عشان الحسابات التقيلة متفشلش، ونهاية التشغيل هي الحماية
const RUN_DEADLINE_MS = 140000;           // ١٠ ثواني قبل حد الدالة لتسجيل اللي حصل و«النبض»
const URGENT_EVERY_MS = 50 * 60000;       // الفحص العاجل مرة في الساعة تقريباً لكل حساب (التشغيل نفسه كل ١٠ دقايق)
const SYSTEM_KINDS: Record<string, boolean> = { connection: true, expiry: true };

// ---------- عيلة البصمة (المراجعة الثانية للمرحلة ٥) ----------
// مفتاح ثابت للمشكلة الواحدة (PagerDuty: «dedup key» واحد للحادثة؛ ISA-18.2: إنذار واحد لكل حالة غير طبيعية). المحرك بيطلّع تنبيه
// أداء واحد للإعلان، بس نوعه بيتغيّر من يوم ليوم مع نفس المشكلة: «يومان دون نتائج» بيبقى «أسبوع كامل» لما آخر نتيجة تخرج من
// النافذة، و«الأكبر بالفلوس» بين الخسارة والهدر بيتبدّل. كانت البصمة بالنوع: بريد عاجل جديد عن نفس الإعلان، والملخص يقول عن القديم
// «حُلّت» وهو أسوأ (المحاكاة: إعلان ميت طول الأسبوع — «حُلّت» كاذبة في ٤٦٪ من الأسابيع، وبريد «جديد» تاني في ٢١٪).
// إنفاق الحساب (صفر أمس / نزل للنص) عيلة واحدة كمان. النوع نفسه بيتسجّل في last_code (عنوان سطر الملخص)
const PERF_KINDS: Record<string, boolean> = { 'waste-week': true, waste: true, loss: true, 'cost-max': true, 'waste-view': true, cpr: true, 'waste-early': true, 'waste-new': true,
  'roas-drop': true, 'low-roas': true, spike: true, drop: true, fatigue: true };
const ACCT_SPEND_KINDS: Record<string, boolean> = { 'acct-zero': true, 'acct-drop': true };
export function familyOf(code: string): string { return PERF_KINDS[code] ? 'perf' : (ACCT_SPEND_KINDS[code] ? 'acct-spend' : code); }
// مصدر بيانات التنبيهات اللي بتيجي من طلبات زيادة (extraAlerts): لو المصدر فشل في الفحص ده، غياب تنبيهه مش «حُلّت» — منعرفش
// (معيار م٨: غياب البيانات حالة مستقلة). قبل كده فشل طلب الموقع ٢٤ ساعة كان بيقفل «التتبّع متوقف» كأنه اتصلّح
const SOURCE_OF: Record<string, 'site' | 'links'> = { 'tracking-off': 'site', 'lpv-drop': 'site', 'checkout-off': 'site', 'link-broken': 'links' };
type Failed = { site: boolean; edits: boolean; links: boolean };
// مكتوبة لوحدها عشان تتختبر (tests/sync-test.ts): البصمة دي تتقفل «حُلّت» دلوقتي؟ alive = لسه ظاهرة «مهم» (عتبة تعافٍ مستقلة —
// حد «عاجل» بيتحرك مع اختبارات الحساب كل يوم، فالمشكلة بتنزل «مهم» وترجع: مش «حُلّت» ثم «عاجل» جديد)
export function resolveNow(m: { kind: string; last_code?: string | null; last_seen_at: string }, alive: boolean, failed: Failed, now: number): 'keep' | 'seen' | 'resolve' {
  if (alive) return 'seen';
  const src = SOURCE_OF[m.last_code || m.kind];
  if (src && failed[src]) return 'keep';
  return now - Date.parse(m.last_seen_at) >= RESOLVE_AFTER_MS ? 'resolve' : 'keep';
}

const g = globalThis as any;

// ---------- بدائل المتصفح ----------
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: unknown) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear()
  };
}
function define(name: string, value: unknown) {
  try { Object.defineProperty(g, name, { value, configurable: true, writable: true }); } catch (_) { /* مقفولة — الملفات عندها try */ }
}
function installShims() {
  const noop = () => {};
  const node = () => ({ parentNode: { insertBefore: noop }, style: {}, classList: { add: noop, remove: noop, toggle: noop } });
  define('window', g);
  define('document', {
    documentElement: {}, body: node(),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    getElementsByTagName: () => [node()], createElement: node, addEventListener: noop
  });
  define('localStorage', memoryStorage());
  define('sessionStorage', memoryStorage());
  define('location', { search: '', hash: '', pathname: '/app', href: SITE + '/app', origin: SITE, host: 'adscenter.online', protocol: 'https:' });
  define('history', { replaceState: noop, pushState: noop });
  define('FB', { api: fbApi, init: noop, login: noop });
}

// استهلاك حدود Meta (Marketing API — Rate Limiting، مراجعة المرحلة ٢): الترويسات دي مبتتقريش من المتصفح (CORS)، فبنقراها هنا.
// tier = مستوى الوصول (development_access = المحدود). accPct = حصة «Ad Account Level» (عندنا ٠٪ دايماً)، وbucPct = حصة
// الحساب في الساعة اللي بتحكم طلبات الأرقام: أعلى نسبة بين العدد ووقت المعالجة والوقت الكلي (تصحيح مراجعة ١٧ أكتوبر —
// الوقت هو اللي بيحدّد عندنا مش العدد). regainMin = دقايق الحجب لو اتحجبنا. أرقام استهلاك بس — من غير أي بيانات حساب
export type MetaUsage = { tier: string | null; accPct: number; bucPct: number; regainMin: number; calls: number };
export function freshUsage(): MetaUsage { return { tier: null, accPct: 0, bucPct: 0, regainMin: 0, calls: 0 }; }
export function readUsage(h: Headers, u: MetaUsage): MetaUsage {
  const parse = (s: string | null): any => { try { return s ? JSON.parse(s) : null; } catch (_) { return null; } };
  u.calls++;
  for (const name of ['x-ad-account-usage', 'x-fb-ads-insights-throttle']) {
    const j = parse(h.get(name));
    if (!j) continue;
    if (typeof j.ads_api_access_tier === 'string') u.tier = j.ads_api_access_tier;
    u.accPct = Math.max(u.accPct, Number(j.acc_id_util_pct) || 0);
  }
  // بيتسمّى x-business-use-case-usage في الردود (والصفحة الرسمية بتكتبه X-Business-Use-Case) — بنقرا الاتنين
  for (const name of ['x-business-use-case-usage', 'x-business-use-case']) {
    const j = parse(h.get(name));
    if (!j || typeof j !== 'object') continue;
    Object.keys(j).forEach((k) => (Array.isArray(j[k]) ? j[k] : []).forEach((x: any) => {
      u.bucPct = Math.max(u.bucPct, Number(x && x.call_count) || 0, Number(x && x.total_cputime) || 0, Number(x && x.total_time) || 0);
      u.regainMin = Math.max(u.regainMin, Number(x && x.estimated_time_to_regain_access) || 0);
    }));
  }
  return u;
}
function mergeUsage(into: MetaUsage, u: MetaUsage): void {
  into.tier = into.tier || u.tier;
  into.accPct = Math.max(into.accPct, u.accPct);
  into.bucPct = Math.max(into.bucPct, u.bucPct);
  into.regainMin = Math.max(into.regainMin, u.regainMin);
  into.calls += u.calls;
}
let usage = freshUsage();      // الحساب اللي بنفحصه دلوقتي
let runUsage = freshUsage();   // التشغيل كله (بيطلع في سطر «runner» في السجل)

// FB.api بتاع المتصفح → Graph API بمفتاح الحساب اللي بنفحصه دلوقتي (حساب واحد في المرة — exclusive تحت)
let metaToken = '';
// نهاية التشغيل الحالي (runAll بس — المعاينات من غير نهاية، بمهلة الطلب بس). صفر = مفيش
let runDeadline = 0;
// مهلة الطلب الجاي: ٤٠ ثانية، أو اللي فاضل للتشغيل لو أقل. الوقت خلص = الطلب ميتبعتش أصلاً
export function callTimeout(deadline: number, now: number): number {
  if (!deadline) return GRAPH_TIMEOUT_MS;
  const left = deadline - now;
  if (left <= 0) throw new Error('run deadline');
  return Math.min(GRAPH_TIMEOUT_MS, left);
}
function fbApi(path: string, a?: any, b?: any, c?: any) {
  let method = 'GET', params: Record<string, unknown> = {}, cb: (r: any) => void = () => {};
  if (typeof a === 'string') { method = a.toUpperCase(); if (typeof b === 'function') cb = b; else { params = b || {}; cb = c || cb; } }
  else if (typeof a === 'function') cb = a;
  else { params = a || {}; cb = b || cb; }
  graph(path, method, params).then(cb, (e) => cb({ error: { message: String((e && e.message) || e) } }));
}
async function graph(path: string, method: string, params: Record<string, unknown>): Promise<any> {
  const url = new URL(GRAPH + (path.charAt(0) === '/' ? path : '/' + path));
  const form = new URLSearchParams();
  const put = (k: string, v: unknown) => {
    if (v == null) return;
    const s = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (method === 'GET') url.searchParams.set(k, s); else form.set(k, s);
  };
  Object.keys(params).forEach((k) => put(k, params[k]));
  put('access_token', metaToken);
  const signal = AbortSignal.timeout(callTimeout(runDeadline, Date.now()));
  const r = await fetch(url, method === 'GET' ? { signal } : { method, body: form, signal });
  readUsage(r.headers, usage);
  return await r.json().catch(() => ({ error: { message: 'http ' + r.status } }));
}

// حساب واحد في المرة: المفتاح ولغة النصوص متغيرات عامة في المحرك، فطلبين في نفس الوقت كانوا هيتلخبطوا
let lock: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const p = lock.then(fn, fn);
  lock = p.catch(() => {});
  return p;
}

// ---------- تحميل المحرك ----------
let engine: Promise<string[]> | null = null;
// بيرجّع الملفات اللي نسختها على الموقع دلوقتي مختلفة عن ENGINE_COMMIT (يعني الأداة بقت أحدث من المُشغّل)
function loadEngine(): Promise<string[]> {
  if (!engine) {
    engine = (async () => {
      const texts = await Promise.all(ENGINE_FILES.map(async (f) => {
        const r = await fetch(ENGINE_RAW + f, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error('engine ' + f + ' ' + r.status);
        return await r.text();
      }));
      installShims();
      for (const src of texts) (0, eval)(src);
      if (!g.PauseProofAlerts || !g.I18N || !g.DX || typeof g.transformRealAd !== 'function' || typeof g.adsPromise !== 'function' ||
        typeof g.metaDiagnosisInput !== 'function' || typeof g.metaActivities !== 'function') throw new Error('engine incomplete');
      const live = await Promise.all(ENGINE_FILES.map((f) => fetch(SITE + '/js/' + f, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.text() : null)).catch(() => null)));
      const norm = (s: string) => s.replace(/\r\n/g, '\n');
      return ENGINE_FILES.filter((_f, i) => live[i] != null && norm(live[i] as string) !== norm(texts[i]));
    })().catch((e) => { engine = null; throw e; });
  }
  return engine;
}

// ---------- Meta ----------
const ACCOUNT_FIELDS = 'id,name,account_status,timezone_name,currency,spend_cap,amount_spent';
type Acct = { id: string; name?: string; account_status?: number; timezone_name?: string; currency?: string; spend_cap?: string; amount_spent?: string };
// lost = Meta رفضت الصلاحية نفسها (انتهت، اتلغت، أو الحساب اتشال منها). retry = عطل مؤقت — منقولش حاجة للعميل
async function accountOrFail(accountId: string): Promise<{ acct?: Acct; fail?: 'lost' | 'retry' }> {
  const j = await graph('/' + accountId, 'GET', { fields: ACCOUNT_FIELDS }).catch(() => null);
  if (j && j.id === accountId) return { acct: j };
  const code = j && j.error ? Number(j.error.code) : 0;
  return { fail: code === 190 || code === 102 || code === 10 || (code >= 200 && code <= 299) ? 'lost' : 'retry' };
}

// نفس خطوات loadAdsForAccount في js/meta.js من غير الواجهة: الإعلانات الشغّالة + حالة المجموعات + الأرقام اليومية
// + التكرار، وأي إعلان صرف في الأسبوع ومكانش في الدفعة بيتجاب برقمه. null = الأرقام مجاتش، منحكمش على حاجة
async function loadCandidates(accountId: string, acct: Acct): Promise<any[] | null> {
  const tz = acct.timezone_name || 'UTC';
  const days = g.last7Days(g.todayKeyInTz(tz));
  const timeRange = JSON.stringify({ since: days[0].key, until: days[days.length - 1].key });
  const adsP = g.adsPromise(accountId, { effective_status: JSON.stringify(g.LIVE_STATUSES) }, g.LIVE_ADS_CAP)
    .then((res: any) => (res.err ? g.adsPromise(accountId, {}, g.PAGE_SAFETY_CAP) : res));
  const adsetsP = new Promise((resolve) => g.loadAdsetStatusMap(accountId, resolve));
  const dailyP = g.insightsPromise(accountId, {
    level: 'ad', time_increment: 1, time_range: timeRange, fields: 'ad_id,date_start,spend,actions,action_values', limit: 500
  });
  // التكرار على الأيام المكتملة بس — زي الأداة (js/meta.js loadAdsForAccount، مراجعة المرحلة ٤)
  const reachP = g.fbPagesPromise('/' + accountId + '/insights', {
    level: 'ad', time_range: JSON.stringify({ since: days[0].key, until: days[days.length - 2].key }), fields: 'ad_id,frequency,reach,impressions', limit: 500
  }, g.FULL_SCAN_CAP);
  const [ads, adsets, daily, reach] = await Promise.all([adsP, adsetsP, dailyP, reachP]) as any[];
  if (ads.err || daily.err || daily.truncated) return null;

  const byId: Record<string, any> = {}, order: string[] = [];
  const add = (ad: any) => { if (ad && ad.id && !byId[ad.id]) { byId[ad.id] = ad; order.push(ad.id); } };
  ads.data.forEach(add);
  const missing = [...new Set<string>(daily.data.filter((r: any) => g.num(r.spend) > 0).map((r: any) => String(r.ad_id)))].filter((id) => !byId[id]);
  if (missing.length && ads.fields) {
    await new Promise<void>((resolve) => g.fetchMetaAdsByIds(missing, ads.fields, (extra: any[]) => { extra.forEach(add); resolve(); }));
  }
  const insights: Record<string, any[]> = {}, reachBy: Record<string, any> = {};
  daily.data.forEach((r: any) => { (insights[r.ad_id] = insights[r.ad_id] || []).push(r); });
  if (!reach.err) reach.data.forEach((r: any) => { reachBy[r.ad_id] = r; });
  const info = {
    name: acct.name || null, timeZone: tz, currency: acct.currency || null,
    accountStatus: acct.account_status, spendCap: acct.spend_cap || null, amountSpent: acct.amount_spent || null
  };
  const out = order.map((id) => {
    const c = g.transformRealAd(byId[id], insights[id] || [], adsets, days, reachBy[id], acct.currency || null, info, null);
    c.source = 'meta:' + accountId;
    return c;
  });
  CAND_CTX.set(out, { byId, order, insights, reachBy, adsets, days, info, fields: ads.fields || null, currency: acct.currency || null });
  return out;
}
// اللي اتبنت منه الإعلانات — لأرقام فترة الملخص لكل إعلان (costLine) من غير ما نجيب الإعلانات تاني
type CandCtx = { byId: Record<string, any>; order: string[]; insights: Record<string, any[]>; reachBy: Record<string, any>; adsets: any; days: any[]; info: any; fields: any; currency: string | null };
const CAND_CTX = new WeakMap<any[], CandCtx>();

// سطر «التكلفة مقابل الحد الذي حددته» في رسالة الملخص — زي الأداة بالظبط (قرار صاحب المنتج ٢٥ أكتوبر: «ضيفه في البريد ايضاً»):
// صف واحد لكل إعلان للفترة (js/meta.js periodP)، والإعلان اللي صرف فيها ومش في الدفعة بيتجاب برقمه (fillMissing)، وtransformRealAd
// يطلّع النتيجة حسب هدف الإعلان، ونفس الإعلانات (costAds: نتايجه معروفة ومش وصول)، والحساب في DX.costVsMax. null = مفيش حد
// محدد، أو الطلب فشل (السطر بيتشال والملخص بيكمّل)
async function costLine(accountId: string, cands: any[] | null, since: string, until: string, sens: Sens): Promise<string | null> {
  const ctx = cands ? CAND_CTX.get(cands) : null;
  if (!ctx || !sens || typeof g.DX.costVsMax !== 'function') return null;
  const s = g.PauseProofAlerts.mergeSettings(sens);
  if (!s.maxCost || !Object.keys(s.maxCost).length) return null;
  const res = await g.insightsPromise(accountId, { level: 'ad', time_range: JSON.stringify({ since, until }), fields: 'ad_id,spend,actions,action_values', limit: 500 });
  if (!res || res.err || res.truncated) return null;
  const rows: Record<string, any> = {};
  res.data.forEach((r: any) => { rows[String(r.ad_id)] = r; });
  const byId: Record<string, any> = { ...ctx.byId }, order = ctx.order.slice();
  const missing = Object.keys(rows).filter((id) => g.num(rows[id].spend) > 0 && !byId[id]);
  if (missing.length && ctx.fields) {
    await new Promise<void>((resolve) => g.fetchMetaAdsByIds(missing, ctx.fields, (extra: any[]) => {
      extra.forEach((ad: any) => { if (ad && ad.id && !byId[ad.id]) { byId[ad.id] = ad; order.push(ad.id); } });
      resolve();
    }));
  }
  const ads = order.map((id) => g.transformRealAd(byId[id], ctx.insights[id] || [], ctx.adsets, ctx.days, ctx.reachBy[id], ctx.currency, ctx.info, rows[id] || {}))
    .filter((c: any) => c.results != null && c.resultKey !== 'reach')
    .map((c: any) => ({ resultKey: c.resultKey, campaignId: c.campaignId, currency: c.currency, spend: (c.period && c.period.spend) || 0, results: c.period ? c.period.results : null }));
  return g.DX.costVsMax(ads, s, g.fmtRange(since, until));
}

// المستهدف وحد الخسارة (null = مش محددين: الملخص من غير سطر الهدف، وحكم الربح في التنبيهات بيستنى — زي الأداة)، وباقي الإعدادات
type Target = { roas: number; be: number } | null;
type Sens = Record<string, unknown> | null;
// إعدادات المستخدم (settings.ts — «لكل مستخدم» من ٢٦ أكتوبر ٢٠٢٦، والملخص نفسه لكل مستخدم من ٣١ أكتوبر): إعداداته لكل حساب بنفس دالة
// الأداة (alerts.js settingsForAccount: إعدادات المنصة الخاصة لو اتخصّصت وإلا «كل الحسابات»، وأقصى تكلفة الأنواع متحوّلة لعملة الحساب
// بسعر الربط الرسمي). مستخدم من غير إعدادات محفوظة = قيم البداية، وحكم الربح بيستنى — زي الأداة بالظبط
async function firstRow(path: string): Promise<any | null> {
  const r = await db(path, { method: 'GET' }).catch(() => null);
  const rows = r ? await r.json().catch(() => null) : null;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
function objectOrNull(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
async function userSettingsOf(user: string): Promise<Record<string, unknown> | null> {
  const row = await firstRow('user_settings?select=settings&user_id=eq.' + user);
  return objectOrNull(row && row.settings);
}
// من غير مستهدف وحد خسارة حكم الربح بيستنى في البريد زي الأداة بالظبط (قرار صاحب المنتج). النسخة القديمة اللي كانت بتتحفظ مع
// الملخص (digest_settings) مبقتش بتتقري: كانت من آخر متصفح فتح الأداة (اتشاف حياً ٢٤ أكتوبر)
export function settingsChoice(acs: Record<string, unknown> | null): { target: Target; sens: Sens } {
  if (!acs) return { target: null, sens: null };
  const r = Number(acs.roasTarget), b = Number(acs.roasBreakEven);
  return { target: r > 0 && b > 0 ? { roas: r, be: b } : null, sens: acs };
}
function effectiveFor(us: Record<string, unknown> | null, platform: string, currency: string | null): { target: Target; sens: Sens } {
  return settingsChoice(us ? g.PauseProofAlerts.settingsForAccount(us, platform, currency, g.DX.pegRate) : null);
}
// محرك الأداة بحساسية العميل (ق٥ — قبل كده الإعدادات الافتراضية هنا وحساسية العميل في متصفحه بس، فالبريد كان بيطلع بحساسية
// «متوازن» لعميل اختار «هادي»)، والمستهدف وحد الخسارة لو بعتهم. العاجل بس. mergeSettings في المحرك بيتحقق من حدود كل قيمة
// alive = مفاتيح (العيلة|العنصر) للتنبيهات «المهمة» — مبتتبعتش، بس بتقول إن المشكلة لسه قائمة (resolveNow)
function alertKey(a: any): string { return familyOf(String(a.code || 'other')) + '|' + String(a.adId || a.objectId || ''); }
function urgentAlerts(accountId: string, acct: Acct, cands: any[], target: Target, sens: Sens = null): { urgent: any[]; alive: Record<string, boolean> } {
  const source = 'meta:' + accountId;
  const meta = {
    [source]: {
      label: 'Meta — ' + (acct.name || accountId), currency: acct.currency || null, timeZone: acct.timezone_name || null,
      metaAccountStatus: acct.account_status != null ? Number(acct.account_status) : null,
      spendCapReached: Number(acct.spend_cap) > 0 && Number(acct.amount_spent) >= Number(acct.spend_cap),
      spendCap: Number(acct.spend_cap) || 0, amountSpent: Number(acct.amount_spent) || 0
    }
  };
  const custom = Object.assign({}, sens || {}, target ? { roasTarget: target.roas, roasBreakEven: target.be } : {});
  const res = g.PauseProofAlerts.analyze(cands, meta, custom, alertFmt());
  const alive: Record<string, boolean> = {};
  res.alerts.forEach((a: any) => {
    if (a.level === 'warning' && !a.minor) alive[alertKey(a)] = true;
    // إعلانات المجموعة الإعلانية اللي اتدمجت في تنبيه واحد (alerts.js mergeBySet): مشكلتها لسه قايمة — من غيرها كانت هتتقال «حُلّت»
    (a.setMerged || []).forEach((id: string) => { alive[familyOf(String(a.code || 'other')) + '|' + id] = true; });
  });
  return { urgent: res.alerts.filter((a: any) => a.level === 'critical' && !a.minor), alive };
}
function alertFmt() {
  return { money: g.money, currencyLabel: g.currencyLabel, num: g.numAr, num2: g.numAr2, int: (n: number) => g.ar(Math.round(n || 0)) };
}

// ---------- التنبيهات اللي محتاجة بيانات زيادة (قواعدها في js/alerts.js: siteAlerts / editAlerts / linkAlerts) ----------
// editsSince = آخر فحص عاجل: التعديلات الأحدث منه بس، فكل تعديل بيتقيّم مرة واحدة. «توقف أكبر مصدر» و«تعديل كبير» بيتبعتوا عاجل
// في كل الحالات، أيّاً كان اللي عملهم (قرار صاحب المنتج ٢٥ أكتوبر: «طريقة حساب من أوقف… خاطئة تماماً، فاعرض التنبيه عاجلاً
// وارسل التنبيه في كل الحالات») — من ١٩ أكتوبر (ق٣) كان اسم اللي عمل الفعل في سجل Meta بيتقارن باسم صاحب المفتاح (/me)، وفعله
// هو مبيوصلوش: مقارنة بالاسم (زميل بنفس الاسم = هو)، ومكانتش اتجرّبت على حالة حقيقية
async function extraAlerts(accountId: string, acct: Acct, cands: any[], editsSince: number): Promise<{ alerts: any[]; failed: Failed }> {
  const tz = acct.timezone_name || 'UTC', cur = acct.currency || null, fmt = alertFmt(), out: any[] = [];
  const failed: Failed = { site: false, edits: false, links: false };
  const fail = (what: keyof Failed, e: unknown) => { failed[what] = true; console.error('extra alerts ' + what, String((e as Error).message || e).slice(0, 160)); };
  try { out.push(...g.PauseProofAlerts.siteAlerts(await g.metaSiteDays(accountId, tz), fmt)); } catch (e) { fail('site', e); }
  try {
    const acts = await g.metaActivities(accountId, g.shiftKey(g.todayKeyInTz(tz), -2));
    if (acts.err) throw new Error('activities');
    const edits = acts.data.filter((ev: any) => eventMs(ev.event_time) > editsSince)
      .map((ev: any) => g.DX._.actionOf(ev, tz)).filter((ev: any) => ev && (ev.kind === 'budget' || ev.kind === 'pause'));
    if (edits.length) {
      const today = g.todayKeyInTz(tz), groups: any[] = [];
      ['campaign', 'adset', 'ad'].forEach((l) => {
        const ids = [...new Set(edits.filter((ev: any) => ev.level === l).map((ev: any) => ev.id))];
        if (ids.length) groups.push({ level: l, ids });
      });
      const objDaily = await g.metaObjectDaily(accountId, groups, g.shiftKey(today, -6), today);
      const accSpend = cands.reduce((s0: number, c: any) => s0 + (c.spend || 0), 0);
      edits.forEach((ev: any) => {
        ev.share = accSpend > 0 ? (objDaily[ev.id] || []).reduce((s0: number, r: any) => s0 + (r.spend || 0), 0) / accSpend : 0;
        ev.when = whenText(ev.time, tz);
      });
      out.push(...g.PauseProofAlerts.editAlerts(edits, fmt, cur, accSpend / 7));
    }
  } catch (e) { fail('edits', e); }
  try { out.push(...g.PauseProofAlerts.linkAlerts(await brokenLinks(cands))); } catch (e) { fail('links', e); }
  return { alerts: out, failed };
}
function eventMs(when: string): number {
  const ms = Date.parse(String(when || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isFinite(ms) ? ms : 0;
}
// «٢٤ سبتمبر ١٦:١٥» بتوقيت الحساب (لغة المحرك متظبطة قبلها)
function whenText(when: string, tz: string): string {
  const d = new Date(eventMs(when));
  try {
    const p: Record<string, string> = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return g.fmtKey(p.year + '-' + p.month + '-' + p.day) + ' ' + g.ar(p.hour + ':' + p.minute);
  } catch (_) { return d.toISOString().slice(0, 16).replace('T', ' '); }
}

// ---------- فحص روابط الإعلانات ----------
// الإعلانات الشغّالة اللي صرفت امبارح أو النهارده، رابط لكل صفحة (من غير باراميترات التتبّع)، أكبر ١٠ بالإنفاق.
// معطّل = ٤٠٤/٤١٠ من أول مرة، أو خطأ خادم (5xx) أو عدم استجابة مرتين ورا بعض. الحجب الأمني (403/429، تحدّي
// Cloudflare) مش عطل. الروابط من إعلانات العميل: http/https ونطاقات عادية بس (مش عناوين IP ولا شبكات داخلية)
const LINK_MAX = 10, LINK_TIMEOUT_MS = 8000;
const LINK_UA = 'Mozilla/5.0 (compatible; AdsCenterLinkCheck/1.0; +https://adscenter.online)';
function linkAllowed(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return (u.protocol === 'https:' || u.protocol === 'http:') && h.indexOf('.') > 0 && !/^[\d.]+$/.test(h) && h.indexOf(':') < 0 &&
    !/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h);
}
async function probe(url: string): Promise<{ status: number; blocked: boolean }> {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(LINK_TIMEOUT_MS), headers: { 'user-agent': LINK_UA, 'accept': 'text/html,*/*' } });
    try { await r.body?.cancel(); } catch (_) { /* مش مهم */ }
    const blocked = !!r.headers.get('cf-mitigated') || (r.status === 503 && /cloudflare/i.test(r.headers.get('server') || ''));
    return { status: r.status, blocked };
  } catch (_) {
    return { status: 0, blocked: false };
  }
}
async function linkBroken(url: string): Promise<number | null> {
  const a = await probe(url);
  if (a.status === 404 || a.status === 410) return a.status;
  if (a.blocked || !(a.status === 0 || a.status >= 500)) return null;
  await new Promise((r) => setTimeout(r, 2500));
  const b = await probe(url);
  return !b.blocked && (b.status === 0 || b.status >= 500) ? b.status : null;
}
async function sha1Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function brokenLinks(cands: any[]): Promise<any[]> {
  const pages: Record<string, { url: string; ads: string[]; spend: number }> = {};
  cands.forEach((c) => {
    const d = c.daily || [];
    if (!c.active || c.landingKind !== 'website' || ((d[d.length - 2] || 0) + (d[d.length - 1] || 0)) <= 0 || /\{\{/.test(c.landing || '')) return;
    let u: URL;
    try { u = new URL(c.landing); } catch (_) { return; }
    if (!linkAllowed(u)) return;
    const key = u.origin + u.pathname, p = pages[key] = pages[key] || { url: c.landing, ads: [], spend: 0 };
    p.ads.push(c.offer || c.headline || c.id); p.spend += c.spend || 0;
  });
  const list = Object.keys(pages).map((k) => ({ k, ...pages[k] })).sort((a, b) => b.spend - a.spend).slice(0, LINK_MAX);
  const res = await Promise.all(list.map(async (x) => {
    const status = await linkBroken(x.url);
    return status == null ? null : { key: 'u:' + (await sha1Hex(x.k)).slice(0, 24), url: x.url, status, ads: x.ads };
  }));
  return res.filter(Boolean);
}
// كل التنبيهات العاجلة للحساب: محرك الأداة + البيانات الزيادة. التعديل الكبير على عنصر عليه «أكبر مصدر وقف» منكررهوش
// alive = المشاكل اللي لسه ظاهرة «مهم» (مبتتبعتش)، وfailed = مصادر البيانات اللي فشلت في الفحص ده (resolveNow)
async function allUrgent(accountId: string, acct: Acct, cands: any[], editsSince: number, target: Target, sens: Sens = null): Promise<{ urgent: any[]; alive: Record<string, boolean>; failed: Failed }> {
  const ex = await extraAlerts(accountId, acct, cands, editsSince), extra = ex.alerts;
  const ua = urgentAlerts(accountId, acct, cands, target, sens);
  const base = ua.urgent;
  const stopped: Record<string, boolean> = {};
  base.forEach((a: any) => { if (a.code === 'top-stopped') stopped[String(a.adId || String(a.objectId || '').replace(/^c:/, ''))] = true; });
  return { urgent: base.concat(extra.filter((a: any) => !(a.code === 'big-edit' && stopped[String(a.objectId || '').split('@')[0]]))), alive: ua.alive, failed: ex.failed };
}

// ---------- البصمات ----------
// kind = عيلة البصمة (familyOf) للجديد — والصفوف القديمة بنوعها القديم («loss»…) بتتقري تحت مفتاح عيلتها وبتتحدّث بنفس صفها،
// فمفيش ترحيل ولا بريد «جديد» عن مشكلة اتبعتت قبل التغيير. last_code = آخر نوع ظهر (عنوان سطر الملخص)
type Mark = { kind: string; object_id: string; first_at: string; last_sent_at: string; last_seen_at: string; times_sent: number; resolved_at: string | null; last_code?: string | null };
// أكتر من صف لنفس العيلة والعنصر (أنواع قديمة قبل العيلة): المفتوح يكسب، وبين المفتوحين الأقدم
export function markMap(rows: Mark[]): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  (rows || []).forEach((m) => {
    const k = familyOf(m.kind) + '|' + m.object_id, cur = out[k];
    if (!cur || (cur.resolved_at && !m.resolved_at) || (!cur.resolved_at === !m.resolved_at && m.first_at < cur.first_at)) out[k] = m;
  });
  return out;
}
// بصمات المستخدم على الحساب (user_alert_marks — من ٣١ أكتوبر لكل مستخدم: كل واحد «حُلّت/مستمرة» بتاعته بإعداداته)
async function marksOf(user: string, account: string): Promise<Record<string, Mark>> {
  const r = await db('user_alert_marks?select=kind,object_id,first_at,last_sent_at,last_seen_at,times_sent,resolved_at,last_code&user_id=eq.' + user +
    '&platform=eq.meta&account_id=eq.' + account, { method: 'GET' });
  return markMap((await r.json()) as Mark[]);
}
async function saveMarks(user: string, account: string, rows: Mark[]): Promise<void> {
  if (!rows.length) return;
  await db('user_alert_marks?on_conflict=user_id,platform,account_id,kind,object_id', {
    method: 'POST', headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' },
    // كل الصفوف بنفس الأعمدة (PostgREST في الإدخال الجماعي)
    body: JSON.stringify(rows.map((r) => ({ user_id: user, platform: 'meta', account_id: account, kind: r.kind, object_id: r.object_id, first_at: r.first_at,
      last_sent_at: r.last_sent_at, last_seen_at: r.last_seen_at, times_sent: r.times_sent, resolved_at: r.resolved_at, last_code: r.last_code ?? null })))
  });
}
function newMark(kind: string, obj: string, iso: string, code: string | null = null): Mark {
  return { kind, object_id: obj, first_at: iso, last_sent_at: iso, last_seen_at: iso, times_sent: 1, resolved_at: null, last_code: code };
}
async function logSend(user: string, account: string, type: string, status: string, id: string | null, error: string | null): Promise<void> {
  await db('send_log', { method: 'POST', headers: { 'prefer': 'return=minimal' },
    body: JSON.stringify({ user_id: user, account_id: account || '-', type, status, provider_id: id, error: error ? error.slice(0, 200) : null }) }).catch(() => {});
}
async function send(user: string, account: string, type: string, to: string, mail: { subject: string; html: string; text: string }): Promise<boolean> {
  try {
    const id = await sendEmail(to, mail.subject, mail.html, mail.text);
    await logSend(user, account, type, 'sent', id, null);
    return true;
  } catch (e) {
    await logSend(user, account, type, 'failed', null, String((e as Error).message || e));
    return false;
  }
}

// ---------- نصوص الرسائل (فصحى) ----------
function hourIn(tz: string): number {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date())) % 24; }
  catch (_) { return new Date().getUTCHours(); }
}
// لغة المحرك لازم تكون متظبطة قبلها (I18N.setLang)
function dateText(iso: string, tz: string, en: boolean): string {
  let day = 0, month = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: 'numeric', day: 'numeric' }).formatToParts(new Date(iso));
    day = Number(parts.find((p) => p.type === 'day')!.value); month = Number(parts.find((p) => p.type === 'month')!.value);
  } catch (_) { const d = new Date(iso); day = d.getUTCDate(); month = d.getUTCMonth() + 1; }
  const months = g.I18N.months();
  return en ? months[month - 1] + ' ' + day : g.ar(day) + ' ' + months[month - 1];
}
function plain(title: string, lines: string[]): string {
  return title + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')).join('\n\n');
}
function alertBox(a: any, note: string | null): string {
  const muted = 'margin:0 0 6px;color:#6b7280;font-size:14px;line-height:1.7';
  return '<div style="border-inline-start:4px solid #c2410c;padding:2px 12px;margin:0 0 18px">' +
    '<p style="margin:0 0 6px;font-weight:700;line-height:1.7">' + esc(a.title) + '</p>' +
    '<p style="margin:0 0 6px;line-height:1.8">' + esc(a.detail) + '</p>' +
    (a.impactText ? '<p style="' + muted + '">' + esc(a.impactText) + '</p>' : '') +
    // رقم المنصة جنب «الأقرب للمتجر» اللي اتبنى عليه التنبيه (alerts.js compareText — قرار ٦ أكتوبر ٢٠٢٦)
    (a.compare ? '<p style="' + muted + '">' + esc(a.compare) + '</p>' : '') +
    (note ? '<p style="' + muted + '">' + esc(note) + '</p>' : '') +
    '<p style="margin:0;line-height:1.8">' + esc(a.advice) + '</p></div>';
}
function countPhrase(n: number, en: boolean): string {
  if (en) return n + ' things need action';
  if (n === 2) return 'أمران يحتاجان إلى إجراء';
  return g.ar(n) + (n <= 10 ? ' أمور تحتاج' : ' أمراً يحتاج') + ' إلى إجراء';
}
// رابط الأداة على الحساب نفسه (Live/js/route.js) — قبل كده /app لوحدها، فكانت بتفتح آخر حساب اتفتح على الجهاز
// (مسؤول الإعلانات عنده كذا عميل). العاجل بيفتح تبويب التنبيهات على طول
function appLink(account: string, view = ''): string {
  const q = (account ? 'meta=' + encodeURIComponent(account) : '') + (view ? (account ? '&amp;' : '') + 'view=' + view : '');
  return '<a href="' + SITE + '/app' + (q ? '?' + q : '') + '">Ads Center</a>';
}
// رسالة عاجلة واحدة للمستخدم في كل فحص، فيها تنبيهات كل حساباته (قسم لكل حساب). حساب واحد = نفس الرسالة القديمة بالظبط
type Section = { account: string; name: string; fresh: any[]; remind: { a: any; m: Mark }[] };
function accountsPhrase(n: number, en: boolean): string {
  if (en) return n + ' accounts';
  return n === 2 ? 'حسابين' : g.ar(n) + (n <= 10 ? ' حسابات' : ' حساباً');
}
function urgentMail(sections: Section[], tz: string, en: boolean, stop: string) {
  const fresh = sections.reduce((all: any[], s) => all.concat(s.fresh), []);
  const remind = sections.reduce((all: { a: any; m: Mark }[], s) => all.concat(s.remind), []);
  const one = sections.length === 1 ? sections[0] : null;
  const where = one ? one.name : accountsPhrase(sections.length, en);
  const subject = fresh.length
    ? (en ? 'Urgent: ' + (fresh.length === 1 ? fresh[0].title : countPhrase(fresh.length, true)) + ' — ' + where
      : 'عاجل: ' + (fresh.length === 1 ? fresh[0].title : countPhrase(fresh.length, false)) + ' — ' + where)
    : (en ? 'Reminder: ' + (remind.length === 1 ? remind[0].a.title + ' is still ongoing' : 'urgent issues still ongoing') + ' — ' + where
      : 'تذكير: ' + (remind.length === 1 ? '«' + remind[0].a.title + '» ما زال قائماً' : 'تنبيهات عاجلة ما زالت قائمة') + ' — ' + where);
  const lines: string[] = [];
  sections.forEach((s) => {
    const n = esc(s.name);
    if (!one) lines.push('<p style="margin:18px 0 8px;font-size:16px;font-weight:700;line-height:1.7">' + n + '</p>');
    if (s.fresh.length) {
      lines.push(en ? 'We found something in <strong>' + n + '</strong> that needs your attention now:'
        : 'رصدنا في حساب <strong>' + n + '</strong> ما يحتاج إلى انتباهك الآن:');
      s.fresh.forEach((a) => lines.push(alertBox(a, null)));
    }
    if (s.remind.length) {
      lines.push(en ? 'Still ongoing since our first alert:' : 'وما زال قائماً منذ أبلغناك به:');
      s.remind.forEach((r) => lines.push(alertBox(r.a, en ? 'We first alerted you on ' + dateText(r.m.first_at, tz, true) + '.'
        : 'أبلغناك به أول مرة يوم ' + dateText(r.m.first_at, tz, false) + '.')));
    }
    if (!one) lines.push(en ? 'Details for this account are in ' + appLink(s.account, 'alerts') + '.' : 'تفاصيل هذا الحساب في ' + appLink(s.account, 'alerts') + '.');
  });
  if (one) lines.push(en ? 'Full details are in ' + appLink(one.account, 'alerts') + '.' : 'التفاصيل الكاملة في ' + appLink(one.account, 'alerts') + '.');
  lines.push(en ? 'We don\'t repeat the same alert: we remind you once if it lasts two more days, and your next summary shows whether it was resolved.'
    : 'لا نكرر التنبيه نفسه: نذكّرك به مرة واحدة إذا استمر يومين، ويبيّن ملخصك التالي هل حُلّ أم ما زال قائماً.');
  lines.push(en ? 'To stop the summary and alerts: <a href="' + stop + '">Stop</a>' : 'لإيقاف الملخص والتنبيهات: <a href="' + stop + '">إيقاف</a>');
  return { subject, html: mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text: plain(subject, lines) + '\n' + stop };
}
function connectionMail(account: string, name: string, en: boolean, stop: string) {
  const n = esc(name), app = appLink(account);
  const subject = en ? 'We lost access to ' + name + ' — open Ads Center to restore it' : 'توقف وصولنا إلى حساب ' + name + ' — افتح الأداة لإعادته';
  const lines = en ? [
    'Hello,',
    'We can no longer read the figures of <strong>' + n + '</strong> on Meta, most likely because the access expired or was removed. The summary and urgent alerts are paused until then.',
    'To restore them, open ' + app + ' and log in with Meta once — we renew the access automatically.',
    'To stop the summary and alerts instead: <a href="' + stop + '">Stop</a>'
  ] : [
    'مرحباً،',
    'لم نعد نستطيع قراءة أرقام حساب <strong>' + n + '</strong> لدى Meta، غالباً لأن صلاحية الدخول انتهت أو أُلغيت. لذلك توقّف الملخص والتنبيهات العاجلة مؤقتاً.',
    'لإعادتها: افتح ' + app + ' وسجّل الدخول بحساب Meta مرة واحدة، وسنجدد الصلاحية تلقائياً.',
    'وإذا أردت إيقافها نهائياً: <a href="' + stop + '">إيقاف الملخص والتنبيهات</a>'
  ];
  return { subject, html: mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text: plain(subject, lines) + '\n' + stop };
}
function expiryMail(account: string, name: string, expiresAt: string, tz: string, en: boolean, stop: string) {
  const n = esc(name), app = appLink(account);
  const subject = en ? 'Open Ads Center to keep alerts for ' + name + ' running' : 'افتح Ads Center ليستمر الملخص والتنبيهات لحساب ' + name;
  const lines = en ? [
    'Hello,',
    'Our read access to <strong>' + n + '</strong> ends on ' + dateText(expiresAt, tz, true) + ' (Meta limits it to about 60 days), and the summary and alerts stop after that.',
    'To renew it, just open ' + app + ' and log in with Meta once — nothing else is needed.',
    'To stop the summary and alerts instead: <a href="' + stop + '">Stop</a>'
  ] : [
    'مرحباً،',
    'تنتهي صلاحية قراءة حساب <strong>' + n + '</strong> يوم ' + dateText(expiresAt, tz, false) + ' (تحددها Meta بنحو ٦٠ يوماً)، وبعدها يتوقف الملخص والتنبيهات.',
    'لتجديدها يكفي أن تفتح ' + app + ' وتسجّل الدخول بحساب Meta مرة واحدة، دون أي إجراء آخر.',
    'وإذا أردت إيقافها نهائياً: <a href="' + stop + '">إيقاف الملخص والتنبيهات</a>'
  ];
  return { subject, html: mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text: plain(subject, lines) + '\n' + stop };
}

// ---------- الملخص ----------
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function localParts(tz: string): { key: string; dow: number; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  } catch (_) { return localParts('UTC'); }
  const p: Record<string, string> = {};
  parts.forEach((x) => { p[x.type] = x.value; });
  return { key: p.year + '-' + p.month + '-' + p.day, dow: DOW[p.weekday], hour: Number(p.hour) % 24 };
}
// الفترة: من اليوم اللي بعد آخر ملخص لحد أمس. أول ملخص (أو بعد انقطاع طويل): الأيام من آخر يوم ملخص في الجدول
// (الأربعاء بعد الأحد = الأحد–الثلاثاء، والأحد بعد الأربعاء = الأربعاء–السبت)
function summaryWindow(days: number[], last: string | null, today: string, dow: number): { since: string; until: string } | null {
  const until = g.shiftKey(today, -1);
  if (last && last >= until) return null;
  let since: string;
  if (last && g.keyDiffDays(last, until) <= 14) since = g.shiftKey(last, 1);
  else {
    let gap = 7;
    for (let i = 1; i <= 7; i++) if (days.indexOf((dow - i + 7) % 7) > -1) { gap = i; break; }
    since = g.shiftKey(today, -gap);
  }
  return { since: since > until ? until : since, until };
}
// ميعاد الملخص: يوم من أيامه، والساعة عدّت ساعته (الميعاد فات = يتبعت في أول تشغيل بعده)، ومفيش ملخص غطّى أمس
function summaryDue(s: Settings): { since: string; until: string } | null {
  const lp = localParts(s.timezone || 'UTC');
  const days = (s.summary_days || []).map(Number);
  if (days.indexOf(lp.dow) < 0 || lp.hour < (s.summary_hour == null ? 9 : s.summary_hour)) return null;
  return summaryWindow(days, s.last_summary_until, lp.key, lp.dow);
}
// الملخص الشهري (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦): أول أحد في الشهر بعد ساعة الملخص، للشهر اللي فات كله — مرة واحدة
// (last_monthly = الشهر اللي اتبعت ملخصه، مش أرقام)
function monthlyDue(s: Settings): { since: string; until: string; month: string } | null {
  const lp = localParts(s.timezone || 'UTC');
  if (lp.dow !== 0 || Number(lp.key.slice(8)) > 7 || lp.hour < (s.summary_hour == null ? 9 : s.summary_hour)) return null;
  const until = g.shiftKey(lp.key.slice(0, 8) + '01', -1), month = until.slice(0, 7);
  return s.last_monthly === month ? null : { since: month + '-01', until, month };
}
// إجابات «هل كان التشخيص صحيحاً؟» بتاعة المستخدم ده بس (من ٣١ أكتوبر — كانت مشتركة لكل من يفتح الحساب)
async function feedbackOf(user: string, account: string): Promise<any[]> {
  const r = await db('feedback?select=block,since,until,verdict,reasons,note&user_id=eq.' + user + '&view_key=eq.' + encodeURIComponent('meta:' + account) + '&limit=200',
    { method: 'GET' }).catch(() => null);
  const rows = r ? await r.json().catch(() => null) : null;
  return Array.isArray(rows) ? rows : [];
}
// التقرير (DX) + التعديلات ونتيجتها. لو سجل التعديلات فشل، الملخص بيكمّل من غيره
async function buildSummary(user: string, accountId: string, acct: Acct, since: string, until: string, target: Target, cands: any[] | null = null, sens: Sens = null): Promise<{ composed: any; actions: any }> {
  const tz = acct.timezone_name || 'UTC';
  const input = await g.metaDiagnosisInput(accountId, since, until, true);
  input.currency = acct.currency || null;
  input.timezone = tz;
  input.feedback = await feedbackOf(user, accountId);
  // سطر «العائد أعلى/أقل من المستهدف» زي اللي في الأداة — بس لو العميل بعت المستهدف وحد الخسارة
  const composed = g.DX.compose(g.DX.analyze(input), { mail: true, target });
  // «للمقارنة: تنسب Meta لهذه الفترة…» زي الأداة بالظبط (diagnosis.js DX.platCompare) — من غيره «٥ طلبات» في البريد قصاد ١٦ في
  // مدير الإعلانات من غير ولا كلمة (مراجعة المرحلة ٤، ١٨ أكتوبر ٢٠٢٦). نص البريد (DX.toText) بياخده من composed.platCmp
  composed.platCmp = typeof g.DX.platCompare === 'function' ? g.DX.platCompare(input, 'meta') : null;
  try { composed.costCmp = await costLine(accountId, cands, since, until, sens); } catch (e) {
    composed.costCmp = null;
    console.error('summary cost line failed', String((e as Error).message || e).slice(0, 200));
  }
  let actions = null;
  try {
    const acts = await g.metaActivities(accountId, g.shiftKey(since, -12));
    if (!acts.err) {
      const groups = g.DX.actionGroups(acts.data, tz, since, until);
      const from = g.DX.actionsFrom(groups);
      const objDaily = groups.length ? await g.metaObjectDaily(accountId, groups, from && from < since ? from : since, until) : {};
      actions = g.DX.composeActions(g.DX.evalActions(groups, objDaily, input.daily, until), acct.currency || null);
    }
  } catch (e) {
    console.error('summary actions failed', String((e as Error).message || e).slice(0, 200));
  }
  return { composed, actions };
}

const TONE_COLOR: Record<string, string> = { good: '#15803d', bad: '#b91c1c', mixed: '#c2410c', neutral: '#374151' };
const KIND_COLOR: Record<string, string> = {
  urgent: '#b91c1c', why: '#2563eb', decision: '#b91c1c', watch: '#c2410c', opportunity: '#15803d', follow: '#6b7280', note: '#9ca3af', actions: '#7c3aed'
};
const P = (html: string, extra = '') => '<p style="margin:0 0 6px;line-height:1.8' + (extra ? ';' + extra : '') + '">' + html + '</p>';
const MUTED = 'color:#6b7280;font-size:14px';
function blockHtml(b: any): string {
  const t = g.I18N.t;
  let h = '<div style="border-inline-start:4px solid ' + (KIND_COLOR[b.kind] || '#9ca3af') + ';padding:2px 12px;margin:0 0 20px">';
  if (b.title) h += P(esc(b.title), 'font-weight:700');
  (b.lines || []).forEach((l: string) => { h += P(esc(l)); });
  if (b.bullets && b.bullets.length) {
    h += '<ul style="margin:0 0 6px;padding-inline-start:20px">' + b.bullets.map((x: string) => '<li style="line-height:1.8">' + esc(x) + '</li>').join('') + '</ul>';
  }
  (b.items || []).forEach((it: any) => {
    h += '<div style="border-inline-start:3px solid ' + (TONE_COLOR[it.tone] || '#9ca3af') + ';padding:0 10px;margin:10px 0">' +
      P(esc(it.title), 'font-weight:700') + P(esc(it.meta), MUTED) + it.lines.map((l: string) => P(esc(l))).join('') + '</div>';
  });
  (b.after || []).forEach((l: string) => { h += P(esc(l), b.kind === 'actions' ? MUTED : ''); });
  if (b.causes && b.causes.length) h += P(esc(t('dx.causes') + ' ' + g.DX.listText(b.causes) + '.'));
  if (b.check) h += P('<strong>' + esc(t('dx.check')) + '</strong> ' + esc(b.check));
  if (b.next) h += P('<strong>' + esc(t('dx.next')) + '</strong> ' + esc(b.next));
  return h + '</div>';
}
// عنوان سطر الملخص من آخر نوع ظهر (last_code). المراجعة الثانية للمرحلة ٥: تنبيه الأداء على الإعلان ممكن يبقى أي نوع من عيلته
// (والإرهاق بيعلّي مستوى «انخفاض النتائج» أو «إنفاق أعلى من المعتاد» لـ«عاجل») — كانوا بيقعوا على «توقف الإعلان» لأنهم مش هنا
const KIND_TITLE: Record<string, string> = {
  waste: 'al.waste3.t', 'waste-week': 'al.wasteWeek.t', 'waste-early': 'al.wasteEarly.t', loss: 'al.loss.t', 'cost-max': 'al.costMax.t', stopped: 'al.stopped.t', cpr: 'al.cpr.t', fatigue: 'al.fatigue.t',
  'waste-view': 'al.wasteView.t', 'waste-new': 'al.wasteNew.t', 'roas-drop': 'al.roasDrop.t', 'low-roas': 'al.lowRoas.t', spike: 'al.spike.t', drop: 'al.drop.t',
  'acct-status': 'al.acct.t', 'spend-cap': 'al.cap.t', 'acct-stopped': 'al.acctStopped.t', 'acct-zero': 'al.acctZero.t', 'acct-drop': 'al.acctDrop.t',
  'top-stopped': 'al.topStopped.t', 'spend-cap-near': 'al.capNear.t', 'tracking-off': 'al.trackOff.t', 'lpv-drop': 'al.lpvDrop.t',
  'checkout-off': 'al.buyOff.t', 'link-broken': 'al.link.t'
};
// التعديل الكبير حدث لحظي مش مشكلة ليها «حُلّت/مستمرة» — مبيظهرش في الملخص
const NO_STATUS: Record<string, boolean> = { expiry: true, 'big-edit': true };
// التنبيهات العاجلة اللي اتبعتت من أول الفترة (أو لسه قائمة): «حُلّت» أو «مستمرة» — من البصمات، من غير أي أرقام
function alertStatusHtml(marks: Record<string, Mark>, cands: any[], since: string, tz: string, en: boolean, target: Target = null): string | null {
  const from = Date.parse(since + 'T00:00:00Z') - 86400000;
  const list = Object.keys(marks).map((k) => marks[k]).filter((m) => !NO_STATUS[m.kind] &&
    (Date.parse(m.first_at) >= from || !m.resolved_at || Date.parse(m.resolved_at as string) >= from))
    .sort((a, b) => (a.first_at < b.first_at ? 1 : -1)).slice(0, 8);
  if (!list.length) return null;
  const t = g.I18N.t;
  const rows = list.map((m) => {
    // العنصر: إعلان (رقمه)، أو حملة («c:رقمها»)، أو صفحة رابط («u:…» — العنوان كفاية)
    const camp = m.object_id.indexOf('c:') === 0 ? cands.find((x) => x.campaignId === m.object_id.slice(2)) : null;
    const c = m.object_id && !camp && m.object_id.indexOf('u:') !== 0 ? cands.find((x) => x.id === m.object_id) : null;
    const key = (c && c.resultKey) || 'purchase', code = m.last_code || m.kind;
    const title = m.kind === 'connection' ? (en ? 'We lost access to the account' : 'توقف وصولنا إلى الحساب')
      : t(code === 'loss' && target && target.be > 1 ? 'al.lossBE.t' : (KIND_TITLE[code] || 'al.stopped.t'), { label: g.I18N.resultAny(key), one1: t('res1.' + key) });   // حد خسارة فوق ١ = «أقل من حد الخسارة» مش «أقل من التكلفة»
    const name = !m.object_id || m.object_id.indexOf('u:') === 0 ? ''
      : (camp ? t('al.topStopped.camp', { name: camp.campaignName || '' })
        : (c ? (c.offer || c.headline || '') : (en ? 'an ad that is no longer running' : 'إعلان لم يعد يعمل')));
    const ok = !!m.resolved_at;
    const status = '<span style="font-weight:700;color:' + (ok ? '#15803d' : '#b91c1c') + '">' + (ok ? (en ? 'resolved' : 'حُلّت') : (en ? 'ongoing' : 'مستمرة')) + '</span>';
    const sent = en ? 'sent ' + dateText(m.first_at, tz, true) : 'أُرسل ' + dateText(m.first_at, tz, false);
    return P('<strong>' + esc(title) + '</strong>' + (name ? ' — ' + esc(name) : '') + ': ' + status + ' <span style="' + MUTED + '">(' + esc(sent) + ')</span>');
  });
  return '<div style="border-inline-start:4px solid #b91c1c;padding:2px 12px;margin:0 0 20px">' +
    P(esc(en ? 'Urgent alerts since the previous summary' : 'التنبيهات العاجلة منذ الملخص السابق'), 'font-weight:700') + rows.join('') + '</div>';
}
// محتوى ملخص حساب واحد (بيتحط في الرسالة كقسم — رسالة واحدة لكل حسابات المستخدم من ٣١ أكتوبر)
type SumSection = { account: string; name: string; sum: { composed: any; actions: any }; alerts: string | null };
function summaryParts(sec: SumSection): string[] {
  const o = sec.sum.composed, t = g.I18N.t, parts: string[] = [];
  parts.push('<div style="margin:0 0 16px">' + P(esc(o.period), MUTED) +
    P(esc(o.title), 'font-size:17px;font-weight:700;color:' + (TONE_COLOR[o.tone] || TONE_COLOR.neutral)) + '</div>');
  if (o.basis) parts.push('<div>' + P(esc(o.basis)) + '</div>');
  if (o.kpis && o.kpis.length) {
    const td = 'padding:7px 0;border-bottom:1px solid #e5e7eb';
    parts.push('<div style="margin:0 0 20px"><table role="presentation" style="border-collapse:collapse;width:100%">' +
      o.kpis.map((k: any) => '<tr><td style="' + td + '">' + esc(k.label) + '</td><td style="' + td + ';padding-inline:8px;font-weight:700">' + esc(k.value) +
        '</td><td style="' + td + ';' + MUTED + '">' + esc(t('dx.kpi.prev', { v: k.prev })) + '</td></tr>').join('') + '</table></div>');
  }
  if (o.platCmp) parts.push('<div>' + P(esc(o.platCmp), MUTED) + '</div>');
  if (o.costCmp) parts.push('<div>' + P(esc(o.costCmp), MUTED) + '</div>');
  // بطاقة «مستقر» عنوانها هو نفس العنوان الرئيسي فوق — منكررهوش
  (o.blocks || []).forEach((b: any) => parts.push(blockHtml(b.kind === 'note' && b.title === o.title ? { ...b, title: '' } : b)));
  if (sec.sum.actions) parts.push(blockHtml(sec.sum.actions));
  if (sec.alerts) parts.push(sec.alerts);
  (o.notes || []).forEach((x: string) => parts.push('<div>' + P(esc(x), MUTED) + '</div>'));
  return parts;
}
function summaryText(sec: SumSection): string {
  const acts = sec.sum.actions ? [sec.sum.actions.title].concat(sec.sum.actions.lines || [],
    (sec.sum.actions.items || []).map((it: any) => '• ' + it.title + ' (' + it.meta + ')\n  ' + it.lines.join('\n  ')), sec.sum.actions.after || []).join('\n') : '';
  return g.DX.toText(sec.sum.composed, sec.name) + (acts ? '\n\n' + acts : '');
}
// missing = حسابات في الملخص مقدرناش نقرا أرقامها (الوصول ضاع) — سطر واحد بأسمائها بدل ما تختفي في صمت
function summaryMail(secs: SumSection[], since: string, until: string, s: Settings, en: boolean, stop: string, monthly = false, missing: string[] = []) {
  const one = secs.length === 1 ? secs[0] : null;
  const range = g.fmtRange(since, until);
  // الشهري: «الملخص الشهري لـ X (سبتمبر): …»
  const monthName = g.I18N.months()[Number(since.slice(5, 7)) - 1];
  const who = one ? one.name : (en ? 'your accounts' : 'حساباتك');
  const head = one ? one.sum.composed.title : accountsPhrase(secs.length, en);
  const subject = monthly
    ? (en ? (one ? one.name : 'Your accounts') + ' monthly summary, ' + monthName + ': ' : 'الملخص الشهري لـ' + who + ' (' + monthName + '): ') + head
    : (en ? (one ? one.name : 'Your accounts') + ' summary, ' + range + ': ' : 'ملخص ' + who + ' (' + range + '): ') + head;
  const parts: string[] = [];
  secs.forEach((sec) => {
    if (!one) parts.push('<p style="margin:22px 0 10px;font-size:18px;font-weight:700;line-height:1.6;border-bottom:1px solid #e5e7eb;padding-bottom:6px">' +
      esc(sec.name) + '</p>');
    parts.push(...summaryParts(sec));
    if (!one) parts.push('<div>' + P((en ? 'Details: ' : 'التفاصيل: ') + appLink(sec.account), MUTED) + '</div>');
  });
  if (missing.length) {
    parts.push('<div>' + P(esc(en ? 'We could not read the figures of: ' + missing.join(', ') + ' — open the tool and log in to the platform again.'
      : 'لم نستطع قراءة أرقام: ' + missing.join('، ') + '، فافتح الأداة وسجّل الدخول إلى المنصة مرة أخرى.'), MUTED) + '</div>');
  }
  const days = daysText(s.summary_days || [0, 3], en ? 'en' : 'ar'), hour = hourText(s.summary_hour == null ? 9 : s.summary_hour, en ? 'en' : 'ar');
  const target = one ? '<strong>' + esc(one.name) + '</strong>' : (en ? 'your accounts' : 'حساباتك');
  const tz = esc(s.timezone || 'UTC'), app = one ? appLink(one.account) : appLink('');
  parts.push(monthly
    ? (en ? 'You receive this monthly summary for ' + target + ' on the first Sunday of each month, alongside your summary on ' + days + '. Full details are in ' + app + '.'
      : 'يصلك هذا الملخص الشهري لـ' + target + ' في أول أحد من كل شهر، إلى جانب ملخصك ' + days + '. التفاصيل الكاملة في ' + app + '.')
    : (en
      ? 'You receive this summary for ' + target + ' on ' + days + ' at ' + hour + ' (' + tz + '). Full details are in ' + app + '; to add accounts or change the schedule open the tool, then "Settings", then "Automatic summary by email".'
      : 'يصلك هذا الملخص لـ' + target + ' ' + days + ' الساعة ' + hour + ' (' + tz + '). التفاصيل الكاملة في ' + app + '، ولإضافة حسابات أو تعديل المواعيد: افتح الأداة، ثم «الإعدادات»، ثم «الملخص التلقائي بالبريد».'));
  parts.push(en ? 'To stop the summary and alerts: <a href="' + stop + '">Stop</a>' : 'لإيقاف الملخص والتنبيهات: <a href="' + stop + '">إيقاف</a>');
  const heading = esc(monthly ? (en ? 'Monthly summary — ' + (one ? one.name : 'your accounts') + ', ' + monthName : 'الملخص الشهري — ' + who + '، ' + monthName)
    : (en ? 'Store summary — ' + (one ? one.name : 'your accounts') : (one ? 'ملخص المتجر — ' + one.name : 'ملخص حساباتك')));
  const text = subject + '\n\n' + secs.map(summaryText).join('\n\n— — —\n\n') + '\n\n' + stop;
  return { subject, html: mailHtml(heading, parts, en ? 'en' : 'ar'), text };
}

// ---------- فحص ملخص مستخدم ----------
// من ٣١ أكتوبر ٢٠٢٦ (قرار صاحب المنتج: «اجعلها لكل مستخدم ملخص خاص به»): ملخص لكل مستخدم فيه حساباته، بإعداداته وعلى بريده.
// الفحص العاجل لكل حساب مرة في الساعة (checked_at للمستخدم والحساب)، ورسالة عاجلة واحدة للمستخدم فيها كل حساباته، والملخص رسالة
// واحدة فيها قسم لكل حساب. نفس الحساب عند أكتر من مستخدم: الإعلانات بتتجاب مرة في التشغيل (RUN_CANDS)، وكل مستخدم صلاحيته بتتأكد لوحدها
type Settings = { user_id: string; email: string; lang: string; timezone: string; summary_days: number[]; summary_hour: number; last_summary_until: string | null;
  last_monthly?: string | null };
type DAcct = { user_id: string; platform: string; account_id: string; checked_at: string | null };
// الفحص العاجل مرة في الساعة لكل حساب، مع إن المُشغّل بيشتغل كل ١٠ دقايق (عشان الملخصات اللي ميعادها واحد متتأخرش)
function urgentDueFor(a: DAcct): boolean { return !a.checked_at || Date.now() - Date.parse(a.checked_at) >= URGENT_EVERY_MS; }
const RUN_CANDS = new Map<string, any[]>();
// الملخص بيستنى التشغيل الجاي لو أرقام حساب فشلت مؤقتاً — وبعد ٣ ساعات من ميعاده بيتبعت بالحسابات اللي اتقرت
const SUMMARY_PARTIAL_AFTER_H = 3;

type AcctResult = { account: string; name: string; outcome: string; section: Section | null; keep: Mark[]; sentRows: Mark[];
  summary: SumSection | null; monthly: SumSection | null };
async function checkUserAccount(s: Settings, a: DAcct, us: Record<string, unknown> | null,
  o: { doUrgent: boolean; due: { since: string; until: string } | null; monthly: { since: string; until: string } | null; stop: string }): Promise<AcctResult> {
  const user = s.user_id, account = a.account_id, en = s.lang === 'en', tz = s.timezone || 'UTC';
  const res: AcctResult = { account, name: (await accountName(account)) || account, outcome: 'error', section: null, keep: [], sentRows: [], summary: null, monthly: null };
  const rows = await rpc('vault_user_get', { p_user: user, p_account: account });
  const t = Array.isArray(rows) && rows[0] ? rows[0] : null;
  const marks = await marksOf(user, account);
  const now = Date.now(), iso = new Date(now).toISOString();

  // الوصول ضاع: رسالة واحدة وتذكير واحد بعد يومين (لكل حساب — رسالتها لوحدها زي الأول)
  const lostAccess = async (): Promise<AcctResult> => {
    res.outcome = 'lost';
    const m = marks['connection|'];
    const due = !m || m.resolved_at || (m.times_sent < 2 && now - Date.parse(m.last_sent_at) >= REMIND_AFTER_MS);
    if (!due) { await saveMarks(user, account, [{ ...m, last_seen_at: iso }]); return res; }
    if (await send(user, account, 'urgent', s.email, connectionMail(account, res.name, en, o.stop))) {
      await saveMarks(user, account, [m && !m.resolved_at ? { ...m, last_sent_at: iso, last_seen_at: iso, times_sent: m.times_sent + 1 } : newMark('connection', '', iso)]);
    }
    return res;
  };
  if (!t) return await lostAccess();
  let token = '';
  try { token = await unseal(t.ciphertext, t.iv, account); } catch (_) {
    // عطل عندنا (مفتاح التشفير اتغيّر؟) مش عند العميل — منبعتلوش حاجة
    await rpc('vault_user_mark_error', { p_user: user, p_account: account, p_error: 'decrypt failed' });
    res.outcome = 'decrypt-failed';
    return res;
  }
  metaToken = token;
  usage = freshUsage();
  try {
    const { acct, fail } = await accountOrFail(account);
    if (fail === 'retry') { res.outcome = 'meta-retry'; return res; }
    if (!acct) {
      await rpc('vault_user_mark_error', { p_user: user, p_account: account, p_error: 'meta rejected stored token' });
      return await lostAccess();
    }
    res.name = acct.name || account;
    const keep: Mark[] = [];
    const conn = marks['connection|'];
    if (conn && !conn.resolved_at) keep.push({ ...conn, resolved_at: iso });

    // الصلاحية قربت تخلص: رسالة واحدة (بتتحل لوحدها لما العميل يفتح الأداة وتتجدد) — مش بالليل
    const exp = marks['expiry|'];
    const expiresAt = t.expires_at ? Date.parse(t.expires_at) : NaN;
    if (isFinite(expiresAt) && expiresAt - now < EXPIRY_WARN_MS) {
      if (o.doUrgent && (!exp || exp.resolved_at)) {
        if (await send(user, account, 'expiry', s.email, expiryMail(account, res.name, t.expires_at, acct.timezone_name || tz, en, o.stop))) keep.push(newMark('expiry', '', iso));
      }
    } else if (exp && !exp.resolved_at) keep.push({ ...exp, resolved_at: iso });

    let cands = RUN_CANDS.get(account) || null;
    if (!cands) {
      cands = await loadCandidates(account, acct);
      if (cands) RUN_CANDS.set(account, cands);
    }
    if (!cands) { res.keep = keep; res.outcome = 'meta-retry'; return res; }
    // إعدادات المستخدم لحساب Meta ده — نفس اللي الأداة بتحكم بيه
    const eff = effectiveFor(us, 'meta', acct.currency || null);

    const sentRows: Mark[] = [];
    if (o.doUrgent) {
      // التعديلات من آخر فحص (أو آخر ساعتين لأول فحص)
      const editsSince = a.checked_at ? Date.parse(a.checked_at) : now - 2 * 3600000;
      const all = await allUrgent(account, acct, cands, editsSince, eff.target, eff.sens);
      const fresh: any[] = [], remind: { a: any; m: Mark }[] = [], seen: Record<string, boolean> = {};
      for (const al of all.urgent) {
        // البصمة بالعيلة (familyOf) — والنوع نفسه في last_code. التذكير بيعرض نص التنبيه الحالي، فلو المشكلة زادت («يومان» بقت
        // «أسبوع كامل») التذكير بيقولها
        const code = String(al.code || 'other'), obj = String(al.adId || al.objectId || '');
        const k = alertKey(al);
        if (seen[k]) continue;
        seen[k] = true;
        const m = marks[k];
        if (!m || m.resolved_at) { fresh.push(al); sentRows.push(newMark(familyOf(code), obj, iso, code)); }
        else if (m.times_sent < 2 && now - Date.parse(m.last_sent_at) >= REMIND_AFTER_MS) {
          remind.push({ a: al, m });
          sentRows.push({ ...m, last_sent_at: iso, last_seen_at: iso, times_sent: m.times_sent + 1, last_code: code });
        } else keep.push({ ...m, last_seen_at: iso, last_code: code });
      }
      for (const k in marks) {
        const m = marks[k];
        if (seen[k] || m.resolved_at || SYSTEM_KINDS[m.kind]) continue;
        const r = resolveNow(m, !!all.alive[k], all.failed, now);
        if (r === 'seen') keep.push({ ...m, last_seen_at: iso });
        else if (r === 'resolve') keep.push({ ...m, resolved_at: iso });
      }
      if (fresh.length || remind.length) res.section = { account, name: res.name, fresh, remind };
    }
    res.keep = keep;
    res.sentRows = sentRows;

    // الملخص (والشهري): «حُلّت/مستمرة» بحالة الساعة دي — اللي هيتبعت دلوقتي معدود كأنه اتبعت
    if (o.due || o.monthly) {
      keep.concat(sentRows).forEach((m) => { marks[familyOf(m.kind) + '|' + m.object_id] = m; });
      if (o.due) {
        const sum = await buildSummary(user, account, acct, o.due.since, o.due.until, eff.target, cands, eff.sens);
        res.summary = { account, name: res.name, sum, alerts: alertStatusHtml(marks, cands, o.due.since, acct.timezone_name || tz, en, eff.target) };
      }
      if (o.monthly) {
        const sum = await buildSummary(user, account, acct, o.monthly.since, o.monthly.until, eff.target, cands, eff.sens);
        res.monthly = { account, name: res.name, sum, alerts: alertStatusHtml(marks, cands, o.monthly.since, acct.timezone_name || tz, en, eff.target) };
      }
    }
    res.outcome = 'ok';
    return res;
  } finally {
    metaToken = '';
    mergeUsage(runUsage, usage);
  }
}

async function processUser(s: Settings, accts: DAcct[], deadline: number): Promise<string> {
  const user = s.user_id, en = s.lang === 'en', tz = s.timezone || 'UTC';
  const hour = hourIn(tz);
  const night = hour >= QUIET_FROM || hour < QUIET_UNTIL;
  const due = summaryDue(s), monthly = monthlyDue(s);
  // المرحلة ١ من الملخص لكل مستخدم: حسابات Meta (Snapchat وGoogle في المرحلتين الجاية)
  const meta = accts.filter((a) => a.platform === 'meta');
  // بالليل التنبيهات العاجلة بتستنى الصبح، بس الملخص بيتبعت في الساعة اللي العميل اختارها حتى لو بدري
  const urgentNow: Record<string, boolean> = {};
  if (!night) meta.forEach((a) => { if (urgentDueFor(a)) urgentNow[a.account_id] = true; });
  const work = due || monthly ? meta : meta.filter((a) => urgentNow[a.account_id]);
  if (!work.length) return night ? 'quiet' : 'skip';

  g.I18N.setLang(en ? 'en' : 'ar');
  const stop = await stopUrl(user);
  const us = await userSettingsOf(user);
  const results: AcctResult[] = [];
  for (const a of work) {
    if (Date.now() > deadline) break;
    try {
      results.push(await checkUserAccount(s, a, us, { doUrgent: !!urgentNow[a.account_id], due, monthly, stop }));
    } catch (e) {
      console.error('runner account failed', String((e as Error).message || e).slice(0, 200));
      results.push({ account: a.account_id, name: a.account_id, outcome: 'error', section: null, keep: [], sentRows: [], summary: null, monthly: null });
    }
  }
  const complete = results.length === work.length;

  // التنبيه العاجل: رسالة واحدة بكل الحسابات. الرسالة الأول، والبصمات بعدها: لو الإرسال فشل، الساعة الجاية بتحاول تاني
  let outcome = results.map((r) => r.outcome).filter((x, i, l) => l.indexOf(x) === i).join(',');
  const sections = results.filter((r) => r.section).map((r) => r.section as Section);
  let sent = false;
  if (sections.length) {
    const anyFresh = sections.some((x) => x.fresh.length > 0);
    sent = await send(user, sections[0].account, anyFresh ? 'urgent' : 'reminder', s.email, urgentMail(sections, tz, en, stop));
    outcome += sent ? (anyFresh ? '+sent' : '+reminded') : '+send-failed';
  }
  for (const r of results) {
    await saveMarks(user, r.account, sent ? r.keep.concat(r.sentRows) : r.keep);
    // عطل أو فحص تم: الفحص الجاي بعد ساعة مش بعد ١٠ دقايق
    if (urgentNow[r.account] || r.outcome !== 'ok') await markChecked(user, r.account);
  }

  // الملخص والشهري: بعد ما كل الحسابات تتقري. عطل مؤقت في حساب = التشغيل الجاي، وبعد ٣ ساعات من الميعاد بالحسابات اللي اتقرت
  const late = hourIn(tz) >= (s.summary_hour == null ? 9 : s.summary_hour) + SUMMARY_PARTIAL_AFTER_H;
  const retrying = results.some((r) => r.outcome === 'meta-retry' || r.outcome === 'error');
  const missing = results.filter((r) => r.outcome === 'lost' || r.outcome === 'decrypt-failed' || (late && (r.outcome === 'meta-retry' || r.outcome === 'error'))).map((r) => r.name);
  const ready = complete && (!retrying || late);
  for (const kind of ['summary', 'monthly'] as const) {
    const win = kind === 'summary' ? due : monthly;
    if (!win) continue;
    if (!ready) { outcome += '+' + kind + '-deferred'; continue; }
    const secs = results.map((r) => (kind === 'summary' ? r.summary : r.monthly)).filter(Boolean) as SumSection[];
    if (!secs.length) { outcome += '+' + kind + '-empty'; continue; }
    if (await send(user, secs[0].account, kind, s.email, summaryMail(secs, win.since, win.until, s, en, stop, kind === 'monthly', missing))) {
      const patch = kind === 'summary' ? { last_summary_until: win.until } : { last_monthly: (win as { month: string }).month };
      await db('user_digests?user_id=eq.' + user, { method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(patch) });
      outcome += '+' + kind;
    } else outcome += '+' + kind + '-failed';
  }
  return outcome;
}

// ---------- نقاط الدخول ----------
export async function runAll(): Promise<Record<string, unknown>> {
  const started = Date.now();
  runUsage = freshUsage();
  RUN_CANDS.clear();
  // تذكير طلبات الانضمام المتأخرة (join.ts) — قبل المحرك، عشان لو GitHub وقع التذكير ميتأخرش
  let joinReminded = 0;
  try { joinReminded = await joinReminders(); } catch (e) { console.error('join reminders failed', String((e as Error).message || e).slice(0, 200)); }
  const outdated = await loadEngine();
  if (outdated.length) await rpc('beat', { p_source: 'runner-engine-outdated' }).catch(() => {});
  const r = await db('user_digests?select=user_id,email,lang,timezone,summary_days,summary_hour,last_summary_until,last_monthly&enabled=is.true&limit=500', { method: 'GET' });
  const all = (await r.json()) as Settings[];
  const ra = await db('user_digest_accounts?select=user_id,platform,account_id,checked_at&limit=5000', { method: 'GET' });
  const byUser: Record<string, DAcct[]> = {};
  ((await ra.json()) as DAcct[]).forEach((a) => { (byUser[a.user_id] = byUser[a.user_id] || []).push(a); });
  // الملخصات اللي ميعادها جه الأول، وبعدها الفحص العاجل الأقدم — واللي مفيش عليه حاجة بيتخطّى من غير أي طلب
  const mailDue = (s: Settings) => (summaryDue(s) || monthlyDue(s) ? 1 : 0);
  const oldest = (s: Settings) => Math.min(...(byUser[s.user_id] || []).map((a) => (a.checked_at ? Date.parse(a.checked_at) : 0)), Date.now());
  const list = all.filter((s) => (byUser[s.user_id] || []).length && (mailDue(s) || (byUser[s.user_id] || []).some(urgentDueFor)))
    .sort((a, b) => (mailDue(b) - mailDue(a)) || (oldest(a) - oldest(b)));
  const outcomes: Record<string, number> = {};
  for (const s of list) {
    if (Date.now() - started > TIME_BUDGET_MS) { outcomes.deferred = (outcomes.deferred || 0) + 1; continue; }
    let out = 'error';
    try {
      out = await exclusive(() => {
        runDeadline = started + RUN_DEADLINE_MS;
        return processUser(s, byUser[s.user_id] || [], started + TIME_BUDGET_MS).finally(() => { runDeadline = 0; });
      });
    } catch (e) {
      // النوع والرسالة بس — من غير أي بيانات حساب. ومنعيدوش كل ١٠ دقايق لحد الساعة الجاية
      console.error('runner user failed', String((e as Error).message || e).slice(0, 200));
      for (const a of byUser[s.user_id] || []) if (urgentDueFor(a)) await markChecked(s.user_id, a.account_id);
    }
    outcomes[out] = (outcomes[out] || 0) + 1;
  }
  await rpc('beat', { p_source: 'runner' }).catch(() => {});
  // meta = مستوى الوصول وأعلى استهلاك لحدود Meta في التشغيل ده (من غير أي بيانات حساب)
  return { users: all.length, due: list.length, outcomes, engineOutdated: outdated, joinReminded, meta: runUsage };
}
async function markChecked(user: string, account: string): Promise<void> {
  await db('user_digest_accounts?user_id=eq.' + user + '&platform=eq.meta&account_id=eq.' + account, {
    method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify({ checked_at: new Date().toISOString() })
  }).catch(() => {});
}

// معاينة الملخص لمدير التطبيق بس: نفس الرسالة بالظبط لفترة معيّنة (أو زي ما كانت هتتبعت النهارده بالمواعيد الافتراضية)،
// بمفتاح المدير نفسه وإعداداته هو (user)، من غير إرسال ولا تسجيل أي حاجة
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
export async function previewSummary(token: string, accountId: string, lang: string, since?: string, until?: string, monthly = false, user = ''): Promise<Record<string, unknown>> {
  const outdated = await loadEngine();
  return await exclusive(async () => {
    metaToken = token;
    usage = freshUsage();
    try {
      const en = lang === 'en';
      g.I18N.setLang(en ? 'en' : 'ar');
      const { acct, fail } = await accountOrFail(accountId);
      if (!acct) return { error: fail };
      const tz = acct.timezone_name || 'UTC';
      let win = since && until && DAY_KEY.test(since) && DAY_KEY.test(until) && since <= until && g.keyDiffDays(since, until) < 31 ? { since, until } : null;
      // الشهري من غير فترة = الشهر اللي فات كله (زي ما هيتبعت أول أحد)
      if (!win && monthly) { const lp = localParts(tz); const u = g.shiftKey(lp.key.slice(0, 8) + '01', -1); win = { since: u.slice(0, 8) + '01', until: u }; }
      if (!win) { const lp = localParts(tz); win = summaryWindow([0, 3], null, lp.key, lp.dow); }
      if (!win) return { error: 'window' };
      const s: Settings = { user_id: user, email: '', lang: en ? 'en' : 'ar', timezone: tz, summary_days: [0, 3], summary_hour: 9, last_summary_until: null };
      const cands = (await loadCandidates(accountId, acct)) || [];
      const eff = effectiveFor(user ? await userSettingsOf(user) : null, 'meta', acct.currency || null);
      const sum = await buildSummary(user, accountId, acct, win.since, win.until, eff.target, cands, eff.sens);
      const alerts = alertStatusHtml(user ? await marksOf(user, accountId) : {}, cands, win.since, tz, en, eff.target);
      const mail = summaryMail([{ account: accountId, name: acct.name || accountId, sum, alerts }], win.since, win.until, s, en, await stopUrl(user), monthly);
      return { engineCommit: ENGINE_COMMIT, engineOutdated: outdated, metaUsage: usage, since: win.since, until: win.until, subject: mail.subject, html: mail.html, text: mail.text };
    } finally {
      metaToken = '';
    }
  });
}

// معاينة لمدير التطبيق بس (index.ts بيتأكد): الرسالة العاجلة اللي كانت هتتبعت للحساب دلوقتي — بمفتاح المدير نفسه وإعداداته،
// من غير إرسال ولا بصمات. للتجربة قبل ما أي عميل يفعّل الملخص
export async function preview(token: string, accountId: string, lang: string, user = ''): Promise<Record<string, unknown>> {
  const outdated = await loadEngine();
  return await exclusive(async () => {
    metaToken = token;
    usage = freshUsage();
    try {
      const en = lang === 'en';
      g.I18N.setLang(en ? 'en' : 'ar');
      const { acct, fail } = await accountOrFail(accountId);
      if (!acct) return { error: fail };
      const cands = await loadCandidates(accountId, acct);
      if (!cands) return { error: 'retry' };
      // المعاينة: التعديلات الكبيرة من آخر ٢٤ ساعة (عشان تبان أمثلة)
      const eff = effectiveFor(user ? await userSettingsOf(user) : null, 'meta', acct.currency || null);
      const urgent = (await allUrgent(accountId, acct, cands, Date.now() - 24 * 3600000, eff.target, eff.sens)).urgent;
      const mail = urgentMail([{ account: accountId, name: acct.name || accountId, fresh: urgent, remind: [] }], acct.timezone_name || 'UTC', en, await stopUrl(user));
      return {
        engineCommit: ENGINE_COMMIT, engineOutdated: outdated, metaUsage: usage, ads: cands.length,
        urgent: urgent.map((a: any) => ({ code: a.code || null, adId: a.adId || null, objectId: a.objectId || null, title: a.title, detail: a.detail })),
        subject: urgent.length ? mail.subject : null, html: urgent.length ? mail.html : null
      };
    } finally {
      metaToken = '';
    }
  });
}
