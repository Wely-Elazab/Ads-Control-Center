// رمز التجديد المختوم — الاسم بيبدأ بـ "_" فمش endpoint
//
// Google وSnapchat بيدّونا مع الدخول «مفتاح تجديد» (refresh token) بيطلّع جلسات جديدة من غير ما العميل يسجّل تاني.
// مبنحفظوش عندنا (وعد سياسة الخصوصية: مفيش مفاتيح على خوادمنا): بنقفله AES-256-GCM بمفتاح مشتق من سر
// التطبيق نفسه (SNAPCHAT_CLIENT_SECRET / GOOGLE_CLIENT_SECRET)، ونرجّع النسخة المقفولة للمتصفح يحتفظ بيها
// على الجهاز. لما الجلسة تخلص المتصفح يبعتها، فنفتحها ونجدد الدخول.
//   - اللي ياخد النسخة المقفولة من الجهاز ميقدرش يفتحها من غير خادمنا، ومفيش عندنا أي نسخة منها
//   - اسم المنصة داخل في التشفير (additionalData): نسخة Snapchat متتفتحش كأنها Google
//   - v2 (المرحلة ٣، أ١ — ١٧ أكتوبر ٢٠٢٦): رقم صاحب الدخول للأداة داخل التشفير كمان، زي ربط Meta المحفوظ
//     (supabase/functions/sync/metalink.ts). قبل كده (v1) اللي معاه نسخة حد تاني ودخول للأداة كان يقدر يجددها.
//     v1 بتتفتح لحد أول تجديد (اللي بيرجّع v2) أو ٦٠ يوم من غير استخدام — مبتمدّش نفسها
//     (OWASP ASVS 5.0 — الرموز المرتبطة بصاحبها؛ RFC 9700 §4.14 حماية مفتاح التجديد)
//   - صلاحيتها ٦٠ يوم من آخر استخدام: كل تجديد بيرجّع نسخة جديدة بتاريخ جديد، والجهاز اللي مبيستخدمش
//     الأداة شهرين بيسجّل دخول من الأول
//   - تغيير سر التطبيق عند المنصة = كل النسخ القديمة بتبطل (العملاء بيسجّلوا دخول مرة واحدة)

const enc = new TextEncoder();
export const SEAL_MAX_IDLE_MS = 60 * 86400000;
export const SEALED_MAX = 4096;
const SEALED_SHAPE = /^v[12]\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,4000}$/;
// المنصة (v1)، أو المنصة + رقم صاحب الدخول (v2)
function boundTo(platform, userId) { return enc.encode(userId ? platform + ':' + userId : platform); }

function b64u(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// مفتاح لكل منصة، محفوظ في الذاكرة طول ما السر هو هو
const keys = {};
async function sealKey(platform, secret) {
  const k = keys[platform];
  if (k && k.secret === secret) return k.key;
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('ads-center/seal/' + platform + '/v1:' + secret));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  keys[platform] = { secret: secret, key: key };
  return key;
}

// userId = صاحب الدخول للأداة (req.user.id). النسخ الجديدة كلها v2 — من غيره منقفلش حاجة
export async function sealToken(platform, secret, refreshToken, now, userId) {
  if (typeof userId !== 'string' || !userId) throw new Error('seal: sign-in user required');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc.encode(JSON.stringify({ rt: refreshToken, at: now || Date.now() }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: boundTo(platform, userId) }, await sealKey(platform, secret), plain);
  return 'v2.' + b64u(iv) + '.' + b64u(new Uint8Array(ct));
}

// بترجّع مفتاح التجديد، أو null لو النسخة بشكل غلط أو اتعدّلت أو لمنصة تانية أو لصاحب دخول تاني أو عدّى عليها ٦٠ يوم
export async function unsealToken(platform, secret, sealed, now, userId) {
  if (typeof sealed !== 'string' || sealed.length > SEALED_MAX || !SEALED_SHAPE.test(sealed)) return null;
  const parts = sealed.split('.');
  if (parts[0] === 'v2' && (typeof userId !== 'string' || !userId)) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(parts[1]), additionalData: boundTo(platform, parts[0] === 'v2' ? userId : null) },
      await sealKey(platform, secret), unb64u(parts[2]));
    const data = JSON.parse(new TextDecoder().decode(pt));
    if (!data || typeof data.rt !== 'string' || !data.rt || typeof data.at !== 'number') return null;
    if ((now || Date.now()) - data.at > SEAL_MAX_IDLE_MS) return null;
    return data.rt;
  } catch (e) {
    return null;
  }
}

// رد موحّد لما النسخة المحفوظة مبقتش تنفع: 401 + AUTH — المتصفح بيمسحها ويعرض «ربط تاني»
export function sealedExpired(res) {
  res.status(401).json({ error: 'انتهت صلاحية الربط المحفوظ على هذا الجهاز — سجّل الدخول مرة أخرى.', code: 'AUTH' });
}
