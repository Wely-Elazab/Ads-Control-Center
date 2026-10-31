// الملخص والتنبيهات التلقائية بالبريد (اختيارية) — لكل مستخدم من ٣١ أكتوبر ٢٠٢٦ (قرار صاحب المنتج: «اجعلها لكل مستخدم ملخص خاص به»):
// ملخص واحد لحساب الدخول (بريده ومواعيده ولغته وتوقيته — جدول user_digests) فيه الحسابات اللي اختارها (user_digest_accounts — لحد
// MAX_PER_PLATFORM لكل منصة)، وبيتبعت بإعدادات التنبيهات بتاعته هو (settings.ts). العمليات تحت handleDigest.
// إعدادات التنبيهات (المستهدف وحد الخسارة والحدود) مش هنا: إعدادات المستخدم (settings.ts)
//
// صلاحية Meta: بنبدّل المفتاح القصير (ساعة أو اتنين) بمفتاح طويل (نحو ٦٠ يوم) بسر التطبيق، ونشفّره AES-256-GCM بـ TOKEN_ENC_KEY
// ومربوط برقم الحساب، ونحفظه للمستخدم عن طريق دوال vault_user_* بس. Snapchat (من ٣١ أكتوبر): النسخة المقفولة من مفتاح التجديد،
// مشفّرة تاني بنفس المفتاح، عن طريق دوال vault_sealed_* (storeSealed تحت).
// الإيقاف (أو «فصل» أو رابط الإيقاف) = الصلاحيات والإعدادات بيتمسحوا فوراً. سياسة الخصوصية، البندين ٣ و٧

import { GRAPH, META_APP_ID, META_ID, SITE, TOKEN, db, rpc, metaAccount, reply, sendEmail, mailHtml, esc } from './lib.ts';

const CONSENT_VERSION = '2026-10-31-snapchat';   // سياسة الخصوصية: ملخص لكل مستخدم بإعداداته وحساباته، وحسابات Snapchat فيه
const USER_ID = /^[0-9a-f-]{36}$/;
const PLATFORMS = ['meta', 'snapchat', 'google', 'tiktok'];
const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_DAYS = [0, 3];   // الأحد والأربعاء
const DEFAULT_HOUR = 9;        // بتوقيت الحساب
const EMAIL = /^[^@\s<>"',;]{1,64}@[^@\s<>"',;]{1,190}\.[A-Za-z]{2,24}$/;

// ---------- التشفير ----------
const enc = new TextEncoder();
function b64(bytes: Uint8Array): string { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
// Uint8Array<ArrayBuffer> مش Uint8Array بس: الأنواع الحديثة في TypeScript مبتقبلش غيره في crypto.subtle (deno check — مراجعة المرحلة ٢)
function unb64(s: string): Uint8Array<ArrayBuffer> { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function rawKey(): Uint8Array<ArrayBuffer> {
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

// ---------- الروابط الموقّعة (الإيقاف، و«أرسلت الدعوة» في join.ts): HMAC بمفتاح مشتق لكل غرض (مش نفس مفتاح التشفير) ----------
const STOP_LABEL = 'ads-center/stop-link/v1:';
const hmacKeys: Record<string, Promise<CryptoKey>> = {};
function linkKey(label: string): Promise<CryptoKey> {
  if (!hmacKeys[label]) {
    hmacKeys[label] = (async () => {
      const l = enc.encode(label), raw = rawKey();
      const mix = new Uint8Array(l.length + raw.length);
      mix.set(l); mix.set(raw, l.length);
      const derived = await crypto.subtle.digest('SHA-256', mix);
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    })().catch((e) => { delete hmacKeys[label]; throw e; });
  }
  return hmacKeys[label];
}
export async function linkSig(label: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await linkKey(label), enc.encode(message));
  return b64(new Uint8Array(sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// من ٣١ أكتوبر الرابط لكل مستخدم (u = رقم حساب الدخول) — بيوقف ملخصه هو. الروابط القديمة لكل حساب (a = رقم الحساب) في رسائل اتبعتت
// قبل كده لسه شغالة (legacyStopSig): الحساب ده بس بيخرج من ملخص صاحبه
function stopSig(user: string): Promise<string> { return linkSig(STOP_LABEL, 'stop-user:' + user); }
function legacyStopSig(account: string): Promise<string> { return linkSig(STOP_LABEL, 'stop:' + account); }
export async function stopUrl(user: string): Promise<string> {
  return SITE + '/stop?u=' + user + '&s=' + (await stopSig(user));
}
export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------- Meta ----------
// المفتاح القصير → مفتاح طويل. لازم يحصل هنا: سر التطبيق عمره ما يطلع للمتصفح. وربط Meta المحفوظ على الجهاز بيستخدمه (metalink.ts)
export async function longLived(token: string): Promise<{ token: string; expiresAt: string } | null> {
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
// يبدّل، ويتأكد إن المفتاح الطويل شايف الحساب، ويشفّر (مربوط برقم الحساب)، ويحفظ للمستخدم. بيرجّع تاريخ الانتهاء أو null
async function storeToken(user: string, token: string, account: string): Promise<string | null> {
  const ll = await longLived(token);
  if (!ll || !(await metaAccount(ll.token, account))) return null;
  const sealed = await seal(ll.token, account);
  await rpc('vault_user_put', { p_user: user, p_account: account, p_cipher: sealed.ct, p_iv: sealed.iv, p_meta_user: await metaUserId(ll.token), p_expires: ll.expiresAt });
  return ll.expiresAt;
}

// ---------- Snapchat (المرحلة ٢ من «الملخص لكل المنصات» — ٣١ أكتوبر ٢٠٢٦) ----------
// الأداة بتبعت النسخة المقفولة من مفتاح التجديد (Live/api/_seal.js — مقفولة بسر التطبيق اللي في Cloudflare بس، ومربوطة بحساب الدخول
// للأداة). منقدرش نفتحها هنا ولا نتأكد بيها من الحساب: Snapchat نفسها بترفض لو مفيش صلاحية، والمُشغّل بيبعتها للـ Worker يفتحها
// (Live/api/digest-fetch.js). بنشفّرها تاني بمفتاحنا (مربوطة بالمستخدم والمنصة والحساب)، وصلاحيتها عندنا ٦٠ يوم من آخر فتح للأداة
// بالحساب ده — زي Meta، والمُشغّل مبيمدّهاش
export const SNAP_ID = /^[0-9a-f-]{36}$/i;
const SEALED = /^v[12]\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,4000}$/;   // نفس شكل _seal.js
const SEALED_DAYS = 60;
export function sealedAad(user: string, platform: string, account: string): string { return 'sealed:' + platform + ':' + user + ':' + account; }
async function storeSealed(user: string, platform: string, account: string, sealed: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SEALED_DAYS * 86400000).toISOString();
  const c = await seal(sealed, sealedAad(user, platform, account));
  await rpc('vault_sealed_put', { p_user: user, p_platform: platform, p_account: account, p_cipher: c.ct, p_iv: c.iv, p_expires: expiresAt });
  return expiresAt;
}
// اسم الحساب زي ما ظاهر في الأداة (للقائمة والرسائل بس) — من غير رموز تحكم
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  return s || null;
}
function cleanTz(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(v)) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return v; } catch (_) { return null; }
}

// ---------- الإعدادات ----------
export function cleanEmail(v: unknown): string | null {
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
// أمس بتوقيت المستخدم: وقت التفعيل بيتسجّل كأنه «آخر ملخص غطّى لحد أمس» — فأول ملخص بييجي في ميعاده الجاي
// (مش بعد التفعيل بساعة لو التفعيل حصل يوم ملخص بعد ساعته)، ويغطي الأيام من يوم التفعيل
function yesterdayIn(tz: string): string {
  let today = '';
  try { today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (_) { today = new Date().toISOString().slice(0, 10); }
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
// ملخص المستخدم وحساباته (المرحلة ١ من «الملخص لكل مستخدم» — ٣١ أكتوبر ٢٠٢٦)
async function digestOf(user: string): Promise<any | null> {
  const r = await db('user_digests?select=email,enabled,summary_days,summary_hour,timezone,lang&user_id=eq.' + user, { method: 'GET' });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
async function accountsOf(user: string): Promise<{ platform: string; account_id: string; name?: string | null }[]> {
  const r = await db('user_digest_accounts?select=platform,account_id,name,added_at&user_id=eq.' + user + '&order=added_at.asc', { method: 'GET' });
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}
// اسم الحساب: Meta من ad_accounts (بيتحدّث مع كل مزامنة)، والباقي اللي اتحفظ مع الحساب في الملخص
async function nameOf(a: { platform: string; account_id: string; name?: string | null }): Promise<string> {
  return (a.platform === 'meta' ? await accountName(a.account_id) : a.name) || a.account_id;
}
function publicSettings(s: any) {
  return { email: s.email, enabled: s.enabled !== false, days: s.summary_days, hour: s.summary_hour, timezone: s.timezone, lang: s.lang };
}
// صلاحيات المستخدم المحفوظة: Meta (vault_user_status) والنسخ المقفولة (vault_sealed_status) — بمفتاح «المنصة:الحساب»
async function tokensOf(user: string): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  const st = await rpc('vault_user_status', { p_user: user }).catch(() => null);
  (Array.isArray(st) ? st : []).forEach((x: any) => { out['meta:' + x.account_id] = x; });
  const ss = await rpc('vault_sealed_status', { p_user: user }).catch(() => null);
  (Array.isArray(ss) ? ss : []).forEach((x: any) => { out[x.platform + ':' + x.account_id] = x; });
  return out;
}
// حالة الملخص اللي بترجع للأداة: الإعدادات، والحسابات (الاسم، وتاريخ انتهاء صلاحية القراءة، وهل فيها مشكلة)
async function digestState(user: string): Promise<Record<string, unknown>> {
  const s = await digestOf(user);
  if (!s) return { settings: null, accounts: [] };
  const list = await accountsOf(user);
  const tokens = await tokensOf(user);
  const accounts = [];
  for (const a of list) {
    const t = tokens[a.platform + ':' + a.account_id];
    accounts.push({ platform: a.platform, accountId: a.account_id, name: a.platform === 'meta' ? (await accountName(a.account_id)) || null : a.name || null,
      tokenExpiresAt: t ? t.expires_at : null, tokenProblem: !t || !!t.last_error });
  }
  return { settings: publicSettings(s), accounts };
}
// أقصى عدد حسابات لكل منصة في ملخص المستخدم (قرار صاحب المنتج ٣١ أكتوبر ٢٠٢٦: «اجعلها اكبر عدد ممكن للحسابات لكل منصة... المهم انه
// لا يحصل بينهم تعارض»): كل حساب بيتفحص لوحده (runner.ts digest_claim). Meta: حصة كل حساب إعلاني لوحده عند Meta، والحد المشترك للتطبيق
// بيحميه المُشغّل (META_APP_STOP_PCT). Snapchat: حسابات المستخدم ورا بعض (دخول واحد) — فأقل. بتزيد بعد القياس على حسابات حقيقية
// (نفس الأرقام في Live/js/ui.js DIGEST_MAX)
export const MAX_PER_PLATFORM: Record<string, number> = { meta: 20, snapchat: 10 };
async function logSend(user: string, account: string, type: string, status: string, providerId: string | null, error: string | null): Promise<void> {
  await db('send_log', { method: 'POST', headers: { 'prefer': 'return=minimal' },
    body: JSON.stringify({ user_id: user, account_id: account || '-', type, status, provider_id: providerId, error: error ? error.slice(0, 200) : null }) }).catch(() => {});
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
// أسماء الحسابات في الرسالة: «X» أو «X وY» أو «X وY وZ»
function namesText(names: string[], en: boolean): string {
  const n = names.map((x) => '<strong>' + esc(x) + '</strong>');
  if (n.length <= 1) return n.join('');
  return n.slice(0, -1).join(en ? ', ' : '، ') + (en ? ' and ' : ' و') + n[n.length - 1];
}
async function mailEnabled(user: string, names: string[], s: any): Promise<void> {
  const en = s.lang === 'en', stop = await stopUrl(user), tz = esc(s.timezone || '');
  const subject = en ? 'Automatic summary turned on' : 'تم تفعيل الملخص التلقائي';
  const lines = en ? [
    'Hello,',
    'You will receive a performance summary for ' + namesText(names, true) + ' on ' + daysText(s.summary_days, 'en') + ' at ' + hourText(s.summary_hour, 'en') +
      ' (' + tz + '), a summary of the previous month on the first Sunday of each month, plus an immediate alert whenever something urgent needs action. It follows your own alert settings.',
    'To add accounts, change the schedule or turn it off: open the tool, then "Settings", then "Automatic summary by email".',
    'If you did not ask for this, turn it off right away: <a href="' + stop + '">Stop the automatic summary</a>'
  ] : [
    'مرحباً،',
    'سيصلك ملخص أداء إعلانات ' + namesText(names, false) + ' ' + daysText(s.summary_days, 'ar') + ' الساعة ' + hourText(s.summary_hour, 'ar') +
      ' (' + tz + ')، وملخصاً للشهر السابق في أول أحد من كل شهر، إلى جانب تنبيه فوري كلما ظهر أمر عاجل يحتاج إلى إجراء، وكلها بإعدادات التنبيهات الخاصة بك.',
    'لإضافة حسابات أو تعديل المواعيد أو الإيقاف: افتح الأداة، ثم «الإعدادات»، ثم «الملخص التلقائي بالبريد».',
    'إذا لم تطلب هذا التفعيل، أوقفه فوراً من هذا الرابط: <a href="' + stop + '">إيقاف الملخص التلقائي</a>'
  ];
  const text = subject + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n') + '\n' + stop;
  try {
    const id = await sendEmail(s.email, subject, mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text);
    await logSend(user, '', 'enabled', 'sent', id, null);
  } catch (e) {
    await logSend(user, '', 'enabled', 'failed', null, String((e as Error).message || e));
  }
}
async function mailDisabled(user: string, s: any): Promise<void> {
  const en = s.lang === 'en';
  const subject = en ? 'Automatic summary turned off' : 'تم إيقاف الملخص التلقائي';
  const lines = en ? [
    'Hello,',
    'We turned off your automatic summary and alerts, and deleted the read access we had stored for them.',
    'You can turn it on again at any time inside the tool.'
  ] : [
    'مرحباً،',
    'أوقفنا الملخص والتنبيهات التلقائية الخاصة بك، وحذفنا صلاحية القراءة التي كنا نحفظها لها.',
    'يمكنك تفعيله مجدداً في أي وقت من داخل الأداة.'
  ];
  const text = subject + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n');
  try {
    const id = await sendEmail(s.email, subject, mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text);
    await logSend(user, '', 'disabled', 'sent', id, null);
  } catch (e) {
    await logSend(user, '', 'disabled', 'failed', null, String((e as Error).message || e));
  }
}
// الإيقاف: الصلاحيات والملخص وحساباته (on delete cascade) وبصماته بتتمسح فوراً
async function removeDigest(user: string): Promise<void> {
  await rpc('vault_user_delete', { p_user: user, p_account: null });
  await rpc('vault_sealed_delete', { p_user: user, p_platform: null, p_account: null });
  await db('user_alert_marks?user_id=eq.' + user, { method: 'DELETE' });
  await db('user_digests?user_id=eq.' + user, { method: 'DELETE' });
}
// حساب واحد بيخرج من الملخص (صلاحيته وبصماته معاه). آخر حساب = الملخص كله بيقف (رسالة الإيقاف)
async function removeAccount(user: string, platform: string, account: string): Promise<boolean> {
  await db('user_digest_accounts?user_id=eq.' + user + '&platform=eq.' + platform + '&account_id=eq.' + encodeURIComponent(account), { method: 'DELETE' });
  if (platform === 'meta') await rpc('vault_user_delete', { p_user: user, p_account: account });
  else await rpc('vault_sealed_delete', { p_user: user, p_platform: platform, p_account: account });
  await db('user_alert_marks?user_id=eq.' + user + '&platform=eq.' + platform + '&account_id=eq.' + encodeURIComponent(account), { method: 'DELETE' });
  // نتايجه المستنية الإرسال (runner.ts digest_outbox) — الحساب خرج من الملخص فمتظهرش في الرسالة الجاية
  await db('digest_outbox?user_id=eq.' + user + '&platform=eq.' + platform + '&account_id=eq.' + encodeURIComponent(account), { method: 'DELETE' });
  const left = await accountsOf(user);
  if (left.length) return false;
  const s = await digestOf(user);
  await removeDigest(user);
  if (s) await mailDisabled(user, s);
  return true;
}
export async function accountName(account: string): Promise<string | undefined> {
  const r = await db('ad_accounts?select=name&platform=eq.meta&account_id=eq.' + account, { method: 'GET' }).catch(() => null);
  const rows = r ? await r.json().catch(() => null) : null;
  return Array.isArray(rows) && rows[0] && rows[0].name ? rows[0].name : undefined;
}
// صلاحية المستخدم المحفوظة للحساب بتتفك وMeta لسه قابلاها؟ (null = مفيش). لو لأ بنسجّل السبب بس، من غير أي جزء منها
async function storedTokenWorks(user: string, account: string): Promise<boolean | null> {
  const rows = await rpc('vault_user_get', { p_user: user, p_account: account });
  const t = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!t) return null;
  let token = '';
  try { token = await unseal(t.ciphertext, t.iv, account); } catch (_) {
    await rpc('vault_user_mark_error', { p_user: user, p_account: account, p_error: 'decrypt failed' });
    return false;
  }
  const ok = !!(await metaAccount(token, account));
  if (!ok) await rpc('vault_user_mark_error', { p_user: user, p_account: account, p_error: 'meta rejected stored token' });
  return ok;
}

// ---------- العمليات ----------
// كل العمليات لصاحب الدخول (userId من index.ts requireLogin) — ملخصه هو بس. إضافة حساب Meta محتاجة مفتاحه (token) بيثبت إن صاحبه
// شايف الحساب. رابط الإيقاف (stop) من غير دخول: توقيعه هو الإثبات
// الحساب المفتوح (open) = Meta: { accountId, token }، أو Snapchat: { platform: 'snapchat', accountId, sealed, name?, timezone? }
//   digest.get     ← { platform?, accountId? }  الملخص وحساباته (ولو الحساب المفتوح في الملخص: صلاحيته شغالة؟)
//   digest.enable  ← { ...open, email, days?, hour?, lang, consent: true }  تفعيل بالحساب المفتوح
//   digest.add     ← { ...open }                 إضافة الحساب المفتوح للملخص
//   digest.remove  ← { platform, accountId }  إخراج حساب (آخر حساب = إيقاف الملخص)
//   digest.update  ← { email?, days?, hour?, lang? }
//   digest.disable ← {}                       إيقاف الملخص كله
//   digest.refresh ← { ...open }              الأداة بتبعته لما الحساب يتفتح — بيجدد صلاحيته (٦٠ يوم) لو الحساب في الملخص
//   digest.disconnect ← { platform? }         «فصل» المنصة (Meta لو مفيش): حساباتها بتخرج من الملخص وصلاحياتها بتتمسح
//   stop           ← { u, sig } | { account, sig }   رابط الإيقاف (الجديد لكل مستخدم، والقديم لكل حساب في رسائل اتبعتت قبل كده)
export async function handleDigest(action: string, body: any, origin: string | null, userId: string | null = null): Promise<Response> {
  if (action === 'stop') {
    const sig = body.sig;
    if (typeof sig !== 'string' || sig.length > 100) return reply(400, { error: 'link' }, origin);
    let user: string | null = null;
    if (typeof body.u === 'string' && USER_ID.test(body.u)) {
      if (!sameString(sig, await stopSig(body.u))) return reply(403, { error: 'link' }, origin);
      user = body.u;
    } else if (typeof body.account === 'string' && META_ID.test(body.account)) {
      // رابط قديم (قبل ٣١ أكتوبر): الحساب ده بيخرج من ملخص صاحبه
      if (!sameString(sig, await legacyStopSig(body.account))) return reply(403, { error: 'link' }, origin);
      const r = await db('digest_settings?select=user_id&account_id=eq.' + body.account, { method: 'GET' });
      const rows = await r.json().catch(() => null);
      const owner = Array.isArray(rows) && rows[0] && typeof rows[0].user_id === 'string' ? rows[0].user_id : null;
      if (!owner) return reply(200, { ok: true, wasEnabled: false }, origin);
      const had = (await accountsOf(owner)).some((a) => a.platform === 'meta' && a.account_id === body.account);
      if (had) await removeAccount(owner, 'meta', body.account);
      await logSend(owner, body.account, 'disabled', 'skipped', null, 'stop link (old)');
      return reply(200, { ok: true, wasEnabled: had }, origin);
    } else return reply(400, { error: 'link' }, origin);
    const s = await digestOf(user as string);
    if (s) {
      await removeDigest(user as string);
      await logSend(user as string, '', 'disabled', 'skipped', null, 'stop link');
    }
    return reply(200, { ok: true, wasEnabled: !!s }, origin);
  }

  const user = typeof userId === 'string' && USER_ID.test(userId) ? userId : null;
  if (!user) return reply(401, { error: 'login', code: 'LOGIN' }, origin);
  const now = new Date().toISOString();

  if (action === 'digest.get') {
    const state = await digestState(user);
    // الحساب المفتوح في الأداة: في الملخص؟ وصلاحيته شغالة؟ Meta: طلب لـ Meta (لو الحساب في الملخص). Snapchat: آخر فحص للمُشغّل
    // (مفيش طريقة نتأكد بيها هنا — النسخة بتتفتح في الـ Worker بس)
    const platform = body.platform === 'snapchat' ? 'snapchat' : 'meta';
    const account = typeof body.accountId === 'string' && (platform === 'meta' ? META_ID : SNAP_ID).test(body.accountId) ? body.accountId : null;
    const row = account ? (state.accounts as any[]).find((a) => a.platform === platform && a.accountId === account) : null;
    const works = !row ? null : platform === 'meta' ? await storedTokenWorks(user, account as string) : !row.tokenProblem;
    return reply(200, { ...state, current: account ? { platform, accountId: account, included: !!row, tokenWorks: works } : null }, origin);
  }

  if (action === 'digest.update') {
    const s = await digestOf(user);
    if (!s || !s.enabled) return reply(409, { error: 'not enabled' }, origin);
    const patch: Record<string, unknown> = { updated_at: now };
    if (body.email !== undefined) { const e = cleanEmail(body.email); if (!e) return reply(400, { error: 'email' }, origin); patch.email = e; }
    if (body.days !== undefined) { const d = cleanDays(body.days); if (!d) return reply(400, { error: 'days' }, origin); patch.summary_days = d; }
    if (body.hour !== undefined) { const h = cleanHour(body.hour); if (h === null) return reply(400, { error: 'hour' }, origin); patch.summary_hour = h; }
    if (body.lang === 'ar' || body.lang === 'en') patch.lang = body.lang;
    await db('user_digests?user_id=eq.' + user, { method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(patch) });
    const next = { ...s, ...patch };
    if (patch.email && patch.email !== s.email) {   // تأكيد للعنوان الجديد
      const names = [];
      for (const a of await accountsOf(user)) names.push(await nameOf(a));
      await mailEnabled(user, names, next);
    }
    return reply(200, { ok: true, ...(await digestState(user)) }, origin);
  }

  if (action === 'digest.disable') {
    const s = await digestOf(user);
    await removeDigest(user);
    if (s) await mailDisabled(user, s);
    return reply(200, { ok: true }, origin);
  }

  if (action === 'digest.remove') {
    const platform = body.platform, account = body.accountId;
    if (PLATFORMS.indexOf(platform) < 0 || typeof account !== 'string' || !ACCOUNT_ID.test(account)) return reply(400, { error: 'account' }, origin);
    const stopped = await removeAccount(user, platform, account);
    return reply(200, { ok: true, stopped, ...(await digestState(user)) }, origin);
  }

  if (action === 'digest.disconnect') {
    // «فصل» منصة في الأداة: كل حساباتها بتخرج من ملخص المستخدم وصلاحياتها بتتمسح (الملخص بيفضل لو فيه حسابات من منصات تانية)
    const platform = body.platform === 'snapchat' ? 'snapchat' : 'meta';
    const list = (await accountsOf(user)).filter((a) => a.platform === platform);
    let stopped = false;
    for (const a of list) stopped = (await removeAccount(user, platform, a.account_id)) || stopped;
    if (platform === 'meta') await rpc('vault_user_delete', { p_user: user, p_account: null });
    else await rpc('vault_sealed_delete', { p_user: user, p_platform: platform, p_account: null });
    return reply(200, { ok: true, removed: list.length, stopped }, origin);
  }

  // باقي العمليات بالحساب المفتوح في الأداة وإثبات الوصول ليه: Meta = { accountId, token } — بنتأكد من Meta دلوقتي ونبدّله بمفتاح طويل.
  // Snapchat = { platform: 'snapchat', accountId, sealed, name?, timezone? } — النسخة المقفولة (SNAP_ID فوق)، وSnapchat بتتأكد في أول فحص
  const platform = body.platform === undefined ? 'meta' : body.platform;
  if (platform !== 'meta' && platform !== 'snapchat') return reply(400, { error: 'platform' }, origin);
  const account = body.accountId;
  if (typeof account !== 'string' || !(platform === 'meta' ? META_ID : SNAP_ID).test(account)) return reply(400, { error: 'account' }, origin);
  let acc: any = null;
  if (platform === 'meta') {
    if (typeof body.token !== 'string' || !TOKEN.test(body.token)) return reply(400, { error: 'token' }, origin);
    acc = await metaAccount(body.token, account);
    if (!acc) return reply(403, { error: 'not verified' }, origin);
  } else if (typeof body.sealed !== 'string' || body.sealed.length > 4096 || !SEALED.test(body.sealed)) return reply(400, { error: 'sealed' }, origin);
  const name = platform === 'meta' ? (acc.name || null) : cleanName(body.name);
  // يحفظ صلاحية الحساب للمستخدم ويرجّع تاريخ انتهائها (null = Meta رفضت التبديل)
  const store = (): Promise<string | null> => platform === 'meta' ? storeToken(user, body.token, account) : storeSealed(user, platform, account, body.sealed);
  // الحساب في الملخص (الاسم بيتحدّث لغير Meta — Meta اسمها من ad_accounts)
  const saveAccount = () => db('user_digest_accounts?on_conflict=user_id,platform,account_id', {
    method: 'POST', headers: { 'prefer': (platform === 'meta' ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates') + ',return=minimal' },
    body: JSON.stringify(platform === 'meta' ? { user_id: user, platform, account_id: account } : { user_id: user, platform, account_id: account, name })
  });

  if (action === 'digest.refresh') {
    const has = (await accountsOf(user)).some((a) => a.platform === platform && a.account_id === account);
    if (!has) return reply(200, { ok: true, enabled: false, hasDigest: !!(await digestOf(user)) }, origin);
    const expiresAt = await store();
    if (!expiresAt) return reply(502, { error: 'meta exchange' }, origin);
    if (platform !== 'meta' && name) await saveAccount();
    return reply(200, { ok: true, enabled: true, tokenExpiresAt: expiresAt }, origin);
  }

  if (action === 'digest.add') {
    const s = await digestOf(user);
    if (!s || !s.enabled) return reply(409, { error: 'not enabled' }, origin);
    const list = (await accountsOf(user)).filter((a) => a.platform === platform);
    if (!list.some((a) => a.account_id === account) && list.length >= (MAX_PER_PLATFORM[platform] || 0)) return reply(409, { error: 'too many' }, origin);
    const expiresAt = await store();
    if (!expiresAt) return reply(502, { error: 'meta exchange' }, origin);
    await saveAccount();
    return reply(200, { ok: true, ...(await digestState(user)) }, origin);
  }

  if (action === 'digest.enable') {
    if (body.consent !== true) return reply(400, { error: 'consent' }, origin);
    const email = cleanEmail(body.email);
    if (!email) return reply(400, { error: 'email' }, origin);
    const days = body.days === undefined ? DEFAULT_DAYS : cleanDays(body.days);
    if (!days) return reply(400, { error: 'days' }, origin);
    const hour = body.hour === undefined ? DEFAULT_HOUR : cleanHour(body.hour);
    if (hour === null) return reply(400, { error: 'hour' }, origin);
    const expiresAt = await store();
    if (!expiresAt) return reply(502, { error: 'meta exchange' }, origin);
    // توقيت الملخص: توقيت الحساب اللي اتفعّل بيه (Meta من Meta نفسها، وSnapchat زي ما الأداة شايفاه)
    const tz = (platform === 'meta' ? acc.timezone_name : cleanTz(body.timezone)) || 'Asia/Riyadh';
    const row = { user_id: user, email, enabled: true, summary_days: days, summary_hour: hour, timezone: tz, lang: body.lang === 'en' ? 'en' : 'ar',
      consent_at: now, consent_version: CONSENT_VERSION, updated_at: now, last_summary_until: yesterdayIn(tz) };
    await db('user_digests?on_conflict=user_id', { method: 'POST', headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    await saveAccount();
    const names = [];
    for (const a of await accountsOf(user)) names.push(a.platform === platform && a.account_id === account && name ? name : await nameOf(a));
    await mailEnabled(user, names, row);
    return reply(200, { ok: true, tokenExpiresAt: expiresAt, ...(await digestState(user)) }, origin);
  }

  return reply(400, { error: 'action' }, origin);
}
