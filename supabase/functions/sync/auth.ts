// تسجيل الدخول للأداة (قرار صاحب المنتج ٦ أكتوبر ٢٠٢٦): بريد وكلمة مرور (Supabase Auth)، وبعدهم رمز من ٦ أرقام
// على البريد في كل دخول جديد — مش بديل لكلمة المرور. Supabase مفيهوش البريد كخطوة تانية، فهي هنا:
//   login.code   ← (مفتاح دخول بكلمة المرور) بيبعت الرمز للبريد. صاحب البريد لازم يكون في app_access
//   login.verify ← { code } بيأكّد الجلسة دي (login_sessions.verified_at)
//   login.status ← هل الجلسة دي مأكَّدة؟ (صفحة الأداة بتسأل قبل ما تفتح)
//   login.forgot ← { email } «أول دخول؟ أنشئ كلمة المرور» و«نسيت كلمة المرور» نفس الحاجة: رابط على البريد.
//                  لو البريد في app_access ومالوش حساب، الحساب بيتعمل دلوقتي. الرد دايماً «تم» (محدش يعرف مين مسجّل)
// requireLogin  ← باقي عمليات sync (الملخص والإجابات...) بتطلبه: مفتاح دخول سليم + جلسة مأكَّدة + صاحبها مسموح له
//
// مفتاح الدخول (JWT) بيتحقق منه بمفاتيح Supabase العامة (ES256 — /.well-known/jwks.json)، من غير أي سر.
// الرمز نفسه مبيتحفظش: HMAC بمفتاح مشتق (digest.ts linkSig). مبيتكتبش في السجلات ولا البريد ولا كلمة المرور.

import { SITE, db, rpc, reply, sendEmail, mailHtml, esc, authAdmin } from './lib.ts';
import { linkSig, sameString, cleanEmail } from './digest.ts';

export const PROJECT = 'https://rhrrnxsgodiideqeollo.supabase.co';
const ISSUER = PROJECT + '/auth/v1';
const CODE_LABEL = 'ads-center/login-code/v1:';
const CODE_TTL_MS = 10 * 60000;      // الرمز صالح ١٠ دقايق
const RESEND_MS = 60000;             // رمز جديد بعد دقيقة على الأقل
const MAX_SENDS = 5;                 // لكل جلسة دخول
const MAX_TRIES = 5;                 // لكل رمز — بعدها لازم رمز جديد
const MAIL_GAP_MS = 2 * 60000;       // رابط كلمة المرور: مرة كل دقيقتين لنفس البريد
const MAIL_PER_DAY = 5;
const VERIFIED_DAYS = 30;            // نفس session_ok في قاعدة البيانات

// ---------- مفتاح الدخول ----------
const dec = new TextDecoder();
function b64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
let jwks: Promise<Record<string, CryptoKey>> | null = null, jwksAt = 0;
function signingKeys(force = false): Promise<Record<string, CryptoKey>> {
  if (!jwks || force || Date.now() - jwksAt > 3600000) {
    jwksAt = Date.now();
    jwks = (async () => {
      const j = await (await fetch(ISSUER + '/.well-known/jwks.json')).json();
      const out: Record<string, CryptoKey> = {};
      for (const k of (j && j.keys) || []) {
        if (k.kty !== 'EC' || k.crv !== 'P-256' || !k.kid) continue;
        out[k.kid] = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: k.x, y: k.y, ext: true },
          { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      }
      return out;
    })().catch((e) => { jwks = null; throw e; });
  }
  return jwks;
}
// المحتوى لو التوقيع والمُصدِر والجمهور والصلاحية سليمين، وإلا null
export async function verifyJwt(token: string | null): Promise<any | null> {
  if (!token || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: any, payload: any;
  try { header = JSON.parse(dec.decode(b64url(parts[0]))); payload = JSON.parse(dec.decode(b64url(parts[1]))); } catch (_) { return null; }
  if (!header || header.alg !== 'ES256' || !header.kid) return null;
  let key = (await signingKeys())[header.kid];
  if (!key) key = (await signingKeys(true))[header.kid];   // المفتاح اتغيّر عند Supabase
  if (!key) return null;
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== ISSUER || aud.indexOf('authenticated') < 0 || !(payload.exp * 1000 > Date.now())) return null;
  if (typeof payload.sub !== 'string' || typeof payload.session_id !== 'string' || typeof payload.email !== 'string') return null;
  return payload;
}
export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  return /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, '').trim() : null;
}
// الدخول بكلمة المرور بالذات (مش رابط البريد) — الرمز خطوة تانية بعد كلمة المرور، فرابط البريد لوحده مبيدخّلش
function byPassword(p: any): boolean {
  return Array.isArray(p.amr) && p.amr.some((m: any) => m && m.method === 'password');
}
async function accessOf(email: string): Promise<{ role: string } | null> {
  const r = await db('app_access?select=role&email=eq.' + encodeURIComponent(email.toLowerCase()), { method: 'GET' });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
// باقي عمليات sync: null = مفيش دخول مكتمل (والعملية بترد ٤٠١ code: LOGIN)
export async function requireLogin(req: Request): Promise<{ id: string; email: string } | null> {
  const p = await verifyJwt(bearer(req)).catch(() => null);
  if (!p) return null;
  const ok = await rpc('session_ok', { p_session: p.session_id, p_user: p.sub }).catch(() => false);
  return ok === true ? { id: p.sub, email: String(p.email).toLowerCase() } : null;
}

// ---------- الرسائل ----------
const BTN = 'display:inline-block;background:#0E7A63;color:#ffffff;font-weight:700;padding:11px 20px;border-radius:8px;text-decoration:none';
function codeMail(code: string, en: boolean) {
  const subject = en ? 'Your Ads Center sign-in code: ' + code : 'رمز الدخول إلى Ads Center: ' + code;
  const box = '<div style="margin:0 0 16px"><span dir="ltr" style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:6px;' +
    'padding:10px 18px;border:1px solid #e3e5df;border-radius:10px;background:#f5f6f2">' + code + '</span></div>';
  const lines = en ? [
    'Hello,', 'Your code to sign in to Ads Center:', box,
    'It works once, for the next 10 minutes.',
    'If it wasn\'t you trying to sign in just now, someone knows your password: change it right away from the sign-in page with "Forgot your password?".',
    'We will never ask you for this code, by email or by phone.'
  ] : [
    'مرحباً،', 'رمز الدخول إلى حسابك في Ads Center:', box,
    'الرمز صالح لمرة واحدة خلال ١٠ دقائق.',
    'إن لم تكن أنت من يحاول الدخول الآن، فهذا يعني أن أحداً يعرف كلمة مرورك: غيّرها فوراً من صفحة الدخول عبر «نسيت كلمة المرور؟».',
    'لن نطلب منك هذا الرمز أبداً، لا بالبريد ولا بالهاتف.'
  ];
  return { subject, html: mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text: subject + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n') };
}
function passwordMail(url: string, en: boolean) {
  const subject = en ? 'Set your Ads Center password' : 'إنشاء كلمة مرور الدخول إلى Ads Center';
  const btn = '<div style="margin:0 0 16px"><a href="' + esc(url) + '" style="' + BTN + '">' + (en ? 'Choose a password' : 'اختر كلمة المرور') + '</a></div>';
  const lines = en ? [
    'Hello,', 'You asked to set or change the password for your Ads Center account. Press the button to choose it:', btn,
    'The link works once, for the next hour.',
    'If you didn\'t ask for this, ignore this email — nothing changes in your account.'
  ] : [
    'مرحباً،', 'طلبتَ إنشاء كلمة مرور لحسابك في Ads Center أو تغييرها. اضغط الزر لاختيارها:', btn,
    'الرابط صالح لمرة واحدة خلال ساعة.',
    'إن لم تطلب ذلك، فتجاهل هذه الرسالة؛ لن يتغيّر شيء في حسابك.'
  ];
  return { subject, html: mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text: subject + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n') + '\n\n' + url };
}

// ---------- الرمز ----------
function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}
function codeHash(session: string, code: string): Promise<string> { return linkSig(CODE_LABEL, session + ':' + code); }
// الأرقام العربية والفارسية بتتحوّل، وأي مسافات بتتشال
export function cleanCode(v: unknown): string | null {
  const s = String(v == null ? '' : v).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0)).replace(/\s+/g, '');
  return /^\d{6}$/.test(s) ? s : null;
}
async function sessionRow(session: string): Promise<any | null> {
  const r = await db('login_sessions?select=*&session_id=eq.' + encodeURIComponent(session), { method: 'GET' });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
function freshVerified(row: any): boolean {
  return !!(row && row.verified_at && Date.now() - Date.parse(row.verified_at) < VERIFIED_DAYS * 86400000);
}
async function saveSession(fields: Record<string, unknown>): Promise<void> {
  await db('login_sessions?on_conflict=session_id', { method: 'POST',
    headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(fields) });
}

// ---------- العمليات ----------
export async function handleLogin(action: string, body: any, req: Request, origin: string | null): Promise<Response> {
  const en = body && body.lang === 'en';

  if (action === 'login.forgot') {
    const email = cleanEmail(body && body.email);
    if (!email) return reply(400, { error: 'email' }, origin);
    const done = reply(200, { ok: true }, origin);
    if (!(await accessOf(email))) return done;
    const since = new Date(Date.now() - 86400000).toISOString();
    const log = await (await db('auth_mail_log?select=sent_at&email=eq.' + encodeURIComponent(email) + '&sent_at=gte.' + encodeURIComponent(since) +
      '&order=sent_at.desc&limit=' + MAIL_PER_DAY, { method: 'GET' })).json();
    if (Array.isArray(log) && (log.length >= MAIL_PER_DAY || (log[0] && Date.now() - Date.parse(log[0].sent_at) < MAIL_GAP_MS))) return done;
    // أول مرة: الحساب بيتعمل دلوقتي (البريد مأكَّد — هو اللي هيستقبل الرابط)
    if (!(await rpc('auth_user_id', { p_email: email }))) {
      await authAdmin('admin/users', { method: 'POST', body: JSON.stringify({ email, email_confirm: true }) });
    }
    const link = await authAdmin('admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'recovery', email }) });
    const hashed = link && ((link.properties && link.properties.hashed_token) || link.hashed_token);
    if (typeof hashed !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(hashed)) throw new Error('generate_link');
    const mail = passwordMail(SITE + '/login?reset=' + hashed + (en ? '&lang=en' : ''), en);
    await sendEmail(email, mail.subject, mail.html, mail.text);
    await db('auth_mail_log', { method: 'POST', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify({ email, kind: 'password' }) });
    return done;
  }

  const p = await verifyJwt(bearer(req)).catch(() => null);
  if (!p) return reply(401, { error: 'login', code: 'LOGIN' }, origin);
  const email = String(p.email).toLowerCase();
  const access = await accessOf(email);

  if (action === 'login.status') {
    const ok = access ? await rpc('session_ok', { p_session: p.session_id, p_user: p.sub }).catch(() => false) : false;
    return reply(200, { ok: true, verified: ok === true, access: !!access, email, role: access ? access.role : null }, origin);
  }

  if (!byPassword(p)) return reply(401, { error: 'password', code: 'LOGIN' }, origin);
  if (!access) return reply(403, { error: 'access' }, origin);
  const row = await sessionRow(p.session_id);

  if (action === 'login.code') {
    if (freshVerified(row)) return reply(200, { ok: true, verified: true }, origin);
    if (row && row.last_sent_at && Date.now() - Date.parse(row.last_sent_at) < RESEND_MS) {
      return reply(429, { error: 'wait', retryIn: Math.ceil((RESEND_MS - (Date.now() - Date.parse(row.last_sent_at))) / 1000) }, origin);
    }
    if (row && row.sends >= MAX_SENDS) return reply(429, { error: 'sends' }, origin);
    const code = newCode(), now = new Date();
    const mail = codeMail(code, en);
    await sendEmail(email, mail.subject, mail.html, mail.text);
    await saveSession({ session_id: p.session_id, user_id: p.sub, code_hash: await codeHash(p.session_id, code),
      code_expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(), attempts: 0, sends: (row ? row.sends : 0) + 1, last_sent_at: now.toISOString() });
    return reply(200, { ok: true, sent: true }, origin);
  }

  if (action === 'login.verify') {
    if (freshVerified(row)) return reply(200, { ok: true, verified: true }, origin);
    const code = cleanCode(body && body.code);
    if (!code) return reply(400, { error: 'code' }, origin);
    if (!row || !row.code_hash || !row.code_expires_at || Date.parse(row.code_expires_at) < Date.now()) return reply(400, { error: 'expired' }, origin);
    if (row.attempts >= MAX_TRIES) return reply(429, { error: 'tries' }, origin);
    if (!sameString(await codeHash(p.session_id, code), row.code_hash)) {
      await saveSession({ session_id: p.session_id, user_id: p.sub, attempts: row.attempts + 1 });
      return reply(400, { error: 'code', left: Math.max(0, MAX_TRIES - row.attempts - 1) }, origin);
    }
    await saveSession({ session_id: p.session_id, user_id: p.sub, code_hash: null, code_expires_at: null, verified_at: new Date().toISOString() });
    return reply(200, { ok: true, verified: true }, origin);
  }

  return reply(400, { error: 'action' }, origin);
}
