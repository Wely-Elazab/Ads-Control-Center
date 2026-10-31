// إعدادات التنبيهات لكل مستخدم (قرار صاحب المنتج ٢٦ أكتوبر ٢٠٢٦: «نعم اجعلها لكل مستخدم»، و«الوضع الافتراضي… لكل الحسابات
// المتصلة، ويكون هناك خيار تخصيص التنبيه لكل منصة»). سجل واحد لحساب الدخول في الأداة (جدول user_settings) بيتقري من أي جهاز
// يدخل بيه، والبريد بيقراه هو كمان لصاحب الملخص (runner.ts):
//   { all: {…}, plat: { meta?: {…}, snapchat?: {…}, google?: {…}, tiktok?: {…} }, asked?: true }
// all = «كل الحسابات المتصلة» (الافتراضي)، plat = منصة اتخصّصت (بتاخد مكان all في حساباتها كلها)، asked = نافذة أول مرة اتعرضت.
// أقصى تكلفة لكل نوع نتيجة متسجّلة بعملتها (maxCostCur) وبتتحوّل لعملة كل حساب وقت الاستخدام (alerts.js settingsForAccount).
//
//   usettings.get ← {}            → { settings | null }
//   usettings.set ← { changes?, goals?, asked?, base? } → { ok, settings }   (المجموعات اللي اتغيّرت بس، والرد = السجل كله بعد الدمج —
//                   cleanUserWrite تحت، من ٣١ أكتوبر)
//
// الشرط: دخول الأداة (index.ts requireLogin قبل الدالة دي) — السجل بتاع صاحب الدخول نفسه بس، فمفيش رقم مستخدم في الطلب أصلاً.
// أرقام بس، من غير أي أرقام إعلانات.
//
// سجل الحساب الإعلاني القديم (account_settings — من ٢٤ أكتوبر لحد التحديث ده) بيتقري بس (settings.get): الأداة بتنقله مرة واحدة
// لإعدادات المستخدم، والبريد بيرجعله لو الملخص لسه مالوش صاحب. نفس شرطه القديم: مفتاح المنصة بيثبت إن صاحبه شايف الحساب
//   settings.get ← { platform, accountId, platformToken }  → { settings | null }
import { META_ID, db, rpc, reply, metaAccount } from './lib.ts';

const SNAP_API = 'https://adsapi.snapchat.com/v1';
const SNAP_ID = /^[A-Za-z0-9-]{1,64}$/;
const PLATFORM_TOKEN = /^[A-Za-z0-9._~+\/=|-]{20,4096}$/;
const CURRENCY = /^[A-Z]{3}$/;

// نفس حدود محرك الأداة (alerts.js SETTINGS_META — النسب ٠–١). المحرك نفسه بيتحقق تاني وقت الاستخدام (mergeSettings)
const SCALAR: Record<string, [number, number]> = {
  learningDays: [0, 30], minSpendShare: [0, 0.5], cprWarnMultiple: [1, 20], cprCriticalMultiple: [1, 20],
  lowDeliveryRatio: [0.01, 1], spikeMultiple: [1.1, 20], frequencyHigh: [1, 50], accountSpikeMultiple: [1.1, 20],
  accountDropRatio: [0.01, 1], roasTarget: [0.1, 50], roasBreakEven: [0.1, 50]
};
const MAP_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;
// أقصى عدد حدود في القائمة الواحدة (أنواع النتائج، أو الحملات). كان ٥٠٠ والزيادة بتتقطع في صمت؛ من ٣١ أكتوبر (مراجعة الإعدادات لكل
// مستخدم) «كل الحسابات» فيها حدود حملات كل الحسابات مع بعض، فالحد ٢٬٠٠٠، والزيادة بترفض الحفظ كله بسببها ('too many') بدل ما حدود
// تضيع من غير ما حد يعرف. نفس الرقم في المحرك (alerts.js costMap)
export const MAX_KEYS = 2000;
function cleanMap(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  Object.keys(v as Record<string, unknown>).slice(0, MAX_KEYS).forEach((k) => {
    const n = (v as Record<string, unknown>)[k];
    if (MAP_KEY.test(k) && typeof n === 'number' && isFinite(n) && n > 0 && n <= 1e9) out[k] = Math.round(n * 10000) / 10000;
  });
  return Object.keys(out).length ? out : null;
}
// المفاتيح المعروفة بس وأرقام جوه حدودها؛ المستهدف وحد الخسارة مع بعض أو ولا واحد (حكم الربح محتاج الاتنين)
export function cleanAccountSettings(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const src = v as Record<string, unknown>, out: Record<string, unknown> = {};
  Object.keys(SCALAR).forEach((k) => {
    const n = src[k], [lo, hi] = SCALAR[k];
    if (typeof n === 'number' && isFinite(n) && n >= lo - 1e-9 && n <= hi + 1e-9) out[k] = Math.round(n * 10000) / 10000;
  });
  if ((out.roasTarget == null) !== (out.roasBreakEven == null)) { delete out.roasTarget; delete out.roasBreakEven; }
  if (out.roasTarget != null && (out.roasBreakEven as number) > (out.roasTarget as number)) { delete out.roasTarget; delete out.roasBreakEven; }
  const mc = cleanMap(src.maxCost), cc = cleanMap(src.campaignMaxCost);
  if (mc) out.maxCost = mc;
  if (cc) out.campaignMaxCost = cc;
  // عملة أقصى تكلفة الأنواع (إعدادات المستخدم — بتتحوّل لعملة كل حساب). من غير الحد نفسه مالهاش لازمة
  if (mc && typeof src.maxCostCur === 'string' && CURRENCY.test(src.maxCostCur)) out.maxCostCur = src.maxCostCur;
  return out;
}
export const USER_PLATFORMS = ['meta', 'snapchat', 'google', 'tiktok'];
// إعدادات المستخدم: «كل الحسابات» دايماً موجودة (ولو فاضية = قيم البداية)، والمنصات المعروفة بس
export function cleanUserSettings(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const src = v as Record<string, unknown>;
  const all = src.all == null ? {} : cleanAccountSettings(src.all);
  if (!all) return null;
  const out: Record<string, unknown> = { all };
  const plat: Record<string, unknown> = {};
  const p = src.plat;
  if (p != null && (typeof p !== 'object' || Array.isArray(p))) return null;
  USER_PLATFORMS.forEach((k) => {
    const one = p ? cleanAccountSettings((p as Record<string, unknown>)[k]) : null;
    if (one) plat[k] = one;
  });
  if (Object.keys(plat).length) out.plat = plat;
  if (src.asked === true) out.asked = true;
  return out;
}
// قائمة حدود أكبر من المسموح (قبل التنظيف — التنظيف بيقطع)
function tooManyIn(set: unknown): boolean {
  if (!set || typeof set !== 'object') return false;
  return ['maxCost', 'campaignMaxCost'].some((k) => {
    const m = (set as Record<string, unknown>)[k];
    return !!m && typeof m === 'object' && Object.keys(m as Record<string, unknown>).length > MAX_KEYS;
  });
}

// طلب الحفظ (usettings.set) بالمجموعات اللي اتغيّرت بس (مراجعة الإعدادات لكل مستخدم ٣١ أكتوبر — الحفظ بالسجل كله كان بيمسح تعديل
// جهاز تاني). الدمج في قاعدة البيانات وهو مقفول (الترحيل 20261031100000_user_settings_apply.sql):
//   changes = { all?: {…}, meta?|snapchat?|google?|tiktok?: {…} | null }   مجموعة كاملة مكان القديمة، وnull = إلغاء تخصيص المنصة
//   goals   = { roasTarget, roasBreakEven } بيتدمجوا في «كل الحسابات» (نافذة أول مرة — من غير ما تلمس باقي قيمها)
//   asked   = true (نافذة أول مرة اتعرضت)
//   base    = السجل كله لو المستخدم لسه مالوش سجل (نقل الإعدادات القديمة) — بيتجاهل لو السجل موجود
// أي جزء غلط = null (الطلب كله بيترفض — مبنحفظش نص طلب)، وقائمة أكبر من MAX_KEYS = 'too many'
export type UserWrite = { base: Record<string, unknown> | null; changes: Record<string, unknown>; goals: Record<string, unknown> | null; asked: boolean };
export function cleanUserWrite(body: any): UserWrite | 'too many' | null {
  if (!body || typeof body !== 'object') return null;
  const raw: unknown[] = [];
  let base: Record<string, unknown> | null = null;
  if (body.base != null) {
    base = cleanUserSettings(body.base);
    if (!base) return null;
    raw.push(body.base.all);
    if (body.base.plat && typeof body.base.plat === 'object') USER_PLATFORMS.forEach((k) => raw.push(body.base.plat[k]));
  }
  const changes: Record<string, unknown> = {};
  if (body.changes != null) {
    if (typeof body.changes !== 'object' || Array.isArray(body.changes)) return null;
    for (const k of Object.keys(body.changes)) {
      const v = body.changes[k];
      if (k !== 'all' && USER_PLATFORMS.indexOf(k) < 0) return null;
      if (v === null) {
        if (k === 'all') return null;   // «كل الحسابات» مبتتمسحش — بتتحفظ فاضية لو لازم
        changes[k] = null;
        continue;
      }
      const clean = cleanAccountSettings(v);
      if (!clean) return null;
      raw.push(v);
      changes[k] = clean;
    }
  }
  let goals: Record<string, unknown> | null = null;
  if (body.goals != null) {
    if (typeof body.goals !== 'object' || Array.isArray(body.goals)) return null;
    const g = cleanAccountSettings({ roasTarget: body.goals.roasTarget, roasBreakEven: body.goals.roasBreakEven });
    if (!g || g.roasTarget == null) return null;   // الاتنين مع بعض، وحد الخسارة مش فوق المستهدف
    goals = { roasTarget: g.roasTarget, roasBreakEven: g.roasBreakEven };
  }
  const asked = body.asked === true;
  if (!base && !Object.keys(changes).length && !goals && !asked) return null;
  if (raw.some(tooManyIn)) return 'too many';
  return { base, changes, goals, asked };
}

export async function handleUserSettings(action: string, body: any, userId: string, origin: string | null): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/.test(userId)) return reply(401, { error: 'login', code: 'LOGIN' }, origin);
  const where = 'user_settings?user_id=eq.' + userId;
  const now = new Date().toISOString();
  if (action === 'usettings.get') {
    const r = await db(where + '&select=settings,updated_at,used_at', { method: 'GET' });
    const rows = await r.json().catch(() => null);
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    // آخر استخدام (مدة الاحتفاظ — السجل بيتمسح بعد ١٢ شهر من غير فتح، purge_stale): مرة في اليوم بالكتير، وفشله مبيوقفش القراءة
    if (row && !(Date.parse(row.used_at) > Date.now() - 86400000)) {
      await db(where, { method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify({ used_at: now }) }).catch(() => null);
    }
    return reply(200, { settings: row ? row.settings : null, updatedAt: row ? row.updated_at : null }, origin);
  }
  if (action === 'usettings.set') {
    let req = body;
    // صفحة اتفتحت قبل ٣١ أكتوبر بتبعت السجل كله (settings): بيتحفظ كتعديل لـ«كل الحسابات» وللمنصات اللي فيه — من غير ما يشيل
    // تخصيص منصة مش فيه (اتعمل من جهاز تاني). بعد ما الصفحات القديمة تتحدّث يتشال
    if (body && body.settings != null && body.changes == null && body.base == null && body.goals == null) {
      const s = body.settings, changes: Record<string, unknown> = {};
      if (s && typeof s === 'object' && !Array.isArray(s)) {
        if (s.all != null) changes.all = s.all;
        if (s.plat && typeof s.plat === 'object') Object.keys(s.plat).forEach((k) => { if (USER_PLATFORMS.indexOf(k) > -1) changes[k] = s.plat[k]; });
      }
      req = { changes, asked: s && s.asked === true };
    }
    const w = cleanUserWrite(req);
    if (w === 'too many') return reply(400, { error: 'too many' }, origin);
    if (!w) return reply(400, { error: 'settings' }, origin);
    const settings = await rpc('user_settings_apply', { p_user: userId, p_base: w.base, p_changes: w.changes, p_goals: w.goals, p_asked: w.asked });
    return reply(200, { ok: true, settings }, origin);
  }
  return reply(400, { error: 'action' }, origin);
}

// صاحب المفتاح شايف حساب Snapchat ده؟ (نفس طلب Cloudflare — api/snapchat-ads-fetch.js)
export async function snapAccount(token: string, id: string): Promise<boolean> {
  const r = await fetch(SNAP_API + '/adaccounts/' + encodeURIComponent(id), { headers: { 'Authorization': 'Bearer ' + token } }).catch(() => null);
  if (!r || !r.ok) return false;
  const j = await r.json().catch(() => null);
  const acc = j && j.adaccounts && j.adaccounts[0] && j.adaccounts[0].adaccount;
  return !!acc && String(acc.id) === id;
}

// المنصة والحساب بعد ما المنصة نفسها تأكد إن صاحب المفتاح شايف الحساب — أو رد الرفض. الإعدادات هنا وسجل المشكلات (episodes.ts)
export async function verifyAccount(body: any, origin: string | null): Promise<{ platform: 'meta' | 'snapchat'; id: string } | Response> {
  const platform = body && body.platform, id = body && body.accountId, token = body && body.platformToken;
  if (platform !== 'meta' && platform !== 'snapchat') return reply(400, { error: 'platform' }, origin);
  if (typeof id !== 'string' || !(platform === 'meta' ? META_ID : SNAP_ID).test(id)) return reply(400, { error: 'account' }, origin);
  if (typeof token !== 'string' || !PLATFORM_TOKEN.test(token)) return reply(400, { error: 'token' }, origin);
  const ok = platform === 'meta' ? !!(await metaAccount(token, id)) : await snapAccount(token, id);
  if (!ok) return reply(403, { error: 'not verified' }, origin);
  return { platform, id };
}

// سجل الحساب القديم: قراءة بس (النقل لإعدادات المستخدم). الحفظ اتشال — إعدادات المستخدم هي المصدر من التحديث ده
export async function handleSettings(action: string, body: any, origin: string | null): Promise<Response> {
  if (action !== 'settings.get') return reply(400, { error: 'action' }, origin);
  const acc = await verifyAccount(body, origin);
  if (acc instanceof Response) return acc;
  const r = await db('account_settings?platform=eq.' + acc.platform + '&account_id=eq.' + encodeURIComponent(acc.id) + '&select=settings,updated_at', { method: 'GET' });
  const rows = await r.json().catch(() => null);
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return reply(200, { settings: row ? row.settings : null, updatedAt: row ? row.updated_at : null }, origin);
}
