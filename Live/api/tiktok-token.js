// ضعه في نفس مجلد /api
// المسار النهائي: https://<مشروعك>.vercel.app/api/tiktok-token
//
// محتاج متغيّرين بيئة في Vercel:
//   TIKTOK_APP_ID     = App ID بتاعك من TikTok for Business
//   TIKTOK_APP_SECRET = Secret بتاعك (سري، أبداً متحطوش في أي ملف بيتنشر)

import { guardRequest } from './_cors.js';

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const appId = process.env.TIKTOK_APP_ID;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appId || !appSecret) {
    res.status(500).json({ error: 'TIKTOK_APP_ID أو TIKTOK_APP_SECRET غير مضبوطين في إعدادات Vercel.' });
    return;
  }

  const { authCode } = req.body || {};
  if (!authCode) {
    res.status(400).json({ error: 'authCode مطلوب في جسم الطلب.' });
    return;
  }

  try {
    const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, secret: appSecret, auth_code: authCode })
    });
    const data = await response.json();
    // الرد بيرجّع access_token وقائمة advertiser_ids مباشرة، من غير نداء منفصل زي Google
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
