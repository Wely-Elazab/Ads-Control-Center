// رمز التجديد المختوم — الاسم بيبدأ بـ "_" فمش endpoint
//
// Google وSnapchat بيدّونا مع الدخول «مفتاح تجديد» (refresh token) بيطلّع جلسات جديدة من غير ما العميل يسجّل تاني.
// مبنحفظوش عندنا (وعد سياسة الخصوصية: مفيش مفاتيح على خوادمنا): بنقفله AES-256-GCM بمفتاح مشتق من سر
// التطبيق نفسه (SNAPCHAT_CLIENT_SECRET / GOOGLE_CLIENT_SECRET)، ونرجّع النسخة المقفولة للمتصفح يحتفظ بيها
// على الجهاز. لما الجلسة تخلص المتصفح يبعتها، فنفتحها ونجدد الدخول.
//   - اللي ياخد النسخة المقفولة من الجهاز ميقدرش يفتحها من غير خادمنا، ومفيش عندنا أي نسخة منها
//   - اسم المنصة داخل في التشفير (additionalData): نسخة Snapchat متتفتحش كأنها Google
//   - صلاحيتها ٦٠ يوم من آخر استخدام: كل تجديد بيرجّع نسخة جديدة بتاريخ جديد، والجهاز اللي مبيستخدمش
//     الأداة شهرين بيسجّل دخول من الأول
//   - تغيير سر التطبيق عند المنصة = كل النسخ القديمة بتبطل (العملاء بيسجّلوا دخول مرة واحدة)

const enc = new TextEncoder();
export const SEAL_MAX_IDLE_MS = 60 * 86400000;
export const SEALED_MAX = 4096;
const SEALED_SHAPE = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,4000}$/;

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

export async function sealToken(platform, secret, refreshToken, now) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc.encode(JSON.stringify({ rt: refreshToken, at: now || Date.now() }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(platform) }, await sealKey(platform, secret), plain);
  return 'v1.' + b64u(iv) + '.' + b64u(new Uint8Array(ct));
}

// بترجّع مفتاح التجديد، أو null لو النسخة بشكل غلط أو اتعدّلت أو لمنصة تانية أو عدّى عليها ٦٠ يوم
export async function unsealToken(platform, secret, sealed, now) {
  if (typeof sealed !== 'string' || sealed.length > SEALED_MAX || !SEALED_SHAPE.test(sealed)) return null;
  const parts = sealed.split('.');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(parts[1]), additionalData: enc.encode(platform) },
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
