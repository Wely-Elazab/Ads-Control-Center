// ضعه في نفس مجلد /api بجانب ملفات Google
// المسار النهائي: https://<مشروعك>.vercel.app/api/snapchat-token
//
// محتاج متغيّرين بيئة في إعدادات Vercel (Settings → Environment Variables):
//   SNAPCHAT_CLIENT_ID     = الـ Client ID بتاعك من Snapchat Business Manager
//   SNAPCHAT_CLIENT_SECRET = الـ Client Secret بتاعك (سري، أبداً متحطوش في أي ملف بيتنشر)

import { guardRequest } from './_cors.js';

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'SNAPCHAT_CLIENT_ID أو SNAPCHAT_CLIENT_SECRET غير مضبوطين في إعدادات Vercel.' });
    return;
  }

  const { code, redirectUri } = req.body || {};
  if (!code || !redirectUri) {
    res.status(400).json({ error: 'code و redirectUri مطلوبين في جسم الطلب.' });
    return;
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri
    });
    const response = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await response.json();
    // بيرجع access_token (صالح 60 دقيقة) و refresh_token — الفرونت إند بيحتفظ بيهم في الذاكرة بس، مش أبعد من كده
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
