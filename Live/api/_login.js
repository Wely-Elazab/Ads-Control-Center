// حارس /api (cloudflare/worker.js): كل طلبات الأداة محتاجة دخول مكتمل — كلمة المرور + الرمز على البريد
// (قرار صاحب المنتج ٦ أكتوبر ٢٠٢٦ — supabase/functions/sync/auth.ts). الاسم بيبدأ بـ "_" فمش endpoint.
//
// ١) مفتاح الدخول (JWT من Supabase Auth) توقيعه سليم بمفاتيح Supabase العامة (ES256 — /.well-known/jwks.json)،
//    والمُصدِر والجمهور والصلاحية مظبوطين. من غير أي سر.
// ٢) الجلسة دي أكّدت الرمز ولسه قايمة وصاحبها مسموح له: سؤال واحد لقاعدة البيانات (session_ok) بالمفتاح العام —
//    بيرجّع نعم/لا بس. الإجابة «نعم» بتتحفظ ٥ دقايق (فتسجيل الخروج بيقفل /api خلال ٥ دقايق على الأكتر)
// المفتاح العام (publishable) عام بطبيعته — زي رقم تطبيق Meta

export const PROJECT = 'https://rhrrnxsgodiideqeollo.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_rrAe735nWhuBQRJxt7lxiw_4DP37wo0';
const ISSUER = PROJECT + '/auth/v1';
const OK_TTL_MS = 5 * 60000;

let keysP = null, keysAt = 0;
const okUntil = new Map();

function b64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function signingKeys(force) {
  if (!keysP || force || Date.now() - keysAt > 3600000) {
    keysAt = Date.now();
    keysP = (async function () {
      const j = await (await fetch(ISSUER + '/.well-known/jwks.json')).json();
      const out = {};
      for (const k of (j && j.keys) || []) {
        if (k.kty !== 'EC' || k.crv !== 'P-256' || !k.kid) continue;
        out[k.kid] = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: k.x, y: k.y, ext: true },
          { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      }
      return out;
    })().catch(function (e) { keysP = null; throw e; });
  }
  return keysP;
}

// المحتوى لو المفتاح سليم، وإلا null
export async function verifyJwt(token) {
  if (typeof token !== 'string' || !token || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  } catch (e) { return null; }
  if (!header || header.alg !== 'ES256' || !header.kid) return null;
  let key = (await signingKeys())[header.kid];
  if (!key) key = (await signingKeys(true))[header.kid];   // المفتاح اتغيّر عند Supabase
  if (!key) return null;
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok || !payload) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== ISSUER || aud.indexOf('authenticated') < 0 || !(payload.exp * 1000 > Date.now())) return null;
  if (typeof payload.sub !== 'string' || typeof payload.session_id !== 'string') return null;
  return payload;
}

async function sessionOk(p) {
  const k = p.session_id + '|' + p.sub, until = okUntil.get(k);
  if (until && until > Date.now()) return true;
  const r = await fetch(PROJECT + '/rest/v1/rpc/session_ok', {
    method: 'POST', headers: { 'apikey': PUBLISHABLE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ p_session: p.session_id, p_user: p.sub })
  });
  const ok = r.ok && (await r.json().catch(function () { return false; })) === true;
  if (ok) {
    if (okUntil.size > 5000) okUntil.clear();
    okUntil.set(k, Date.now() + OK_TTL_MS);
  }
  return ok;
}

// true = الطلب ده من دخول مكتمل
export async function checkLogin(request) {
  const h = request.headers.get('authorization') || '';
  const token = /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, '').trim() : null;
  try {
    const p = await verifyJwt(token);
    return p ? await sessionOk(p) : false;
  } catch (e) { return false; }
}

// للاختبارات: يبدأ من غير مفاتيح ولا إجابات محفوظة
export function resetLoginCache() { keysP = null; keysAt = 0; okUntil.clear(); }
