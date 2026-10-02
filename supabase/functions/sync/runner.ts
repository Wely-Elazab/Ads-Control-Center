// المُشغّل: كل ساعة لكل حساب مفعّل له الملخص التلقائي (pg_cron → action: run):
//   - فحص التنبيهات العاجلة (مش بالليل)
//   - الملخص في الأيام والساعة اللي العميل اختارها بتوقيت الحساب: الأيام من آخر ملخص، مقارنةً بالفترة اللي قبلها
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

const ENGINE_COMMIT = 'cf6e3cfd50095567488d99a91e566135a23d7de4';
const ENGINE_FILES = ['i18n.js', 'alerts.js', 'core.js', 'diagnosis.js', 'meta.js'];
const ENGINE_RAW = 'https://raw.githubusercontent.com/Wely-Elazab/Ads-Control-Center/' + ENGINE_COMMIT + '/Live/js/';

const QUIET_FROM = 23, QUIET_UNTIL = 7;   // مفيش رسائل بالليل بتوقيت الحساب — اللي يظهر بالليل بيتبعت ٧ الصبح لو لسه قائم
const REMIND_AFTER_MS = 48 * 3600000;     // تذكير واحد بس، لو المشكلة استمرت يومين بعد أول رسالة
const RESOLVE_AFTER_MS = 24 * 3600000;    // «اتحلّت» = مظهرتش ٢٤ ساعة كاملة (اختفاء ساعة ورجوع = نفس المشكلة)
const EXPIRY_WARN_MS = 5 * 86400000;      // صلاحية Meta هتخلص خلال ٥ أيام → رسالة واحدة تطلب فتح الأداة
const TIME_BUDGET_MS = 110000;            // حد الدالة ١٥٠ ثانية — منبدأش حساب بعد كده، والباقي في التشغيل الجاي (بعد ١٠ دقايق)
const URGENT_EVERY_MS = 50 * 60000;       // الفحص العاجل مرة في الساعة تقريباً لكل حساب (التشغيل نفسه كل ١٠ دقايق)
const SYSTEM_KINDS: Record<string, boolean> = { connection: true, expiry: true };

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

// FB.api بتاع المتصفح → Graph API بمفتاح الحساب اللي بنفحصه دلوقتي (حساب واحد في المرة — exclusive تحت)
let metaToken = '';
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
  const r = await fetch(url, method === 'GET' ? undefined : { method, body: form });
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
        const r = await fetch(ENGINE_RAW + f);
        if (!r.ok) throw new Error('engine ' + f + ' ' + r.status);
        return await r.text();
      }));
      installShims();
      for (const src of texts) (0, eval)(src);
      if (!g.PauseProofAlerts || !g.I18N || !g.DX || typeof g.transformRealAd !== 'function' || typeof g.adsPromise !== 'function' ||
        typeof g.metaDiagnosisInput !== 'function' || typeof g.metaActivities !== 'function') throw new Error('engine incomplete');
      const live = await Promise.all(ENGINE_FILES.map((f) => fetch(SITE + '/js/' + f).then((r) => (r.ok ? r.text() : null)).catch(() => null)));
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
  const reachP = g.fbPagesPromise('/' + accountId + '/insights', {
    level: 'ad', time_range: timeRange, fields: 'ad_id,frequency,reach,impressions', limit: 500
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
  return order.map((id) => {
    const c = g.transformRealAd(byId[id], insights[id] || [], adsets, days, reachBy[id], acct.currency || null, info, null);
    c.source = 'meta:' + accountId;
    return c;
  });
}

// محرك الأداة بإعداداته الافتراضية (إعدادات حساسية العميل محفوظة في متصفحه بس) — العاجل بس
function urgentAlerts(accountId: string, acct: Acct, cands: any[]): any[] {
  const source = 'meta:' + accountId;
  const meta = {
    [source]: {
      label: 'Meta — ' + (acct.name || accountId), currency: acct.currency || null,
      metaAccountStatus: acct.account_status != null ? Number(acct.account_status) : null,
      spendCapReached: Number(acct.spend_cap) > 0 && Number(acct.amount_spent) >= Number(acct.spend_cap),
      spendCap: Number(acct.spend_cap) || 0, amountSpent: Number(acct.amount_spent) || 0
    }
  };
  const res = g.PauseProofAlerts.analyze(cands, meta, {}, alertFmt());
  return res.alerts.filter((a: any) => a.level === 'critical' && !a.minor);
}
function alertFmt() {
  return { money: g.money, currencyLabel: g.currencyLabel, num: g.numAr, int: (n: number) => g.ar(Math.round(n || 0)) };
}

// ---------- التنبيهات اللي محتاجة بيانات زيادة (قواعدها في js/alerts.js: siteAlerts / editAlerts / linkAlerts) ----------
// editsSince = آخر فحص عاجل: التعديلات الأحدث منه بس، فكل تعديل بيتقيّم مرة واحدة
async function extraAlerts(accountId: string, acct: Acct, cands: any[], editsSince: number): Promise<any[]> {
  const tz = acct.timezone_name || 'UTC', cur = acct.currency || null, fmt = alertFmt(), out: any[] = [];
  const fail = (what: string, e: unknown) => console.error('extra alerts ' + what, String((e as Error).message || e).slice(0, 160));
  try { out.push(...g.PauseProofAlerts.siteAlerts(await g.metaSiteDays(accountId, tz), fmt)); } catch (e) { fail('site', e); }
  try {
    const acts = await g.metaActivities(accountId, g.shiftKey(g.todayKeyInTz(tz), -1));
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
  return out;
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
    if (!c.active || c.landingKind !== 'website' || ((d[5] || 0) + (d[6] || 0)) <= 0 || /\{\{/.test(c.landing || '')) return;
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
async function allUrgent(accountId: string, acct: Acct, cands: any[], editsSince: number): Promise<any[]> {
  const base = urgentAlerts(accountId, acct, cands), extra = await extraAlerts(accountId, acct, cands, editsSince);
  const stopped: Record<string, boolean> = {};
  base.forEach((a: any) => { if (a.code === 'top-stopped') stopped[String(a.adId || String(a.objectId || '').replace(/^c:/, ''))] = true; });
  return base.concat(extra.filter((a: any) => !(a.code === 'big-edit' && stopped[String(a.objectId || '').split('@')[0]])));
}

// ---------- البصمات ----------
type Mark = { kind: string; object_id: string; first_at: string; last_sent_at: string; last_seen_at: string; times_sent: number; resolved_at: string | null };
async function marksOf(account: string): Promise<Record<string, Mark>> {
  const r = await db('alert_marks?select=kind,object_id,first_at,last_sent_at,last_seen_at,times_sent,resolved_at&account_id=eq.' + account, { method: 'GET' });
  const out: Record<string, Mark> = {};
  ((await r.json()) as Mark[]).forEach((m) => { out[m.kind + '|' + m.object_id] = m; });
  return out;
}
async function saveMarks(account: string, rows: Mark[]): Promise<void> {
  if (!rows.length) return;
  await db('alert_marks?on_conflict=account_id,kind,object_id', {
    method: 'POST', headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows.map((r) => ({ account_id: account, ...r })))
  });
}
function newMark(kind: string, obj: string, iso: string): Mark {
  return { kind, object_id: obj, first_at: iso, last_sent_at: iso, last_seen_at: iso, times_sent: 1, resolved_at: null };
}
async function logSend(account: string, type: string, status: string, id: string | null, error: string | null): Promise<void> {
  await db('send_log', { method: 'POST', headers: { 'prefer': 'return=minimal' },
    body: JSON.stringify({ account_id: account, type, status, provider_id: id, error: error ? error.slice(0, 200) : null }) }).catch(() => {});
}
async function send(account: string, type: string, to: string, mail: { subject: string; html: string; text: string }): Promise<boolean> {
  try {
    const id = await sendEmail(to, mail.subject, mail.html, mail.text);
    await logSend(account, type, 'sent', id, null);
    return true;
  } catch (e) {
    await logSend(account, type, 'failed', null, String((e as Error).message || e));
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
    (note ? '<p style="' + muted + '">' + esc(note) + '</p>' : '') +
    '<p style="margin:0;line-height:1.8">' + esc(a.advice) + '</p></div>';
}
function countPhrase(n: number, en: boolean): string {
  if (en) return n + ' things need action';
  if (n === 2) return 'أمران يحتاجان إلى إجراء';
  return g.ar(n) + (n <= 10 ? ' أمور تحتاج' : ' أمراً يحتاج') + ' إلى إجراء';
}
function urgentMail(name: string, fresh: any[], remind: { a: any; m: Mark }[], tz: string, en: boolean, stop: string) {
  const n = esc(name), app = '<a href="' + SITE + '/app">Ads Center</a>';
  const subject = fresh.length
    ? (en ? 'Urgent: ' + (fresh.length === 1 ? fresh[0].title : countPhrase(fresh.length, true)) + ' — ' + name
      : 'عاجل: ' + (fresh.length === 1 ? fresh[0].title : countPhrase(fresh.length, false)) + ' — ' + name)
    : (en ? 'Reminder: ' + (remind.length === 1 ? remind[0].a.title + ' is still ongoing' : 'urgent issues still ongoing') + ' — ' + name
      : 'تذكير: ' + (remind.length === 1 ? '«' + remind[0].a.title + '» ما زال قائماً' : 'تنبيهات عاجلة ما زالت قائمة') + ' — ' + name);
  const lines: string[] = [];
  if (fresh.length) {
    lines.push(en ? 'We found something in <strong>' + n + '</strong> that needs your attention now:'
      : 'رصدنا في حساب <strong>' + n + '</strong> ما يحتاج إلى انتباهك الآن:');
    fresh.forEach((a) => lines.push(alertBox(a, null)));
  }
  if (remind.length) {
    lines.push(en ? 'Still ongoing since our first alert:' : 'وما زال قائماً منذ أبلغناك به:');
    remind.forEach((r) => lines.push(alertBox(r.a, en ? 'We first alerted you on ' + dateText(r.m.first_at, tz, true) + '.'
      : 'أبلغناك به أول مرة يوم ' + dateText(r.m.first_at, tz, false) + '.')));
  }
  lines.push(en ? 'Full details are in ' + app + '.' : 'التفاصيل الكاملة في ' + app + '.');
  lines.push(en ? 'We don\'t repeat the same alert: we remind you once if it lasts two more days, and your next summary shows whether it was resolved.'
    : 'لا نكرر التنبيه نفسه: نذكّرك به مرة واحدة إذا استمر يومين، ويبيّن ملخصك التالي هل حُلّ أم ما زال قائماً.');
  lines.push(en ? 'To stop the summary and alerts: <a href="' + stop + '">Stop</a>' : 'لإيقاف الملخص والتنبيهات: <a href="' + stop + '">إيقاف</a>');
  return { subject, html: mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text: plain(subject, lines) + '\n' + stop };
}
function connectionMail(name: string, en: boolean, stop: string) {
  const n = esc(name), app = '<a href="' + SITE + '/app">Ads Center</a>';
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
function expiryMail(name: string, expiresAt: string, tz: string, en: boolean, stop: string) {
  const n = esc(name), app = '<a href="' + SITE + '/app">Ads Center</a>';
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
async function feedbackOf(account: string): Promise<any[]> {
  const r = await db('feedback?select=block,since,until,verdict,reasons,note&view_key=eq.' + encodeURIComponent('meta:' + account) + '&limit=200', { method: 'GET' }).catch(() => null);
  const rows = r ? await r.json().catch(() => null) : null;
  return Array.isArray(rows) ? rows : [];
}
// التقرير (DX) + التعديلات ونتيجتها. لو سجل التعديلات فشل، الملخص بيكمّل من غيره
async function buildSummary(accountId: string, acct: Acct, since: string, until: string): Promise<{ composed: any; actions: any }> {
  const tz = acct.timezone_name || 'UTC';
  const input = await g.metaDiagnosisInput(accountId, since, until, true);
  input.currency = acct.currency || null;
  input.timezone = tz;
  input.feedback = await feedbackOf(accountId);
  const composed = g.DX.compose(g.DX.analyze(input), { mail: true });
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
const KIND_TITLE: Record<string, string> = {
  waste: 'al.waste.t', 'waste-early': 'al.wasteEarly.t', loss: 'al.loss.t', stopped: 'al.stopped.t', cpr: 'al.cpr.t', fatigue: 'al.fatigue.t',
  'acct-status': 'al.acct.t', 'spend-cap': 'al.cap.t', 'acct-stopped': 'al.acctStopped.t', 'acct-zero': 'al.acctZero.t',
  'top-stopped': 'al.topStopped.t', 'spend-cap-near': 'al.capNear.t', 'tracking-off': 'al.trackOff.t', 'lpv-drop': 'al.lpvDrop.t',
  'checkout-off': 'al.buyOff.t', 'link-broken': 'al.link.t'
};
// التعديل الكبير حدث لحظي مش مشكلة ليها «حُلّت/مستمرة» — مبيظهرش في الملخص
const NO_STATUS: Record<string, boolean> = { expiry: true, 'big-edit': true };
// التنبيهات العاجلة اللي اتبعتت من أول الفترة (أو لسه قائمة): «حُلّت» أو «مستمرة» — من البصمات، من غير أي أرقام
function alertStatusHtml(marks: Record<string, Mark>, cands: any[], since: string, tz: string, en: boolean): string | null {
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
    const key = (c && c.resultKey) || 'purchase';
    const title = m.kind === 'connection' ? (en ? 'We lost access to the account' : 'توقف وصولنا إلى الحساب')
      : t(KIND_TITLE[m.kind] || 'al.stopped.t', { label: g.I18N.resultAny(key), one1: t('res1.' + key) });
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
function summaryMail(name: string, since: string, until: string, sum: { composed: any; actions: any }, alerts: string | null, s: Settings, en: boolean, stop: string) {
  const o = sum.composed, t = g.I18N.t, n = esc(name), app = '<a href="' + SITE + '/app">Ads Center</a>';
  const range = g.fmtRange(since, until);
  const subject = (en ? name + ' summary, ' + range + ': ' : 'ملخص ' + name + ' (' + range + '): ') + o.title;
  const parts: string[] = [];
  parts.push('<div style="margin:0 0 16px">' + P(esc(o.period), MUTED) +
    P(esc(o.title), 'font-size:17px;font-weight:700;color:' + (TONE_COLOR[o.tone] || TONE_COLOR.neutral)) + '</div>');
  if (o.kpis && o.kpis.length) {
    const td = 'padding:7px 0;border-bottom:1px solid #e5e7eb';
    parts.push('<div style="margin:0 0 20px"><table role="presentation" style="border-collapse:collapse;width:100%">' +
      o.kpis.map((k: any) => '<tr><td style="' + td + '">' + esc(k.label) + '</td><td style="' + td + ';padding-inline:8px;font-weight:700">' + esc(k.value) +
        '</td><td style="' + td + ';' + MUTED + '">' + esc(t('dx.kpi.prev', { v: k.prev })) + '</td></tr>').join('') + '</table></div>');
  }
  // بطاقة «مستقر» عنوانها هو نفس العنوان الرئيسي فوق — منكررهوش
  (o.blocks || []).forEach((b: any) => parts.push(blockHtml(b.kind === 'note' && b.title === o.title ? { ...b, title: '' } : b)));
  if (sum.actions) parts.push(blockHtml(sum.actions));
  if (alerts) parts.push(alerts);
  (o.notes || []).forEach((x: string) => parts.push('<div>' + P(esc(x), MUTED) + '</div>'));
  const days = daysText(s.summary_days || [0, 3], en ? 'en' : 'ar'), hour = hourText(s.summary_hour == null ? 9 : s.summary_hour, en ? 'en' : 'ar');
  parts.push(en
    ? 'You receive this summary for <strong>' + n + '</strong> on ' + days + ' at ' + hour + ' account time. Full details are in ' + app + '; to change the schedule open the tool, then "Store summary", then "Automatic summary".'
    : 'يصلك هذا الملخص لحساب <strong>' + n + '</strong> ' + days + ' الساعة ' + hour + ' بتوقيت الحساب. التفاصيل الكاملة في ' + app + '، ولتعديل المواعيد: افتح الأداة، ثم «ملخص المتجر»، ثم «الملخص التلقائي».');
  parts.push(en ? 'To stop the summary and alerts: <a href="' + stop + '">Stop</a>' : 'لإيقاف الملخص والتنبيهات: <a href="' + stop + '">إيقاف</a>');
  const heading = esc(en ? 'Store summary — ' + name : 'ملخص المتجر — ' + name);
  const acts = sum.actions ? [sum.actions.title].concat(sum.actions.lines || [],
    (sum.actions.items || []).map((it: any) => '• ' + it.title + ' (' + it.meta + ')\n  ' + it.lines.join('\n  ')), sum.actions.after || []).join('\n') : '';
  const text = subject + '\n\n' + g.DX.toText(o, name) + (acts ? '\n\n' + acts : '') + '\n\n' + stop;
  return { subject, html: mailHtml(heading, parts, en ? 'en' : 'ar'), text };
}

// ---------- فحص حساب واحد ----------
type Settings = { account_id: string; email: string; lang: string; timezone: string; summary_days: number[]; summary_hour: number; last_summary_until: string | null; checked_at?: string | null };
// الفحص العاجل مرة في الساعة لكل حساب، مع إن المُشغّل بيشتغل كل ١٠ دقايق (عشان الملخصات اللي ميعادها واحد متتأخرش)
function urgentDueFor(s: Settings): boolean { return !s.checked_at || Date.now() - Date.parse(s.checked_at) >= URGENT_EVERY_MS; }
async function checkAccount(s: Settings): Promise<string> {
  const account = s.account_id, en = s.lang === 'en', tz = s.timezone || 'UTC';
  const hour = hourIn(tz);
  const night = hour >= QUIET_FROM || hour < QUIET_UNTIL;
  const due = summaryDue(s);
  const doUrgent = !night && urgentDueFor(s);
  // بالليل التنبيهات العاجلة بتستنى الصبح، بس الملخص بيتبعت في الساعة اللي العميل اختارها حتى لو بدري
  if (!doUrgent && !due) return night ? 'quiet' : 'skip';

  const rows = await rpc('vault_get_token', { p_account: account });
  const t = Array.isArray(rows) && rows[0] ? rows[0] : null;
  const marks = await marksOf(account);
  const now = Date.now(), iso = new Date(now).toISOString();
  const stop = await stopUrl(account);
  g.I18N.setLang(en ? 'en' : 'ar');

  // الوصول ضاع: رسالة واحدة وتذكير واحد بعد يومين
  const lostAccess = async (): Promise<string> => {
    const m = marks['connection|'];
    const due = !m || m.resolved_at || (m.times_sent < 2 && now - Date.parse(m.last_sent_at) >= REMIND_AFTER_MS);
    if (!due) { await saveMarks(account, [{ ...m, last_seen_at: iso }]); return 'lost'; }
    const name = (await accountName(account)) || account;
    if (await send(account, 'urgent', s.email, connectionMail(name, en, stop))) {
      await saveMarks(account, [m && !m.resolved_at ? { ...m, last_sent_at: iso, last_seen_at: iso, times_sent: m.times_sent + 1 } : newMark('connection', '', iso)]);
    }
    return 'lost';
  };
  if (!t) return await lostAccess();
  let token = '';
  try { token = await unseal(t.ciphertext, t.iv, account); } catch (_) {
    // عطل عندنا (مفتاح التشفير اتغيّر؟) مش عند العميل — منبعتلوش حاجة
    await rpc('vault_mark_error', { p_account: account, p_error: 'decrypt failed' });
    return 'decrypt-failed';
  }
  metaToken = token;
  try {
    const { acct, fail } = await accountOrFail(account);
    if (fail === 'retry') return 'meta-retry';
    if (!acct) {
      await rpc('vault_mark_error', { p_account: account, p_error: 'meta rejected stored token' });
      return await lostAccess();
    }
    const keep: Mark[] = [];
    const conn = marks['connection|'];
    if (conn && !conn.resolved_at) keep.push({ ...conn, resolved_at: iso });

    // الصلاحية قربت تخلص: رسالة واحدة (بتتحل لوحدها لما العميل يفتح الأداة وتتجدد) — مش بالليل
    const exp = marks['expiry|'];
    const expiresAt = t.expires_at ? Date.parse(t.expires_at) : NaN;
    if (isFinite(expiresAt) && expiresAt - now < EXPIRY_WARN_MS) {
      if (doUrgent && (!exp || exp.resolved_at)) {
        const name = acct.name || account;
        if (await send(account, 'expiry', s.email, expiryMail(name, t.expires_at, acct.timezone_name || tz, en, stop))) keep.push(newMark('expiry', '', iso));
      }
    } else if (exp && !exp.resolved_at) keep.push({ ...exp, resolved_at: iso });

    const cands = await loadCandidates(account, acct);
    if (!cands) { await saveMarks(account, keep); return 'meta-retry'; }

    let outcome = doUrgent ? 'ok' : 'summary-only';
    if (doUrgent) {
      // التعديلات من آخر فحص (أو آخر ساعتين لأول فحص)
      const editsSince = s.checked_at ? Date.parse(s.checked_at) : now - 2 * 3600000;
      const urgent = await allUrgent(account, acct, cands, editsSince);
      const fresh: any[] = [], remind: { a: any; m: Mark }[] = [], sentRows: Mark[] = [], seen: Record<string, boolean> = {};
      for (const a of urgent) {
        const kind = String(a.code || 'other'), obj = String(a.adId || a.objectId || '');
        const k = kind + '|' + obj;
        if (seen[k]) continue;
        seen[k] = true;
        const m = marks[k];
        if (!m || m.resolved_at) { fresh.push(a); sentRows.push(newMark(kind, obj, iso)); }
        else if (m.times_sent < 2 && now - Date.parse(m.last_sent_at) >= REMIND_AFTER_MS) {
          remind.push({ a, m });
          sentRows.push({ ...m, last_sent_at: iso, last_seen_at: iso, times_sent: m.times_sent + 1 });
        } else keep.push({ ...m, last_seen_at: iso });
      }
      for (const k in marks) {
        const m = marks[k];
        if (seen[k] || m.resolved_at || SYSTEM_KINDS[m.kind]) continue;
        if (now - Date.parse(m.last_seen_at) >= RESOLVE_AFTER_MS) keep.push({ ...m, resolved_at: iso });
      }
      // الرسالة الأول، والبصمات بعدها: لو الإرسال فشل، الساعة الجاية بتحاول تاني
      if (fresh.length || remind.length) {
        const sent = await send(account, fresh.length ? 'urgent' : 'reminder', s.email, urgentMail(acct.name || account, fresh, remind, acct.timezone_name || tz, en, stop));
        if (sent) keep.push(...sentRows);
        outcome = sent ? (fresh.length ? 'sent' : 'reminded') : 'send-failed';
      }
      await markChecked(account);
    }
    await saveMarks(account, keep);

    // الملخص: رسالة منفصلة عن التنبيهات العاجلة (قرار صاحب المنتج). لو فشل (Meta أو البريد) بيتحاول تاني الساعة الجاية
    if (due) {
      keep.forEach((m) => { marks[m.kind + '|' + m.object_id] = m; });   // «حُلّت/مستمرة» بحالة الساعة دي
      const sum = await buildSummary(account, acct, due.since, due.until);
      const alerts = alertStatusHtml(marks, cands, due.since, acct.timezone_name || tz, en);
      if (await send(account, 'summary', s.email, summaryMail(acct.name || account, due.since, due.until, sum, alerts, s, en, stop))) {
        await db('digest_settings?account_id=eq.' + account, { method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify({ last_summary_until: due.until }) });
        outcome += '+summary';
      } else outcome += '+summary-failed';
    }
    return outcome;
  } finally {
    metaToken = '';
  }
}

// ---------- نقاط الدخول ----------
export async function runAll(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const outdated = await loadEngine();
  if (outdated.length) await rpc('beat', { p_source: 'runner-engine-outdated' }).catch(() => {});
  const r = await db('digest_settings?select=account_id,email,lang,timezone,summary_days,summary_hour,last_summary_until,checked_at&enabled=is.true&order=checked_at.asc.nullsfirst&limit=500', { method: 'GET' });
  const all = (await r.json()) as Settings[];
  // الملخصات اللي ميعادها جه الأول، وبعدها الفحص العاجل الأقدم — واللي مفيش عليه حاجة بيتخطّى من غير أي طلب
  const list = all.filter((s) => summaryDue(s) || urgentDueFor(s))
    .sort((a, b) => (summaryDue(b) ? 1 : 0) - (summaryDue(a) ? 1 : 0));
  const outcomes: Record<string, number> = {};
  for (const s of list) {
    if (Date.now() - started > TIME_BUDGET_MS) { outcomes.deferred = (outcomes.deferred || 0) + 1; continue; }
    let out = 'error';
    try { out = await exclusive(() => checkAccount(s)); } catch (e) {
      // النوع والرسالة بس — من غير أي بيانات حساب. ومنعيدوش كل ١٠ دقايق لحد الساعة الجاية
      console.error('runner account failed', String((e as Error).message || e).slice(0, 200));
      await markChecked(s.account_id);
    }
    // عطل (Meta واقعة، الوصول ضاع، التشفير): الفحص الجاي بعد ساعة مش بعد ١٠ دقايق
    if (/^(lost|meta-retry|decrypt-failed)$/.test(out)) await markChecked(s.account_id);
    outcomes[out] = (outcomes[out] || 0) + 1;
  }
  await rpc('beat', { p_source: 'runner' }).catch(() => {});
  return { accounts: all.length, due: list.length, outcomes, engineOutdated: outdated };
}
async function markChecked(account: string): Promise<void> {
  await db('digest_settings?account_id=eq.' + account, {
    method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify({ checked_at: new Date().toISOString() })
  }).catch(() => {});
}

// معاينة الملخص لمدير التطبيق بس: نفس الرسالة بالظبط لفترة معيّنة (أو زي ما كانت هتتبعت النهارده بالمواعيد الافتراضية)،
// بمفتاح المدير نفسه، من غير إرسال ولا تسجيل أي حاجة
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
export async function previewSummary(token: string, accountId: string, lang: string, since?: string, until?: string): Promise<Record<string, unknown>> {
  const outdated = await loadEngine();
  return await exclusive(async () => {
    metaToken = token;
    try {
      const en = lang === 'en';
      g.I18N.setLang(en ? 'en' : 'ar');
      const { acct, fail } = await accountOrFail(accountId);
      if (!acct) return { error: fail };
      const tz = acct.timezone_name || 'UTC';
      let win = since && until && DAY_KEY.test(since) && DAY_KEY.test(until) && since <= until && g.keyDiffDays(since, until) < 31 ? { since, until } : null;
      if (!win) { const lp = localParts(tz); win = summaryWindow([0, 3], null, lp.key, lp.dow); }
      if (!win) return { error: 'window' };
      const s: Settings = { account_id: accountId, email: '', lang: en ? 'en' : 'ar', timezone: tz, summary_days: [0, 3], summary_hour: 9, last_summary_until: null };
      const cands = (await loadCandidates(accountId, acct)) || [];
      const sum = await buildSummary(accountId, acct, win.since, win.until);
      const alerts = alertStatusHtml(await marksOf(accountId), cands, win.since, tz, en);
      const mail = summaryMail(acct.name || accountId, win.since, win.until, sum, alerts, s, en, await stopUrl(accountId));
      return { engineCommit: ENGINE_COMMIT, engineOutdated: outdated, since: win.since, until: win.until, subject: mail.subject, html: mail.html, text: mail.text };
    } finally {
      metaToken = '';
    }
  });
}

// معاينة لمدير التطبيق بس (index.ts بيتأكد): الرسالة العاجلة اللي كانت هتتبعت للحساب دلوقتي — بمفتاح المدير نفسه،
// من غير إرسال ولا بصمات. للتجربة قبل ما أي عميل يفعّل الملخص
export async function preview(token: string, accountId: string, lang: string): Promise<Record<string, unknown>> {
  const outdated = await loadEngine();
  return await exclusive(async () => {
    metaToken = token;
    try {
      const en = lang === 'en';
      g.I18N.setLang(en ? 'en' : 'ar');
      const { acct, fail } = await accountOrFail(accountId);
      if (!acct) return { error: fail };
      const cands = await loadCandidates(accountId, acct);
      if (!cands) return { error: 'retry' };
      // المعاينة: التعديلات الكبيرة من آخر ٢٤ ساعة (عشان تبان أمثلة)
      const urgent = await allUrgent(accountId, acct, cands, Date.now() - 24 * 3600000);
      const mail = urgentMail(acct.name || accountId, urgent, [], acct.timezone_name || 'UTC', en, await stopUrl(accountId));
      return {
        engineCommit: ENGINE_COMMIT, engineOutdated: outdated, ads: cands.length,
        urgent: urgent.map((a: any) => ({ code: a.code || null, adId: a.adId || null, objectId: a.objectId || null, title: a.title, detail: a.detail })),
        subject: urgent.length ? mail.subject : null, html: urgent.length ? mail.html : null
      };
    } finally {
      metaToken = '';
    }
  });
}
