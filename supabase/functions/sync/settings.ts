// إعدادات التنبيهات لكل حساب إعلاني (مراجعة الإعدادات ٢٤ أكتوبر ٢٠٢٦ — قرار صاحب المنتج: «على مستوى الحساب وليس الجهاز أو
// المتصفح»). سجل واحد للحساب (جدول account_settings) بيقراه كل اللي عندهم وصول للحساب في منصته من أي جهاز، والبريد بيقراه هو
// كمان (runner.ts) — مصدر واحد بدل نسخة في كل متصفح ونسخة للبريد («آخر جهاز يفوز»).
//
//   settings.get ← { platform, accountId, platformToken }            → { settings | null }
//   settings.set ← { platform, accountId, platformToken, settings }  → { ok, settings }   (القيم بعد التنظيف)
//
// الشرطين: دخول الأداة (index.ts requireLogin قبل الدالة دي)، ومفتاح المنصة نفسها بيثبت إن صاحبه شايف الحساب ده (Meta: Graph،
// Snapchat: Ads API) — فمحدش يقدر يقرا أو يغيّر إعدادات حساب مالوش وصول ليه. أرقام بس، من غير أي أرقام إعلانات.
import { META_ID, db, reply, metaAccount } from './lib.ts';

const SNAP_API = 'https://adsapi.snapchat.com/v1';
const SNAP_ID = /^[A-Za-z0-9-]{1,64}$/;
const PLATFORM_TOKEN = /^[A-Za-z0-9._~+\/=|-]{20,4096}$/;

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
  return out;
}

// صاحب المفتاح شايف حساب Snapchat ده؟ (نفس طلب Cloudflare — api/snapchat-ads-fetch.js)
export async function snapAccount(token: string, id: string): Promise<boolean> {
  const r = await fetch(SNAP_API + '/adaccounts/' + encodeURIComponent(id), { headers: { 'Authorization': 'Bearer ' + token } }).catch(() => null);
  if (!r || !r.ok) return false;
  const j = await r.json().catch(() => null);
  const acc = j && j.adaccounts && j.adaccounts[0] && j.adaccounts[0].adaccount;
  return !!acc && String(acc.id) === id;
}

export async function handleSettings(action: string, body: any, origin: string | null): Promise<Response> {
  const platform = body && body.platform, id = body && body.accountId, token = body && body.platformToken;
  if (platform !== 'meta' && platform !== 'snapchat') return reply(400, { error: 'platform' }, origin);
  if (typeof id !== 'string' || !(platform === 'meta' ? META_ID : SNAP_ID).test(id)) return reply(400, { error: 'account' }, origin);
  if (typeof token !== 'string' || !PLATFORM_TOKEN.test(token)) return reply(400, { error: 'token' }, origin);
  const ok = platform === 'meta' ? !!(await metaAccount(token, id)) : await snapAccount(token, id);
  if (!ok) return reply(403, { error: 'not verified' }, origin);

  const where = 'account_settings?platform=eq.' + platform + '&account_id=eq.' + encodeURIComponent(id);
  if (action === 'settings.get') {
    const r = await db(where + '&select=settings,updated_at', { method: 'GET' });
    const rows = await r.json().catch(() => null);
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    return reply(200, { settings: row ? row.settings : null, updatedAt: row ? row.updated_at : null }, origin);
  }
  if (action === 'settings.set') {
    const clean = cleanAccountSettings(body.settings);
    if (!clean) return reply(400, { error: 'settings' }, origin);
    await db('account_settings?on_conflict=platform,account_id', {
      method: 'POST', headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ platform, account_id: id, settings: clean, updated_at: new Date().toISOString() })
    });
    return reply(200, { ok: true, settings: clean }, origin);
  }
  return reply(400, { error: 'action' }, origin);
}
