// طلبات الانضمام للتجربة المغلقة (نموذج /join) — بدل رسالة البريد الجاهزة (mailto) اللي كانت بتضيع لو مفيش برنامج بريد
//   join          ← { lang, name, business, store, country, platforms, fb?, googleEmail?, email, whatsapp?, consent: true, hp, ms }
//                    عام (من غير دخول): بيتحفظ في pilot_requests، ويوصلنا إشعار على support@ فيه البيانات وزرار «أرسلت الدعوة»
//   join.peek     ← { id, sig }  صفحة /invited (الرابط الموقّع اللي في إشعارنا): بيانات الطلب عشان نراجعها قبل الإرسال
//   join.activate ← { id, sig }  بيبعت للعميل رسالة التفعيل (قبول دعوة فيسبوك من الموبايل أو الكمبيوتر + الربط) ويعلّم الطلب
//
// مفيش رسالة للعميل وقت الطلب نفسه: اللي يكتب بريد حد تاني ميقدرش يستخدمنا نبعت رسائل لأي حد —
// أول رسالة بتطلع بعد ما إحنا نراجع الطلب ونضيفه على المنصات ونضغط الزرار.
// الحماية من الإغراق: حقل مخفي (hp) ووقت ملء النموذج (ms) وحد أقصى للطلبات في الساعة.
// فيسبوك مبيبعتش إشعار بدعوة المختبِر (ومفيش طريقة نخليه يبعت)، والرابط بيفتح صفحة الدعوات على الكمبيوتر بس —
// على الموبايل بيفتح إعدادات عامة، فرسالة التفعيل فيها خطوات الموبايل من جوه تطبيق فيسبوك (اتجرّب ١ أكتوبر ٢٠٢٦)

import { META_APP_ID, SITE, MAIL_REPLY_TO, db, reply, esc, sendEmail, mailHtml } from './lib.ts';
import { linkSig, sameString, cleanEmail } from './digest.ts';

const CONSENT_VERSION = '2026-10-01';
const SIG_LABEL = 'ads-center/join-invited/v1:';
const PLATFORMS = ['meta', 'google', 'snapchat', 'tiktok'];
const HOURLY_MAX = 30;                 // أكتر من كده في الساعة = حد بيغرقنا — بنرفض لحد ما الساعة تعدّي
const MIN_FILL_MS = 2500;              // أسرع من كده = برنامج مش إنسان: بنرد «تم» من غير ما نحفظ
const REPEAT_QUIET_MS = 10 * 60000;    // نفس البريد بعت تاني خلال ١٠ دقايق: بنحدّث الطلب من غير إشعار جديد
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FB_REQUESTS = 'https://www.facebook.com/settings/?tab=applications';

type Req = {
  id: string; email: string; name: string; business: string; store_url: string; country: string; platforms: string[];
  fb_profile: string | null; google_email: string | null; whatsapp: string | null; lang: string; status: string;
  submissions: number; activated_at: string | null; created_at: string; updated_at: string;
};
const COLUMNS = 'id,email,name,business,store_url,country,platforms,fb_profile,google_email,whatsapp,lang,status,submissions,activated_at,created_at,updated_at';

// ---------- تنظيف المدخلات ----------
// سطر واحد: من غير رموز تحكم ولا علامات اتجاه (بتلخبط العرض في الإشعار)، والمسافات الزيادة بتتشال
function line(v: unknown, max: number, min = 1): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= min && s.length <= max ? s : null;
}
// رابط المتجر: نطاق فيه نقطة، ولو من غير https:// بنضيفها
function cleanStore(v: unknown): string | null {
  let s = line(v, 300, 4);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return /^[^.\s]+(\.[^.\s]+)+$/.test(u.hostname) ? u.href.slice(0, 300) : null;
  } catch (_) { return null; }
}
// حساب فيسبوك: facebook.com/الاسم، أو profile.php?id=رقم، أو رابط «مشاركة الملف الشخصي» من الموبايل (facebook.com/share/…)،
// أو اسم المستخدم لوحده. أي نطاق تاني مرفوض (الرابط ده بنفتحه من الإشعار)
function cleanFb(v: unknown): string | null {
  let s = line(v, 300, 3);
  if (!s) return null;
  if (/^@?[A-Za-z0-9.]{3,80}$/.test(s) && !/\.(com|net|org)$/i.test(s)) return 'https://www.facebook.com/' + s.replace(/^@/, '');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u: URL;
  try { u = new URL(s); } catch (_) { return null; }
  if (!/(^|\.)(facebook\.com|fb\.com)$/i.test(u.hostname) || u.pathname.length < 3) return null;
  if (/^\/profile\.php$/i.test(u.pathname)) {
    const id = u.searchParams.get('id');
    return id && /^\d{5,25}$/.test(id) ? 'https://www.facebook.com/profile.php?id=' + id : null;
  }
  return /^[\w.\-\/%]{3,200}$/.test(u.pathname) ? 'https://www.facebook.com' + u.pathname : null;
}
// واتساب: أرقام (عربي أو إنجليزي) و+ ومسافات وشرط — من ٦ لـ ١٦ رقم
function cleanPhone(v: unknown): string | null {
  const raw = line(v, 30);
  if (!raw) return null;
  const s = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  const digits = s.replace(/\D/g, '').length;
  return /^\+?[\d\s\-()]+$/.test(s) && digits >= 6 && digits <= 16 ? s : null;
}

// ---------- قاعدة البيانات ----------
async function one(query: string): Promise<Req | null> {
  const rows = await (await db('pilot_requests?select=' + COLUMNS + '&' + query + '&limit=1', { method: 'GET' })).json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
const sigOf = (id: string) => linkSig(SIG_LABEL, 'join:' + id);
function publicView(r: Req) {
  return {
    name: r.name, business: r.business, email: r.email, store: r.store_url, country: r.country, platforms: r.platforms,
    fb: r.fb_profile, googleEmail: r.google_email, whatsapp: r.whatsapp, lang: r.lang, status: r.status,
    submissions: r.submissions, activatedAt: r.activated_at, createdAt: r.created_at
  };
}

// ---------- الرسائل ----------
const NAMES: Record<string, string> = { meta: 'Meta', google: 'Google Ads', snapchat: 'Snapchat', tiktok: 'TikTok' };
const BTN = 'display:inline-block;background:#0E7A63;color:#ffffff;font-weight:700;padding:11px 20px;border-radius:8px;text-decoration:none';
const BOX = 'border:1px solid #e3e5df;border-radius:10px;padding:10px 14px;margin:0 0 12px;line-height:1.8';
const MUTED = 'color:#6b7280;font-size:14px';
function text(subject: string, lines: string[]): string {
  return subject + '\n\n' + lines.map((l) => l.replace(/<br>/g, '\n').replace(/<\/(p|tr|li|div)>/g, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').trim()).join('\n\n');
}
function link(url: string, label?: string): string {
  return '<a href="' + esc(url) + '">' + esc(label || url) + '</a>';
}

// إشعارنا بالطلب (لصاحب الأداة، عربي): البيانات + خطوات الإضافة على كل منصة + زرار «أرسلت الدعوة»
async function adminMail(r: Req, repeat: boolean) {
  const has = (p: string) => r.platforms.indexOf(p) > -1;
  const subject = (repeat ? 'تحديث طلب انضمام: ' : 'طلب انضمام جديد: ') + r.name + ' — ' + r.business;
  const td = 'padding:6px 0;border-bottom:1px solid #e5e7eb;vertical-align:top';
  const row = (k: string, v: string) => '<tr><td style="' + td + ';' + MUTED + ';white-space:nowrap;padding-inline-end:14px">' + k + '</td><td style="' + td + '">' + v + '</td></tr>';
  const rows = [
    row('الاسم', esc(r.name)), row('النشاط', esc(r.business)), row('المتجر', link(r.store_url)), row('البلد', esc(r.country)),
    row('المنصات', esc(r.platforms.map((p) => NAMES[p] || p).join('، '))),
    r.fb_profile ? row('فيسبوك', link(r.fb_profile)) : '',
    r.google_email ? row('بريد Google Ads', esc(r.google_email)) : '',
    row('البريد', esc(r.email)),
    r.whatsapp ? row('واتساب', '<span dir="ltr">' + link('https://wa.me/' + r.whatsapp.replace(/\D/g, ''), r.whatsapp) + '</span>') : '',
    row('لغة الرسائل', r.lang === 'en' ? 'الإنجليزية' : 'العربية'),
    r.submissions > 1 ? row('عدد مرات الإرسال', String(r.submissions)) : '',
    r.activated_at ? row('الحالة', 'أُرسلت إليه رسالة التفعيل من قبل (' + esc(r.activated_at.slice(0, 10)) + ')') : ''
  ].join('');
  const steps: string[] = [];
  if (has('meta')) steps.push('<strong>Meta:</strong> افتح ' + link('https://developers.facebook.com/apps/' + META_APP_ID + '/roles/roles/', 'أدوار التطبيق') +
    ' ← Add People ← Tester، والصق رابط حسابه على فيسبوك من الجدول أعلاه.');
  if (has('google')) steps.push('<strong>Google:</strong> افتح ' + link('https://console.cloud.google.com/auth/audience', 'Google Auth Platform ← Audience') +
    ' ← Test users ← Add users، وأضف: ' + esc(r.google_email || r.email));
  steps.push('بعد الإضافة اضغط الزر أدناه لإرسال رسالة التفعيل إليه. لن يصله أي شيء قبل ذلك.');
  const url = SITE + '/invited?r=' + r.id + '&s=' + (await sigOf(r.id));
  const lines = [
    '<div style="margin:0 0 18px"><table role="presentation" style="border-collapse:collapse;width:100%">' + rows + '</table></div>',
    '<strong>خطوات التفعيل:</strong>',
    '<div><ol style="margin:0 0 16px;padding-inline-start:22px;line-height:1.9">' + steps.map((s) => '<li>' + s + '</li>').join('') + '</ol></div>',
    '<div style="margin:0 0 16px"><a href="' + esc(url) + '" style="' + BTN + '">أرسلت الدعوة — أرسل رسالة التفعيل</a></div>',
    '<span style="' + MUTED + '">للرد على العميل مباشرة، رُدّ على هذه الرسالة.</span>'
  ];
  return { subject, html: mailHtml(esc(subject), lines, 'ar'), text: text(subject, lines) + '\n\n' + url };
}

// رسالة التفعيل للعميل (فصحى، بلغته): خطوات كل منصة طلبها. أهمها قبول دعوة فيسبوك — من الموبايل من جوه
// التطبيق (الرابط هناك مبيوصلش لصفحة الدعوات)، ومن الكمبيوتر بالرابط
function activationMail(r: Req) {
  const en = r.lang === 'en', has = (p: string) => r.platforms.indexOf(p) > -1;
  const app = link(SITE + '/app', 'adscenter.online/app');
  const subject = en ? 'Your Ads Center pilot access is ready — one last step' : 'تم تفعيل حسابك في تجربة Ads Center — بقيت خطوة أخيرة';
  const h = (s: string) => '<div style="margin:22px 0 8px;font-weight:700;font-size:16px">' + s + '</div>';
  const box = (s: string) => '<div style="' + BOX + '">' + s + '</div>';
  const lines: string[] = [
    en ? 'Hello ' + esc(r.name) + ',' : 'مرحباً ' + esc(r.name) + '،',
    en ? 'We\'ve activated your access to the Ads Center pilot for <strong>' + esc(r.business) + '</strong>. Here\'s how to connect your ad accounts:'
      : 'فعّلنا وصولك إلى تجربة Ads Center لنشاط <strong>' + esc(r.business) + '</strong>. إليك خطوات ربط حساباتك الإعلانية:'
  ];
  if (has('meta')) {
    lines.push(h(en ? 'Meta (Facebook &amp; Instagram)' : 'Meta (فيسبوك وإنستغرام)'));
    lines.push(en ? 'We\'ve added your Facebook account as a "Tester" of the Ads Center app. Facebook doesn\'t send a notification for this — the invitation waits for you in your settings, so accept it first:'
      : 'أضفنا حسابك على فيسبوك بصفة «مختبِر» (Tester) لتطبيق Ads Center. لن يصلك إشعار من فيسبوك بذلك، فالدعوة تنتظرك في الإعدادات، لذا اقبلها أولاً:');
    lines.push(box(en
      ? '<strong>On your phone (Facebook app):</strong> menu ☰ → Settings &amp; privacy → Settings → type "Apps" in the search box → Apps and websites → Requests → <strong>Accept</strong>.'
      : '<strong>من الهاتف (تطبيق فيسبوك):</strong> القائمة ☰ ← «الإعدادات والخصوصية» (Settings &amp; privacy) ← «الإعدادات» (Settings) ← اكتب في خانة البحث «التطبيقات» (Apps) ← «التطبيقات ومواقع الويب» (Apps and websites) ← قسم «الطلبات» (Requests) ← <strong>«قبول» (Accept)</strong>.'));
    lines.push(box(en
      ? '<strong>On a computer:</strong> open ' + link(FB_REQUESTS, 'facebook.com/settings/?tab=applications') + ' — the invitation is under "Requests" — then press <strong>Accept</strong>.'
      : '<strong>من الكمبيوتر:</strong> افتح ' + link(FB_REQUESTS, 'facebook.com/settings/?tab=applications') + '، وستجد الدعوة في قسم «الطلبات» (Requests)، ثم اضغط <strong>«قبول» (Accept)</strong>.'));
    lines.push('<div style="margin:0 0 12px"><table role="presentation" dir="ltr" style="border:1px dashed #c9cdd3;border-radius:8px;border-collapse:separate;width:100%;max-width:440px"><tr>' +
      '<td style="padding:10px 12px;font-family:Arial,sans-serif;font-size:14px;color:#1c1e21"><strong>Ads Center</strong><br><span style="color:#65676b;font-size:12px">Requests</span></td>' +
      '<td style="padding:10px 12px;text-align:right;white-space:nowrap;font-family:Arial,sans-serif;font-size:13px"><span style="display:inline-block;background:#e7f3ff;color:#1b6ac9;font-weight:700;padding:6px 14px;border-radius:6px">Accept</span> ' +
      '<span style="display:inline-block;background:#eceef1;color:#1c1e21;font-weight:700;padding:6px 14px;border-radius:6px">Decline</span></td></tr></table>' +
      '<div style="' + MUTED + ';margin-top:4px">' + (en ? 'Illustration: this is how the invitation looks.' : 'صورة توضيحية لشكل الدعوة.') + '</div></div>');
    lines.push('<span style="' + MUTED + '">' + (en
      ? 'When you accept, Facebook shows a sentence saying you work for the app owner or have an agreement with them to test it: that\'s the pilot agreement you accepted when you signed up (the ' + link(SITE + '/terms#pilot-en', '"Pilot program"') + ' section). Accepting gives the tool no access to your account; access is requested later when you connect, and it\'s read-only.'
      : 'عند القبول يعرض فيسبوك جملة تفيد بأنك تعمل لدى صاحب التطبيق أو بينكما اتفاق لاختباره، وهذا هو اتفاق التجربة الذي وافقت عليه عند التسجيل (بند ' + link(SITE + '/terms#pilot', '«برنامج التجربة»') + '). والقبول لا يمنح الأداة أي صلاحية على حسابك؛ فالصلاحية تُطلب منك لاحقاً عند الربط، وهي للقراءة فقط.') + '</span>');
    lines.push(en ? 'Then open ' + app + ' → "Connect your ad account" → <strong>Meta</strong>, and log in with <strong>the same Facebook account</strong> you sent us.'
      : 'بعد القبول: افتح ' + app + ' ← «اربط حسابك الإعلاني» ← <strong>Meta</strong>، وسجّل الدخول <strong>بحساب فيسبوك نفسه</strong> الذي أرسلته إلينا.');
  }
  if (has('google')) {
    lines.push(h('Google Ads'));
    lines.push(en
      ? 'We\'ve activated <strong>' + esc(r.google_email || r.email) + '</strong>. Open ' + app + ' → "Connect your ad account" → <strong>Google Ads</strong> and choose that same email. You\'ll see "Google hasn\'t verified this app" — that\'s expected during the pilot: press "Continue", or "Advanced" then "Go to …" if there\'s no such button.'
      : 'فعّلنا البريد <strong>' + esc(r.google_email || r.email) + '</strong>. افتح ' + app + ' ← «اربط حسابك الإعلاني» ← <strong>Google Ads</strong>، واختر هذا البريد نفسه. ستظهر رسالة «Google hasn\'t verified this app»، وهي طبيعية خلال التجربة: اضغط «Continue» (متابعة)، وإن لم يظهر فاضغط «Advanced» ثم «Go to …».');
  }
  if (has('snapchat')) {
    lines.push(h('Snapchat'));
    lines.push(en ? 'Open ' + app + ' → "Connect your ad account" → <strong>Snapchat</strong>, and log in with your Snapchat account.'
      : 'افتح ' + app + ' ← «اربط حسابك الإعلاني» ← <strong>Snapchat</strong>، وسجّل الدخول بحسابك على Snapchat.');
  }
  if (has('tiktok')) {
    lines.push(h('TikTok'));
    lines.push(en ? 'TikTok isn\'t available yet. We\'ll let you know as soon as it is.' : 'ربط TikTok غير متاح بعد، وسنبلغك فور إتاحته.');
  }
  lines.push('<div style="margin:22px 0 14px;line-height:1.8">' + (en
    ? 'Every step is explained in the ' + link(SITE + '/help', 'getting-started guide') + '. We will never ask you for a password or a verification code, by email or by phone.'
    : 'الخطوات مشروحة بالتفصيل في ' + link(SITE + '/help', 'دليل البدء') + '. ولن نطلب منك أبداً كلمة مرور أو رمز تحقق، لا بالبريد ولا بالهاتف.') + '</div>');
  lines.push(en ? 'If you get stuck at any step, just reply to this email and we\'ll help.' : 'إن توقفت عند أي خطوة، فرُدّ على هذه الرسالة وسنساعدك.');
  return { subject, html: mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text: text(subject, lines) };
}

// ---------- العمليات ----------
export async function handleJoin(action: string, body: any, origin: string | null): Promise<Response> {
  if (action === 'join') return await submit(body, origin);

  const id = typeof body.id === 'string' && ID.test(body.id) ? body.id : null;
  if (!id || typeof body.sig !== 'string' || body.sig.length > 100 || !sameString(body.sig, await sigOf(id))) return reply(403, { error: 'link' }, origin);
  const r = await one('id=eq.' + id);
  if (!r) return reply(404, { error: 'gone' }, origin);
  if (action === 'join.peek') return reply(200, { request: publicView(r) }, origin);
  if (action === 'join.activate') {
    const mail = activationMail(r);
    try { await sendEmail(r.email, mail.subject, mail.html, mail.text); } catch (e) {
      console.error('join activation mail failed', String((e as Error).message || e).slice(0, 160));
      return reply(502, { error: 'mail' }, origin);
    }
    const now = new Date().toISOString();
    await db('pilot_requests?id=eq.' + id, { method: 'PATCH', headers: { 'prefer': 'return=minimal' },
      body: JSON.stringify({ status: 'activated', activated_at: now, updated_at: now }) });
    return reply(200, { ok: true, request: publicView({ ...r, status: 'activated', activated_at: now }) }, origin);
  }
  return reply(400, { error: 'action' }, origin);
}

async function submit(b: any, origin: string | null): Promise<Response> {
  const bad = (field: string) => reply(400, { error: 'field', field }, origin);
  // الحقل المخفي اتملا، أو النموذج اتملا في أقل من ثانيتين ونص: برنامج — بنرد عادي من غير ما نحفظ حاجة
  if ((typeof b.hp === 'string' && b.hp) || !(Number(b.ms) >= MIN_FILL_MS)) return reply(200, { ok: true }, origin);
  const lang = b.lang === 'en' ? 'en' : 'ar';
  const name = line(b.name, 100); if (!name) return bad('name');
  const business = line(b.business, 120); if (!business) return bad('business');
  const store = cleanStore(b.store); if (!store) return bad('store');
  const country = line(b.country, 60, 2); if (!country) return bad('country');
  const platforms = Array.isArray(b.platforms) ? PLATFORMS.filter((p) => b.platforms.indexOf(p) > -1) : [];
  if (!platforms.length) return bad('platforms');
  let fb: string | null = null;
  if (platforms.indexOf('meta') > -1) { fb = cleanFb(b.fb); if (!fb) return bad('fb'); }
  const email = cleanEmail(b.email); if (!email) return bad('email');
  let google: string | null = null;
  if (platforms.indexOf('google') > -1) { google = b.googleEmail ? cleanEmail(b.googleEmail) : email; if (!google) return bad('googleEmail'); }
  let whatsapp: string | null = null;
  if (b.whatsapp) { whatsapp = cleanPhone(b.whatsapp); if (!whatsapp) return bad('whatsapp'); }
  if (b.consent !== true) return bad('consent');

  const since = new Date(Date.now() - 3600000).toISOString();
  const recent = await (await db('pilot_requests?select=id&updated_at=gte.' + encodeURIComponent(since) + '&limit=' + (HOURLY_MAX + 1), { method: 'GET' })).json();
  if (Array.isArray(recent) && recent.length > HOURLY_MAX) return reply(429, { error: 'busy' }, origin);

  const now = new Date().toISOString();
  const fields = { name, business, store_url: store, country, platforms, fb_profile: fb, google_email: google, whatsapp, lang,
    consent_at: now, consent_version: CONSENT_VERSION, updated_at: now };
  const prev = await one('email=eq.' + encodeURIComponent(email));
  let row: Req;
  if (prev) {
    await db('pilot_requests?id=eq.' + prev.id, { method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify({ ...fields, submissions: prev.submissions + 1 }) });
    row = { ...prev, ...fields, submissions: prev.submissions + 1 };
  } else {
    const r = await db('pilot_requests', { method: 'POST', headers: { 'prefer': 'return=representation' }, body: JSON.stringify({ email, ...fields }) });
    row = (await r.json())[0];
  }
  // الطلب اتحفظ: لو الإشعار فشل منقولش للعميل إن طلبه فشل (هنلاقيه في الجدول — supabase/README.md)، بنسجّل السبب بس
  if (!prev || Date.now() - Date.parse(prev.updated_at) >= REPEAT_QUIET_MS) {
    try {
      const mail = await adminMail(row, !!prev);
      await sendEmail(MAIL_REPLY_TO, mail.subject, mail.html, mail.text, email);
    } catch (e) {
      console.error('join notify failed', String((e as Error).message || e).slice(0, 160));
    }
  }
  return reply(200, { ok: true }, origin);
}
