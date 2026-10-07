// ربط Meta المحفوظ على الجهاز (قرار صاحب المنتج ٧ أكتوبر ٢٠٢٦)
// على الهاتف (أيقونة الشاشة الرئيسية — آيفون وأندرويد) مكتبة فيسبوك مبتقدرش تعرف إن العميل لسه رابط (كوكيز فيسبوك
// ممنوعة هناك)، فالحسابات الإعلانية كانت بتتفصل كل ما الأداة تتفتح. زي Google وSnapchat (api/_seal.js): بعد الدخول
// بفيسبوك بنبدّل المفتاح القصير بمفتاح طويل (نحو ٦٠ يوم) بسر التطبيق، ونقفله AES-256-GCM (TOKEN_ENC_KEY) ومربوط
// بحساب الدخول للأداة نفسه، ونرجّع النسخة المقفولة للجهاز. مفيش أي نسخة عندنا.
//   meta.seal  ← { token }  المفتاح اللي رجع من فيسبوك (FB.login أو getLoginStatus) → { access_token, expires_in, sealed }
//   meta.renew ← { sealed } الأداة اتفتحت من جديد → { access_token, expires_in } لو Meta لسه قابلاه، وإلا ٤١٠ AUTH
// اللي ياخد النسخة المقفولة من الجهاز ميقدرش يفتحها من غير خادمنا ومن غير دخول نفس الحساب للأداة (كلمة المرور + الرمز).
// المفتاح الطويل بيرجع للمتصفح (طلبات Meta بتروح من المتصفح لـ Meta على طول) وبيتحفظ في جلسة التاب بس (sessionStorage).
// ٤١٠ مش ٤٠١: الـ ٤٠١ عند الأداة معناه «دخول الأداة نفسه خلص» (AuthLogin.isLoginFailure)

import { GRAPH, TOKEN, reply } from './lib.ts';
import { seal, unseal, longLived } from './digest.ts';

const LABEL = 'ads-center/meta-device/v1:';
const SEALED = /^m1\.[A-Za-z0-9+/=]{16,24}\.[A-Za-z0-9+/=]{40,4000}$/;

// Meta لسه قابلة المفتاح؟ true = شغّال، false = اترفض (انتهى أو اتلغى أو اتشالت الصلاحية)، null = عطل مؤقت
async function metaOk(token: string): Promise<boolean | null> {
  const r = await fetch(GRAPH + '/me?fields=id&access_token=' + encodeURIComponent(token)).catch(() => null);
  if (!r) return null;
  if (r.ok) return true;
  const j = await r.json().catch(() => null);
  const code = j && j.error ? Number(j.error.code) : 0;
  return code === 190 || code === 102 || code === 10 || (code >= 200 && code <= 299) ? false : null;
}

export async function handleMetaLink(action: string, body: any, userId: string, origin: string | null): Promise<Response> {
  const aad = LABEL + userId;
  if (action === 'meta.seal') {
    if (typeof body.token !== 'string' || !TOKEN.test(body.token)) return reply(400, { error: 'token' }, origin);
    // التبديل نفسه بيتأكد إن المفتاح صادر لتطبيقنا (fb_exchange_token بسرّه بيفشل لمفتاح تطبيق تاني)
    const ll = await longLived(body.token);
    if (!ll) return reply(502, { error: 'meta exchange' }, origin);
    const exp = Date.parse(ll.expiresAt);
    const s = await seal(JSON.stringify({ t: ll.token, exp }), aad);
    return reply(200, { access_token: ll.token, expires_in: Math.max(0, Math.floor((exp - Date.now()) / 1000)), sealed: 'm1.' + s.iv + '.' + s.ct }, origin);
  }
  if (action === 'meta.renew') {
    const sealed = typeof body.sealed === 'string' ? body.sealed : '';
    const gone = () => reply(410, { error: 'sealed', code: 'AUTH' }, origin);
    if (sealed.length > 4100 || !SEALED.test(sealed)) return gone();
    const parts = sealed.split('.');
    let data: any = null;
    // متفتحش = اتعدّلت، أو لحساب دخول تاني، أو مفتاح التشفير اتغيّر — في كل الحالات ربط من جديد
    try { data = JSON.parse(await unseal(parts[2], parts[1], aad)); } catch (_) { return gone(); }
    if (!data || typeof data.t !== 'string' || !(Number(data.exp) > Date.now() + 60000)) return gone();
    const ok = await metaOk(data.t);
    if (ok === false) return gone();
    if (ok === null) return reply(502, { error: 'meta' }, origin);
    return reply(200, { access_token: data.t, expires_in: Math.floor((Number(data.exp) - Date.now()) / 1000) }, origin);
  }
  return reply(400, { error: 'action' }, origin);
}
