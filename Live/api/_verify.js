// التحقق إن التوكن اللي جايلنا اتصدر لتطبيقنا إحنا — الاسم بيبدأ بـ "_" عشان Vercel ميحوّلوش لـ endpoint
//
// المشكلة: ملفات /api بتستخدم GOOGLE_ADS_DEVELOPER_TOKEN بتاعنا مع أي accessToken بيتبعتلها.
// من غير التحقق ده، أي حد يقدر يبعت توكن Google بتاعه هو ويستهلك حصة التوكن بتاعنا (ومخالفة لشروط Google).
// الحل: نسأل Google التوكن ده اتصدر لمين — لازم يكون نفس GOOGLE_CLIENT_ID بتاع التطبيق.
//
// محتاج متغيّر بيئة في Vercel:
//   GOOGLE_CLIENT_ID = نفس الـ Client ID الموجود في الواجهة
// لو المتغيّر مش مضبوط، بنكمّل من غير تحقق (عشان منوقفش الأداة فجأة) — ضبطه مهم.

const cache = new Map(); // توكن → { until, ok } — نفس التوكن بيتستخدم في أكتر من طلب في نفس الدقيقة
const CACHE_MS = 5 * 60 * 1000;
const MAX_CACHE = 500;

export async function verifyGoogleToken(accessToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return { ok: true, skipped: true };
  if (!accessToken) return { ok: false, error: 'accessToken ناقص.' };

  const hit = cache.get(accessToken);
  if (hit && hit.until > Date.now()) return hit.result;

  let result;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken));
    const info = await r.json().catch(function () { return null; });
    if (!r.ok || !info) {
      // auth = الجلسة انتهت (مش خطأ) — الملفات بترجّعها 401 والواجهة بتعرض «ربط تاني»
      result = { ok: false, auth: true, error: 'توكن Google غير صالح أو منتهي — سجّل الدخول تاني.' };
    } else if (info.azp !== clientId && info.aud !== clientId) {
      result = { ok: false, error: 'التوكن ده مش صادر لتطبيق Ads Control Center.' };
    } else if (!String(info.scope || '').includes('adwords')) {
      result = { ok: false, error: 'التوكن ده مالوش صلاحية Google Ads.' };
    } else {
      result = { ok: true };
    }
  } catch (err) {
    // فشل شبكة مؤقت — منقفلش الباب في وش المستخدم الحقيقي
    return { ok: true, skipped: true };
  }

  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(accessToken, { until: Date.now() + CACHE_MS, result: result });
  return result;
}
