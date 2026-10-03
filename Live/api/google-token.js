// المسار: https://adscenter.online/api/google-token (بيشتغل جوه cloudflare/worker.js)
//   { probe: true }          ← الأداة بتسأل وقت الفتح: الدخول بمفتاح تجديد متاح؟ (لو مش متاح بتكمل بالنافذة القديمة
//                              اللي جلستها ساعة — عشان Google ميقفش لو السر لسه مش متضاف)
//   { code, redirectUri }    ← أول دخول (إعادة توجيه لـ Google بـ access_type=offline): جلسة + نسخة مقفولة من مفتاح التجديد
//   { sealed }               ← الجلسة خلصت (بعد ساعة) أو الأداة اتفتحت من جديد: تجديد من غير تسجيل دخول
//   { sealed, revoke: true } ← «فصل»: بنلغي الصلاحية عند Google نفسها، مش بس من الجهاز
//
// محتاج في أسرار الـ Worker على Cloudflare: GOOGLE_CLIENT_ID (موجود) وGOOGLE_CLIENT_SECRET (سر عميل OAuth من
// Google Cloud Console). ورابط الرجوع https://adscenter.online/app لازم يكون مضاف في «Authorized redirect URIs»
// لنفس العميل قبل ما السر يتضاف — لأن وجود السر هو اللي بيشغّل الطريقة الجديدة.
// ملاحظة: التطبيق وهو في وضع «Testing» عند Google، مفتاح التجديد بيعيش ٧ أيام بس (قاعدة Google) — بعدها دخول من جديد

import { guardRequest } from './_cors.js';
import { text, badRequest } from './_input.js';
import { sealToken, unsealToken, sealedExpired, SEALED_MAX } from './_seal.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

function expectedRedirect(req) {
  const host = String(req.headers.host || '');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return (local ? 'http://' : 'https://') + host + '/app';
}

async function formPost(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const data = await response.json().catch(function () { return null; });
  return { response: response, data: data };
}

function hasAdsScope(data) { return String((data && data.scope) || '').indexOf('adwords') > -1; }

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const body = req.body || {};
  if (body.probe === true) { res.status(200).json({ codeFlow: !!(clientId && clientSecret) }); return; }
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'المتغيران GOOGLE_CLIENT_ID وGOOGLE_CLIENT_SECRET غير مضبوطين في إعدادات الخادم.', code: 'CONFIG' });
    return;
  }

  try {
    if (body.sealed !== undefined) {
      const sealed = text(body.sealed, SEALED_MAX);
      if (!sealed) { badRequest(res, 'الحقل sealed غير صالح.'); return; }
      const refreshToken = await unsealToken('google', clientSecret, sealed);

      // ---- «فصل»: إلغاء الصلاحية عند Google (أحسن جهد — الجهاز بيمسح نسخته في كل الأحوال) ----
      if (body.revoke === true) {
        if (refreshToken) await formPost(REVOKE_URL, { token: refreshToken }).catch(function () { return null; });
        res.status(200).json({ ok: true });
        return;
      }

      // ---- تجديد ----
      if (!refreshToken) { sealedExpired(res); return; }
      const r = await formPost(TOKEN_URL, { grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });
      if (!r.response.ok || !r.data || !r.data.access_token) {
        // invalid_grant = الصلاحية اتلغت أو انتهت (منها قاعدة الـ ٧ أيام في وضع Testing) — ربط من جديد
        if (r.response.status === 400 || r.response.status === 401) { sealedExpired(res); return; }
        res.status(502).json({ error: (r.data && (r.data.error_description || r.data.error)) || ('HTTP ' + r.response.status) });
        return;
      }
      res.status(200).json({
        access_token: r.data.access_token, expires_in: r.data.expires_in, token_type: r.data.token_type,
        sealed: await sealToken('google', clientSecret, r.data.refresh_token || refreshToken)
      });
      return;
    }

    // ---- أول دخول: كود → جلسة ----
    const code = text(body.code, 2048), redirectUri = text(body.redirectUri, 512);
    if (!code || !redirectUri) { badRequest(res, 'الحقلان code وredirectUri مطلوبان في جسم الطلب.'); return; }
    if (redirectUri !== expectedRedirect(req)) { badRequest(res, 'رابط الرجوع غير مطابق للرابط المسجّل.'); return; }
    const r = await formPost(TOKEN_URL, { grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code: code, redirect_uri: redirectUri });
    if (!r.response.ok || !r.data || !r.data.access_token) {
      res.status(r.response.ok ? 502 : r.response.status).json({
        error: (r.data && (r.data.error_description || r.data.error)) || ('HTTP ' + r.response.status)
      });
      return;
    }
    // العميل شال العلامة من على صلاحية Google Ads في شاشة الموافقة — نفس رسالة الطريقة القديمة
    if (!hasAdsScope(r.data)) { res.status(403).json({ error: 'رمز الدخول هذا لا يملك صلاحية Google Ads.', code: 'NO_SCOPE' }); return; }
    const out = { access_token: r.data.access_token, expires_in: r.data.expires_in, token_type: r.data.token_type };
    if (r.data.refresh_token) out.sealed = await sealToken('google', clientSecret, r.data.refresh_token);
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
