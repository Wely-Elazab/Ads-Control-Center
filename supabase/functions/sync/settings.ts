// إعدادات التنبيهات لكل مستخدم (قرار صاحب المنتج ٢٦ أكتوبر ٢٠٢٦: «نعم اجعلها لكل مستخدم»، و«الوضع الافتراضي… لكل الحسابات
// المتصلة، ويكون هناك خيار تخصيص التنبيه لكل منصة»). سجل واحد لحساب الدخول في الأداة (جدول user_settings) بيتقري من أي جهاز
// يدخل بيه، والبريد بيقراه هو كمان لصاحب الملخص (runner.ts):
//   { all: {…}, plat: { meta?: {…}, snapchat?: {…}, google?: {…}, tiktok?: {…} }, asked?: true }
// all = «كل الحسابات المتصلة» (الافتراضي)، plat = منصة اتخصّصت (بتاخد مكان all في حساباتها كلها)، asked = نافذة أول مرة اتعرضت.
// أقصى تكلفة لكل نوع نتيجة متسجّلة بعملتها (maxCostCur) وبتتحوّل لعملة كل حساب وقت الاستخدام (alerts.js settingsForAccount).
//
//   usettings.get ← {}            → { settings | null }
//   usettings.set ← { settings }  → { ok, settings }   (القيم بعد التنظيف)
//
// الشرط: دخول الأداة (index.ts requireLogin قبل الدالة دي) — السجل بتاع صاحب الدخول نفسه بس، فمفيش رقم مستخدم في الطلب أصلاً.
// أرقام بس، من غير أي أرقام إعلانات.
//
// سجل الحساب الإعلاني القديم (account_settings — من ٢٤ أكتوبر لحد التحديث ده) بيتقري بس (settings.get): الأداة بتنقله مرة واحدة
// لإعدادات المستخدم، والبريد بيرجعله لو الملخص لسه مالوش صاحب. نفس شرطه القديم: مفتاح المنصة بيثبت إن صاحبه شايف الحساب
//   settings.get ← { platform, accountId, platformToken }  → { settings | null }
import { META_ID, db, reply, metaAccount } from './lib.ts';

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
function cleanMap(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  Object.keys(v as Record<string, unknown>).slice(0, 500).forEach((k) => {
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
    const clean = cleanUserSettings(body && body.settings);
    if (!clean) return reply(400, { error: 'settings' }, origin);
    await db('user_settings?on_conflict=user_id', {
      method: 'POST', headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: userId, settings: clean, updated_at: now, used_at: now })
    });
    return reply(200, { ok: true, settings: clean }, origin);
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
