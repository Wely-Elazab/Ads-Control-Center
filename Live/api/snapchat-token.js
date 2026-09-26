// المسار: https://adscenter.online/api/snapchat-token (بيشتغل جوه cloudflare/worker.js)
//
// محتاج سرّين في إعدادات الـ Worker على Cloudflare (Settings → Variables and Secrets، نوع Secret):
//   SNAPCHAT_CLIENT_ID     = الـ Client ID بتاعك من Snapchat Business Manager
//   SNAPCHAT_CLIENT_SECRET = الـ Client Secret بتاعك (سري، أبداً متحطوش في أي ملف بيتنشر)

import { guardRequest } from './_cors.js';
import { text, badRequest } from './_input.js';

// رابط الرجوع الوحيد المسموح: /app على نفس الدومين (نفس اللي مسجّل في Snapchat).
// قبل كده السيرفر كان بيقبل أي redirectUri من المتصفح ويبعته مع السر بتاعنا
function expectedRedirect(req) {
  const host = String(req.headers.host || '');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return (local ? 'http://' : 'https://') + host + '/app';
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
  const code = text(body.code, 2048), redirectUri = text(body.redirectUri, 512);
  if (!code || !redirectUri) { badRequest(res, 'الحقلان code وredirectUri مطلوبان في جسم الطلب.'); return; }
  if (redirectUri !== expectedRedirect(req)) { badRequest(res, 'رابط الرجوع غير مطابق للرابط المسجّل.'); return; }

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
    // رد مش JSON (صفحة خطأ مثلاً) بيتعامل كفشل عادي — مش استثناء برسالة تقنية
    const data = await response.json().catch(function () { return null; });
    // Snapchat بترجّع كمان refresh_token صلاحيته طويلة — منرجّعوش للمتصفح أصلاً،
    // الواجهة محتاجة access_token ومدته بس
    if (!response.ok || !data || !data.access_token) {
      res.status(response.ok ? 502 : response.status).json({
        error: (data && (data.error_description || data.error)) || ('HTTP ' + response.status)
      });
      return;
    }
    res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in, token_type: data.token_type });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
