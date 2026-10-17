// التحقق إن التوكن اللي جايلنا اتصدر لتطبيقنا إحنا — الاسم بيبدأ بـ "_" فمش endpoint
//
// المشكلة: ملفات /api بتستخدم إعدادات Google بتاعتنا مع أي accessToken بيتبعتلها.
// من غير التحقق ده، أي حد يقدر يبعت توكن Google بتاعه هو ويستهلك حصة تطبيقنا (ومخالفة لشروط Google).
// الحل: نسأل Google التوكن ده اتصدر لمين — لازم يكون نفس GOOGLE_CLIENT_ID بتاع التطبيق.
//
// محتاج GOOGLE_CLIENT_ID في أسرار الـ Worker على Cloudflare (نفس الـ Client ID اللي في js/google.js).
// لو مش مضبوط الطلب بيترفض بـ CONFIG — قبل كده كان بيعدّي من غير تحقق، يعني أي إعداد ناقص
// كان بيفتح الباب لأي توكن من غير ما حد ياخد باله

const cache = new Map(); // توكن → { until, result } — نفس التوكن بيتستخدم في أكتر من طلب في نفس الدقيقة
const CACHE_MS = 5 * 60 * 1000;
const MAX_CACHE = 500;

export async function verifyGoogleToken(accessToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return { ok: false, code: 'CONFIG', error: 'المتغير GOOGLE_CLIENT_ID غير مضبوط في إعدادات الخادم.' };
  if (!accessToken) return { ok: false, error: 'accessToken غير موجود.' };

  const hit = cache.get(accessToken);
  if (hit && hit.until > Date.now()) return hit.result;

  let result;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken));
    const info = await r.json().catch(function () { return null; });
    if (!r.ok || !info) {
      // auth = الجلسة انتهت (مش خطأ) — الملفات بترجّعها 401 والواجهة بتعرض «ربط تاني»
      result = { ok: false, auth: true, error: 'رمز دخول Google غير صالح أو منتهي — سجّل الدخول مرة أخرى.' };
    } else if (info.azp !== clientId && info.aud !== clientId) {
      result = { ok: false, code: 'WRONG_APP', error: 'رمز الدخول هذا غير صادر لتطبيق Ads Center.' };
    } else if (!String(info.scope || '').includes('adwords')) {
      result = { ok: false, code: 'NO_SCOPE', error: 'رمز الدخول هذا لا يملك صلاحية Google Ads.' };
    } else {
      result = { ok: true };
    }
  } catch (err) {
    // فشل شبكة مؤقت بين Cloudflare وGoogle: الطلب بيترفض («حاول تاني») ومنحفظش النتيجة، فالطلب الجاي يتحقق من الأول.
    // قبل كده كان بيعدّي من غير تحقق (المرحلة ٣، أ٤ — OWASP ASVS: الفشل الآمن). وGoogle Ads نفسها غالباً مش هترد ساعتها
    return { ok: false, code: 'NETWORK', error: 'تعذّر التحقق من رمز Google الآن — حاول مرة أخرى بعد قليل.' };
  }

  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(accessToken, { until: Date.now() + CACHE_MS, result: result });
  return result;
}

// رد الرفض بالحالة الصح: توكن منتهي = 401 (الواجهة بتعرض «ربط تاني»)، إعداد ناقص عندنا = 500،
// توكن مش لتطبيقنا أو من غير صلاحية = 403، وتعذّر سؤال Google = 502 (الواجهة بتعرض رسالة الشبكة)
export function sendVerifyFailure(res, verified) {
  const status = verified.auth ? 401 : (verified.code === 'CONFIG' ? 500 : (verified.code === 'NETWORK' ? 502 : 403));
  res.status(status).json({ error: verified.error, code: verified.auth ? 'AUTH' : (verified.code || 'FORBIDDEN') });
}
