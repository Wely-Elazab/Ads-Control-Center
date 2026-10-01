// أدوات مشتركة لدالة sync: الردود، قاعدة البيانات، التحقق من Meta، البريد.
// كل حاجة هنا من غير أي سر في الكود — الأسرار من Deno.env (أسرار الدوال في Supabase)

export const ORIGINS = ['https://adscenter.online'];
export const GRAPH = 'https://graph.facebook.com/v26.0';
export const META_APP_ID = '2950488078638871';   // نفس js/meta.js — رقم التطبيق عام، السر بس اللي في Secrets
export const META_ID = /^act_\d{1,30}$/;
export const TOKEN = /^[A-Za-z0-9._|-]{20,2048}$/;
export const SITE = 'https://adscenter.online';

// المفتاح السري الجديد (sb_secret_...)، والقديم (service_role) احتياطي — القديم بيتوقف آخر ٢٠٢٦
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (keys && keys.default) return keys.default;
  } catch (_) { /* نكمل بالقديم */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Vary': 'Origin' };
  if (origin && ORIGINS.indexOf(origin) > -1) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'content-type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

export function reply(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

// PostgREST بالمفتاح السري (بيتخطى RLS — الجداول مقفولة على أي حد غيره)
export async function db(path: string, init: RequestInit): Promise<Response> {
  const key = secretKey();
  const headers: Record<string, string> = { 'apikey': key, 'content-type': 'application/json' };
  if (key.indexOf('eyJ') === 0) headers['authorization'] = 'Bearer ' + key;   // المفتاح القديم JWT
  Object.assign(headers, (init.headers || {}) as Record<string, string>);
  const r = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/' + path, { ...init, headers });
  if (!r.ok) throw new Error('db ' + r.status + ' ' + (await r.text()).slice(0, 120));
  return r;
}
export async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
  const r = await db('rpc/' + name, { method: 'POST', body: JSON.stringify(args) });
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// Meta: صاحب المفتاح يقدر يشوف الحساب ده؟ (بيرجع اسمه وعملته وتوقيته من Meta نفسها)
export async function metaAccount(token: string, id: string): Promise<Record<string, string> | null> {
  const url = GRAPH + '/' + id + '?fields=id,name,currency,timezone_name&access_token=' + encodeURIComponent(token);
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  return j && j.id === id ? j : null;
}

// صاحب المفتاح مدير (administrators) لتطبيق Meta بتاعنا؟ بوابة العمليات الإدارية.
// null = مش قادرين نتأكد (سر التطبيق ناقص أو غلط) — ده في حد ذاته بيقول إن META_APP_SECRET فيه مشكلة
export async function isAppAdmin(token: string): Promise<boolean | null> {
  const secret = Deno.env.get('META_APP_SECRET');
  if (!secret) return null;
  const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const roles = await get(GRAPH + '/' + META_APP_ID + '/roles?limit=200&access_token=' + encodeURIComponent(META_APP_ID + '|' + secret));
  if (!roles || !Array.isArray(roles.data)) return null;
  const me = await get(GRAPH + '/me?fields=id&access_token=' + encodeURIComponent(token));
  if (!me || !me.id) return false;
  return roles.data.some((x: any) => String(x.user) === String(me.id) && x.role === 'administrators');
}

export function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v ? v.slice(0, max) : null;
}
export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- البريد (Resend — المفتاح بصلاحية «إرسال فقط») ----------
export const MAIL_FROM = 'Ads Center <support@adscenter.online>';
export const MAIL_REPLY_TO = 'support@adscenter.online';
// بيرجّع رقم الرسالة عند Resend، أو بيرمي خطأ فيه حالة Resend بس (من غير محتوى الرسالة).
// replyTo: إشعار طلب الانضمام بس — الرد عليه بيروح للعميل نفسه (الباقي الرد بيرجع لـ support@)
export async function sendEmail(to: string, subject: string, html: string, text: string, replyTo = MAIL_REPLY_TO): Promise<string> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('resend key missing');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], reply_to: replyTo, subject, html, text })
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.id) throw new Error('resend ' + r.status + ' ' + String((j && (j.name || j.message)) || '').slice(0, 80));
  return j.id;
}
// غلاف الرسائل: من غير صور ولا روابط تتبّع. الفقرات جاهزة (اللي فيها بيانات من برّه لازم تتعمل لها esc قبلها)
// والفقرة اللي بتبدأ بـ <div (صندوق تنبيه) بتتحط زي ما هي
export function mailHtml(title: string, paragraphs: string[], lang: 'ar' | 'en' = 'ar'): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const p = paragraphs.map((x) => (x.indexOf('<div') === 0 ? x : '<p style="margin:0 0 14px;line-height:1.8">' + x + '</p>')).join('');
  return '<div dir="' + dir + '" lang="' + lang + '" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;color:#1f2933;max-width:560px;margin:0 auto;padding:24px">' +
    '<h1 style="font-size:19px;margin:0 0 18px">' + title + '</h1>' + p +
    '<p style="margin:24px 0 0;font-size:13px;color:#6b7280">Ads Center — adscenter.online</p></div>';
}
