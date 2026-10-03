// المسار: https://adscenter.online/api/snapchat-token (بيشتغل جوه cloudflare/worker.js)
//   { code, redirectUri } ← أول دخول: كود Snapchat → جلسة (access_token) + نسخة مقفولة من مفتاح التجديد (sealed)
//   { sealed }            ← الجلسة خلصت (بعد نص ساعة) أو الأداة اتفتحت من جديد: تجديد من غير تسجيل دخول
//
// محتاج سرّين في إعدادات الـ Worker على Cloudflare (Settings → Variables and Secrets، نوع Secret):
//   SNAPCHAT_CLIENT_ID     = الـ Client ID بتاعك من Snapchat Business Manager
//   SNAPCHAT_CLIENT_SECRET = الـ Client Secret بتاعك (سري، أبداً متحطوش في أي ملف بيتنشر)
// مفتاح التجديد نفسه مبيتحفظش عندنا — بيتقفل ويتحفظ على جهاز العميل (_seal.js)

import { guardRequest } from './_cors.js';
import { text, badRequest } from './_input.js';
import { sealToken, unsealToken, sealedExpired, SEALED_MAX } from './_seal.js';

const TOKEN_URL = 'https://accounts.snapchat.com/login/oauth2/access_token';

// رابط الرجوع الوحيد المسموح: /app على نفس الدومين (نفس اللي مسجّل في Snapchat).
// قبل كده السيرفر كان بيقبل أي redirectUri من المتصفح ويبعته مع السر بتاعنا
function expectedRedirect(req) {
  const host = String(req.headers.host || '');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return (local ? 'http://' : 'https://') + host + '/app';
}

async function tokenRequest(params) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  // رد مش JSON (صفحة خطأ مثلاً) بيتعامل كفشل عادي — مش استثناء برسالة تقنية
  const data = await response.json().catch(function () { return null; });
  return { response: response, data: data };
}

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'المتغيران SNAPCHAT_CLIENT_ID وSNAPCHAT_CLIENT_SECRET غير مضبوطين في إعدادات الخادم.', code: 'CONFIG' });
    return;
  }

  const body = req.body || {};
  try {
    // ---- تجديد بالنسخة المقفولة ----
    if (body.sealed !== undefined) {
      const sealed = text(body.sealed, SEALED_MAX);
      if (!sealed) { badRequest(res, 'الحقل sealed غير صالح.'); return; }
      const refreshToken = await unsealToken('snapchat', clientSecret, sealed);
      if (!refreshToken) { sealedExpired(res); return; }
      const r = await tokenRequest({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });
      if (!r.response.ok || !r.data || !r.data.access_token) {
        // Snapchat رفضت مفتاح التجديد (اتلغى أو انتهى) = ربط من جديد. أي حاجة تانية عطل مؤقت — النسخة تفضل
        if (r.response.status === 400 || r.response.status === 401) { sealedExpired(res); return; }
        res.status(502).json({ error: (r.data && (r.data.error_description || r.data.error)) || ('HTTP ' + r.response.status) });
        return;
      }
      // Snapchat ممكن ترجّع مفتاح تجديد جديد — بنقفل الجديد، وإلا القديم بتاريخ جديد (الـ ٦٠ يوم بتبدأ من النهارده)
      res.status(200).json({
        access_token: r.data.access_token, expires_in: r.data.expires_in, token_type: r.data.token_type,
        sealed: await sealToken('snapchat', clientSecret, r.data.refresh_token || refreshToken)
      });
      return;
    }

    // ---- أول دخول: كود → جلسة ----
    const code = text(body.code, 2048), redirectUri = text(body.redirectUri, 512);
    if (!code || !redirectUri) { badRequest(res, 'الحقلان code وredirectUri مطلوبان في جسم الطلب.'); return; }
    if (redirectUri !== expectedRedirect(req)) { badRequest(res, 'رابط الرجوع غير مطابق للرابط المسجّل.'); return; }
    const r = await tokenRequest({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code: code, redirect_uri: redirectUri });
    if (!r.response.ok || !r.data || !r.data.access_token) {
      res.status(r.response.ok ? 502 : r.response.status).json({
        error: (r.data && (r.data.error_description || r.data.error)) || ('HTTP ' + r.response.status)
      });
      return;
    }
    const out = { access_token: r.data.access_token, expires_in: r.data.expires_in, token_type: r.data.token_type };
    // مفتاح التجديد نفسه عمره ما بيطلع للمتصفح — النسخة المقفولة بس
    if (r.data.refresh_token) out.sealed = await sealToken('snapchat', clientSecret, r.data.refresh_token);
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
