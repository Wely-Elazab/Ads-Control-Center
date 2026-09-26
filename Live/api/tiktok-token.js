// المسار: https://adscenter.online/api/tiktok-token (بيشتغل جوه cloudflare/worker.js)
//
// محتاج سرّين في إعدادات الـ Worker على Cloudflare (نوع Secret) — بيتضافوا بعد موافقة TikTok:
//   TIKTOK_APP_ID     = App ID بتاعك من TikTok for Business
//   TIKTOK_APP_SECRET = Secret بتاعك (سري، أبداً متحطوش في أي ملف بيتنشر)

import { guardRequest } from './_cors.js';
import { text, badRequest } from './_input.js';

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const appId = process.env.TIKTOK_APP_ID;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appId || !appSecret) {
    res.status(500).json({ error: 'المتغيران TIKTOK_APP_ID وTIKTOK_APP_SECRET غير مضبوطين في إعدادات الخادم.', code: 'CONFIG' });
    return;
  }

  const authCode = text((req.body || {}).authCode, 2048);
  if (!authCode) { badRequest(res, 'الحقل authCode مطلوب في جسم الطلب.'); return; }

  try {
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, secret: appSecret, auth_code: authCode })
    });
    // رد مش JSON بيتعامل كفشل عادي — مش استثناء برسالة تقنية
    const data = await response.json().catch(function () { return null; });
    // الرد بيرجّع access_token وقائمة advertiser_ids مباشرة، من غير نداء منفصل زي Google.
    // بنرجّع المطلوب بس للمتصفح من غير أي حقول إضافية
    const payload = data && data.data;
    if (!response.ok || !payload || !payload.access_token) {
      res.status(response.ok ? 502 : response.status).json({ error: (data && data.message) || ('HTTP ' + response.status) });
      return;
    }
    res.status(200).json({ data: { access_token: payload.access_token, advertiser_ids: payload.advertiser_ids || [], scope: payload.scope } });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
