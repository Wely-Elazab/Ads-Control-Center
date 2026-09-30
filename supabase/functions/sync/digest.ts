// الملخص والتنبيهات التلقائية بالبريد (اختيارية، لحسابات Meta بس) — التفعيل والإيقاف وحفظ الصلاحية
//   digest.get     ← { token, accountId }  حالة الملخص للحساب
//   digest.enable  ← { token, accountId, email, days, hour, lang, consent: true }
//   digest.update  ← { token, accountId, email?, days?, hour?, lang? }
//   digest.disable ← { token, accountId }  (والأداة بتبعته كمان عند «فصل» Meta)
//   digest.refresh ← { token, accountId }  الأداة بتبعته لما تتفتح والملخص مفعّل — بيمد صلاحية المفتاح
//   digest.disconnect ← { token }          «فصل» Meta: كل الحسابات اللي صاحب الجلسة فعّل لها الملخص
//   stop           ← { account, sig }      رابط الإيقاف في آخر كل رسالة (من غير دخول Meta)
//
// صلاحية Meta: بنبدّل المفتاح القصير (ساعة أو اتنين) بمفتاح طويل (نحو ٦٠ يوم) بسر التطبيق، ونشفّره
// AES-256-GCM بـ TOKEN_ENC_KEY ومربوط برقم الحساب، ونحفظه عن طريق دوال vault_* بس.
// الإيقاف (أو «فصل» أو رابط الإيقاف) = المفتاح والإعدادات بيتمسحوا فوراً. سياسة الخصوصية، البندين ٣ و٧

import { GRAPH, META_APP_ID, META_ID, SITE, db, rpc, metaAccount, reply, sendEmail, mailHtml, esc } from './lib.ts';

const CONSENT_VERSION = '2026-09-30';
const DEFAULT_DAYS = [0, 3];   // الأحد والأربعاء
const DEFAULT_HOUR = 9;        // بتوقيت الحساب
const EMAIL = /^[^@\s<>"',;]{1,64}@[^@\s<>"',;]{1,190}\.[A-Za-z]{2,24}$/;

// ---------- التشفير ----------
const enc = new TextEncoder();
function b64(bytes: Uint8Array): string { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
function unb64(s: string): Uint8Array { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function rawKey(): Uint8Array {
  const raw = unb64((Deno.env.get('TOKEN_ENC_KEY') || '').trim());
  if (raw.length !== 32) throw new Error('token key invalid');
  return raw;
}
let aes: Promise<CryptoKey> | null = null;
function aesKey(): Promise<CryptoKey> {
  if (!aes) aes = crypto.subtle.importKey('raw', rawKey(), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return aes;
}
// رقم الحساب داخل في التشفير (additional data): النص المشفّر مينفعش يتفك لو اتنقل لصف حساب تاني
export async function seal(plain: string, account: string): Promise<{ ct: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(account) }, await aesKey(), enc.encode(plain));
  return { ct: b64(new Uint8Array(ct)), iv: b64(iv) };
}
export async function unseal(ct: string, iv: string, account: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(account) }, await aesKey(), unb64(ct));
  return new TextDecoder().decode(pt);
}

// ---------- رابط الإيقاف: توقيع HMAC بمفتاح مشتق (مش نفس مفتاح التشفير) ----------
let hmac: Promise<CryptoKey> | null = null;
function linkKey(): Promise<CryptoKey> {
  if (!hmac) {
    hmac = (async () => {
      const label = enc.encode('ads-center/stop-link/v1:'), raw = rawKey();
      const mix = new Uint8Array(label.length + raw.length);
      mix.set(label); mix.set(raw, label.length);
      const derived = await crypto.subtle.digest('SHA-256', mix);
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    })().catch((e) => { hmac = null; throw e; });
  }
  return hmac;
}
async function stopSig(account: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await linkKey(), enc.encode('stop:' + account));
  return b64(new Uint8Array(sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function stopUrl(account: string): Promise<string> {
  return SITE + '/stop?a=' + account + '&s=' + (await stopSig(account));
}
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------- Meta ----------
// المفتاح القصير → مفتاح طويل. لازم يحصل هنا: سر التطبيق عمره ما يطلع للمتصفح
async function longLived(token: string): Promise<{ token: string; expiresAt: string } | null> {
  const secret = Deno.env.get('META_APP_SECRET');
  if (!secret) return null;
  const url = GRAPH + '/oauth/access_token?grant_type=fb_exchange_token&client_id=' + META_APP_ID +
    '&client_secret=' + encodeURIComponent(secret) + '&fb_exchange_token=' + encodeURIComponent(token);
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j || typeof j.access_token !== 'string') return null;
  const secs = Number(j.expires_in);
  return { token: j.access_token, expiresAt: new Date(Date.now() + (isFinite(secs) && secs > 0 ? secs * 1000 : 60 * 86400000)).toISOString() };
}
async function metaUserId(token: string): Promise<string | null> {
  const r = await fetch(GRAPH + '/me?fields=id&access_token=' + encodeURIComponent(token)).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  return j && j.id ? String(j.id) : null;
}
// يبدّل، ويتأكد إن المفتاح الطويل شايف الحساب، ويشفّر، ويحفظ. بيرجّع تاريخ الانتهاء أو null
async function storeToken(token: string, account: string): Promise<string | null> {
  const ll = await longLived(token);
  if (!ll || !(await metaAccount(ll.token, account))) return null;
  const sealed = await seal(ll.token, account);
  await rpc('vault_put_token', { p_account: account, p_cipher: sealed.ct, p_iv: sealed.iv, p_user: await metaUserId(ll.token), p_expires: ll.expiresAt });
  return ll.expiresAt;
}

// ---------- الإعدادات ----------
function cleanEmail(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length <= 254 && EMAIL.test(s) ? s.toLowerCase() : null;
}
// يومين على الأقل (٠ = الأحد … ٦ = السبت)
function cleanDays(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const days = [...new Set(v.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return days.length >= 2 ? days : null;
}
function cleanHour(v: unknown): number | null {
  const h = Number(v);
  return v !== null && v !== '' && Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
}
async function getSettings(account: string): Promise<any | null> {
  const r = await db('digest_settings?select=email,enabled,summary_days,summary_hour,timezone,lang&account_id=eq.' + account, { method: 'GET' });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
// أمس بتوقيت الحساب: وقت التفعيل بيتسجّل كأنه «آخر ملخص غطّى لحد أمس» — فأول ملخص بييجي في ميعاده الجاي
// (مش بعد التفعيل بساعة لو التفعيل حصل يوم ملخص بعد ساعته)، ويغطي الأيام من يوم التفعيل
function yesterdayIn(tz: string): string {
  let today = '';
  try { today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (_) { today = new Date().toISOString().slice(0, 10); }
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function publicSettings(s: any) {
  return { email: s.email, enabled: s.enabled !== false, days: s.summary_days, hour: s.summary_hour, timezone: s.timezone, lang: s.lang };
}
async function logSend(account: string, type: string, status: string, providerId: string | null, error: string | null): Promise<void> {
  await db('send_log', { method: 'POST', headers: { 'prefer': 'return=minimal' },
    body: JSON.stringify({ account_id: account, type, status, provider_id: providerId, error: error ? error.slice(0, 200) : null }) }).catch(() => {});
}

// ---------- رسائل التأكيد ----------
const DAY_NAMES: Record<string, string[]> = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};
function arDigits(s: string): string { return s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]); }
export function hourText(h: number, lang: string): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return lang === 'en' ? h12 + ':00 ' + (h < 12 ? 'AM' : 'PM') : arDigits(h12 + ':00') + (h < 12 ? ' صباحاً' : ' مساءً');
}
export function daysText(days: number[], lang: string): string {
  const names = days.map((d) => DAY_NAMES[lang === 'en' ? 'en' : 'ar'][d]);
  if (lang === 'en') return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join('');
  return (names.length === 2 ? 'يومي ' : 'أيام ') + names.join(' و');
}
async function mailEnabled(account: string, name: string | undefined, s: any): Promise<void> {
  const en = s.lang === 'en', plain = name || account, n = esc(plain), stop = await stopUrl(account);
  const tz = esc(s.timezone || '');
  const subject = en ? 'Automatic summary turned on for ' + plain : 'تم تفعيل الملخص التلقائي لحساب ' + plain;
  const lines = en ? [
    'Hello,',
    'You will receive a performance summary for <strong>' + n + '</strong> on ' + daysText(s.summary_days, 'en') + ' at ' + hourText(s.summary_hour, 'en') +
      ' account time (' + tz + '), plus an immediate alert whenever something urgent needs action.',
    'To change the schedule or turn it off: open the tool, then "Store summary", then "Automatic summary".',
    'If you did not ask for this, turn it off right away: <a href="' + stop + '">Stop the automatic summary</a>'
  ] : [
    'مرحباً،',
    'سيصلك ملخص أداء إعلانات حساب <strong>' + n + '</strong> ' + daysText(s.summary_days, 'ar') + ' الساعة ' + hourText(s.summary_hour, 'ar') +
      ' بتوقيت الحساب (' + tz + ')، إلى جانب تنبيه فوري كلما ظهر أمر عاجل يحتاج إلى إجراء.',
    'لتعديل المواعيد أو الإيقاف: افتح الأداة، ثم «ملخص المتجر»، ثم «الملخص التلقائي».',
    'إذا لم تطلب هذا التفعيل، أوقفه فوراً من هذا الرابط: <a href="' + stop + '">إيقاف الملخص التلقائي</a>'
  ];
  const text = subject + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n') + '\n' + stop;
  try {
    const id = await sendEmail(s.email, subject, mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text);
    await logSend(account, 'enabled', 'sent', id, null);
  } catch (e) {
    await logSend(account, 'enabled', 'failed', null, String((e as Error).message || e));
  }
}
async function mailDisabled(account: string, name: string | undefined, s: any): Promise<void> {
  const en = s.lang === 'en', plain = name || account, n = esc(plain);
  const subject = en ? 'Automatic summary turned off for ' + plain : 'تم إيقاف الملخص التلقائي لحساب ' + plain;
  const lines = en ? [
    'Hello,',
    'We turned off the automatic summary and alerts for <strong>' + n + '</strong>, and deleted the read access we had stored.',
    'You can turn it on again at any time inside the tool.'
  ] : [
    'مرحباً،',
    'أوقفنا الملخص والتنبيهات التلقائية لحساب <strong>' + n + '</strong>، وحذفنا صلاحية القراءة التي كنا نحفظها.',
    'يمكنك تفعيله مجدداً في أي وقت من داخل الأداة.'
  ];
  const text = subject + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n');
  try {
    const id = await sendEmail(s.email, subject, mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text);
    await logSend(account, 'disabled', 'sent', id, null);
  } catch (e) {
    await logSend(account, 'disabled', 'failed', null, String((e as Error).message || e));
  }
}
async function removeAll(account: string): Promise<void> {
  await rpc('vault_delete_token', { p_account: account });
  await db('digest_settings?account_id=eq.' + account, { method: 'DELETE' });
}
export async function accountName(account: string): Promise<string | undefined> {
  const r = await db('ad_accounts?select=name&platform=eq.meta&account_id=eq.' + account, { method: 'GET' }).catch(() => null);
  const rows = r ? await r.json().catch(() => null) : null;
  return Array.isArray(rows) && rows[0] && rows[0].name ? rows[0].name : undefined;
}
// المفتاح المحفوظ بيتفك وMeta لسه قابلاه؟ (null = مفيش مفتاح). لو لأ بنسجّل السبب بس، من غير أي جزء منه
async function storedTokenWorks(account: string): Promise<boolean | null> {
  const rows = await rpc('vault_get_token', { p_account: account });
  const t = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!t) return null;
  let token = '';
  try { token = await unseal(t.ciphertext, t.iv, account); } catch (_) {
    await rpc('vault_mark_error', { p_account: account, p_error: 'decrypt failed' });
    return false;
  }
  const ok = !!(await metaAccount(token, account));
  if (!ok) await rpc('vault_mark_error', { p_account: account, p_error: 'meta rejected stored token' });
  return ok;
}

// ---------- العمليات ----------
export async function handleDigest(action: string, body: any, origin: string | null): Promise<Response> {
  if (action === 'stop') {
    const account = body.account, sig = body.sig;
    if (typeof account !== 'string' || !META_ID.test(account) || typeof sig !== 'string' || sig.length > 100) return reply(400, { error: 'link' }, origin);
    if (!sameString(sig, await stopSig(account))) return reply(403, { error: 'link' }, origin);
    const s = await getSettings(account);
    await removeAll(account);
    if (s) await logSend(account, 'disabled', 'skipped', null, 'stop link');
    return reply(200, { ok: true, wasEnabled: !!s }, origin);
  }

  if (action === 'digest.disconnect') {
    const user = await metaUserId(body.token);
    if (!user) return reply(403, { error: 'not verified' }, origin);
    const ids = await rpc('vault_delete_user_tokens', { p_user: user });
    const list: string[] = Array.isArray(ids) ? ids.map((x: any) => (typeof x === 'string' ? x : x && x.vault_delete_user_tokens)).filter((x: any) => typeof x === 'string' && META_ID.test(x)) : [];
    for (const account of list) {
      const s = await getSettings(account);
      await db('digest_settings?account_id=eq.' + account, { method: 'DELETE' });
      if (s) await mailDisabled(account, await accountName(account), s);
    }
    return reply(200, { ok: true, removed: list.length }, origin);
  }

  const account = body.accountId;
  if (typeof account !== 'string' || !META_ID.test(account)) return reply(400, { error: 'account' }, origin);
  const acc = await metaAccount(body.token, account);
  if (!acc) return reply(403, { error: 'not verified' }, origin);
  const now = new Date().toISOString();

  if (action === 'digest.get') {
    const s = await getSettings(account);
    const works = s ? await storedTokenWorks(account) : null;
    const t = s ? await rpc('vault_token_status', { p_account: account }) : null;
    const ts = Array.isArray(t) && t[0] ? t[0] : null;
    return reply(200, { settings: s ? publicSettings(s) : null, tokenExpiresAt: ts ? ts.expires_at : null,
      tokenWorks: works, timezone: acc.timezone_name || null }, origin);
  }

  if (action === 'digest.enable') {
    if (body.consent !== true) return reply(400, { error: 'consent' }, origin);
    const email = cleanEmail(body.email);
    if (!email) return reply(400, { error: 'email' }, origin);
    const days = body.days === undefined ? DEFAULT_DAYS : cleanDays(body.days);
    if (!days) return reply(400, { error: 'days' }, origin);
    const hour = body.hour === undefined ? DEFAULT_HOUR : cleanHour(body.hour);
    if (hour === null) return reply(400, { error: 'hour' }, origin);
    const expiresAt = await storeToken(body.token, account);
    if (!expiresAt) return reply(502, { error: 'meta exchange' }, origin);
    const row = { account_id: account, email, enabled: true, summary_days: days, summary_hour: hour,
      timezone: acc.timezone_name || 'Asia/Riyadh', lang: body.lang === 'en' ? 'en' : 'ar',
      consent_at: now, consent_version: CONSENT_VERSION, updated_at: now, last_summary_until: yesterdayIn(acc.timezone_name || 'Asia/Riyadh') };
    await db('digest_settings?on_conflict=account_id', { method: 'POST', headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    await mailEnabled(account, acc.name, row);
    return reply(200, { ok: true, settings: publicSettings(row), tokenExpiresAt: expiresAt }, origin);
  }

  if (action === 'digest.update') {
    const s = await getSettings(account);
    if (!s || !s.enabled) return reply(409, { error: 'not enabled' }, origin);
    const patch: Record<string, unknown> = { updated_at: now, timezone: acc.timezone_name || s.timezone };
    if (body.email !== undefined) { const e = cleanEmail(body.email); if (!e) return reply(400, { error: 'email' }, origin); patch.email = e; }
    if (body.days !== undefined) { const d = cleanDays(body.days); if (!d) return reply(400, { error: 'days' }, origin); patch.summary_days = d; }
    if (body.hour !== undefined) { const h = cleanHour(body.hour); if (h === null) return reply(400, { error: 'hour' }, origin); patch.summary_hour = h; }
    if (body.lang === 'ar' || body.lang === 'en') patch.lang = body.lang;
    await db('digest_settings?account_id=eq.' + account, { method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(patch) });
    const next = { ...s, ...patch };
    if (patch.email && patch.email !== s.email) await mailEnabled(account, acc.name, next);   // تأكيد للعنوان الجديد
    return reply(200, { ok: true, settings: publicSettings(next) }, origin);
  }

  if (action === 'digest.disable') {
    const s = await getSettings(account);
    await removeAll(account);
    if (s) await mailDisabled(account, acc.name, s);
    return reply(200, { ok: true }, origin);
  }

  if (action === 'digest.refresh') {
    const s = await getSettings(account);
    if (!s || !s.enabled) return reply(200, { ok: true, enabled: false }, origin);
    const expiresAt = await storeToken(body.token, account);
    if (!expiresAt) return reply(502, { error: 'meta exchange' }, origin);
    return reply(200, { ok: true, enabled: true, tokenExpiresAt: expiresAt }, origin);
  }

  return reply(400, { error: 'action' }, origin);
}
