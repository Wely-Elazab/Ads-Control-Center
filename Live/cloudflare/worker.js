// =====================================================================
// Ads Center — Cloudflare Worker (الموقع + /api)
// =====================================================================
// الموقع كله على adscenter.online (من ٢٥ سبتمبر ٢٠٢٦ — Vercel اتقفل):
//   - الصفحات الثابتة من مجلد Live (الـ ASSETS binding) بالـ rewrites والـ redirects اللي تحت
//   - رؤوس الأمان (CSP وغيرها) على كل رد
//   - ملفات api/*.js مكتوبة بشكل Vercel (req.body / res.status().json()) — بنلفّها بطبقة صغيرة
//     بتحوّلها من/لـ Request/Response بتاعة Cloudflare
// الإعداد في wrangler.jsonc (في جذر الريبو). الملفات اللي مبتتنشرش كصفحات في Live/.assetsignore
//
// الروابط هنا مسجّلة في Meta وGoogle وSnapchat (رابط الرجوع = /app) — أي تغيير فيها لازم يتسجّل هناك كمان
// (اختبار «Cloudflare» في tests.js بيثبّتها)

import googleListAccounts from '../api/google-list-accounts.js';
import googleAdsFetch from '../api/google-ads-fetch.js';
import snapchatToken from '../api/snapchat-token.js';
import snapchatAdsFetch from '../api/snapchat-ads-fetch.js';
import tiktokToken from '../api/tiktok-token.js';
import tiktokAdsFetch from '../api/tiktok-ads-fetch.js';

// الـ endpoints المنشورة — discount متشال عن قصد مع صفحة الأسعار المخفية،
// والملفات اللي بتبدأ بـ "_" مش endpoints أصلاً
export const HANDLERS = {
  'google-list-accounts': googleListAccounts,
  'google-ads-fetch': googleAdsFetch,
  'snapchat-token': snapchatToken,
  'snapchat-ads-fetch': snapchatAdsFetch,
  'tiktok-token': tiktokToken,
  'tiktok-ads-fetch': tiktokAdsFetch
};

// التحويلات (permanent: true = 308، وfalse = 307)
// /home كانت الصفحة الرئيسية قبل الدومين — الروابط القديمة بتروح لـ / على طول
export const REDIRECTS = {
  '/home': { destination: '/', permanent: true },
  '/pricing': { destination: '/', permanent: false },
  '/pricing.html': { destination: '/', permanent: false }
};

// الروابط النظيفة: الرابط بيفضل زي ما هو والصفحة بتيجي من الملف.
// الصفحة الرئيسية على / والأداة على /app (رابط الرجوع من Snapchat = origin + /app)
export const REWRITES = {
  '/': '/home.html',
  '/index.html': '/home.html',
  '/app': '/pauseproof-live.html',
  '/help': '/help.html',
  '/privacy': '/privacy.html',
  '/terms': '/terms.html',
  '/data-deletion': '/data-deletion.html'
};

// رؤوس الأمان (على كل الردود، الصفحات والـ API)
// Cross-Origin-Opener-Policy: موقع تاني فتح الأداة في نافذة ميقدرش يتحكم فيها (window.opener).
//   لازم تفضل same-origin-allow-popups مش same-origin — نوافذ تسجيل الدخول بتاعة Google وMeta بتكلّم
//   صفحتنا عن طريق النافذة اللي فتحتها (تحذير في js/google.js)
// upgrade-insecure-requests: أي صورة إعلان رابطها http بتتطلب https بدل ما تتمنع
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://connect.facebook.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https://connect.facebook.net https://graph.facebook.com https://*.facebook.com https://accounts.google.com https://oauth2.googleapis.com; frame-src https://*.facebook.com https://accounts.google.com https://business-api.tiktok.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://accounts.snapchat.com https://business-api.tiktok.com; object-src 'none'; upgrade-insecure-requests"
};

// أقصى حجم لجسم طلب /api — أكبر طلب حقيقي (توكن + أرقام + فترة) أقل من ١٠ كيلوبايت
const MAX_BODY = 64 * 1024;

function withSecurityHeaders(response) {
  const res = new Response(response.body, response); // نسخة رؤوسها قابلة للتعديل
  Object.keys(SECURITY_HEADERS).forEach(function (k) { if (!res.headers.has(k)) res.headers.set(k, SECURITY_HEADERS[k]); });
  return res;
}

// ملفات api بتقرا الأسرار من process.env (زي Vercel). في Cloudflare الأسرار بتيجي في env —
// فبننسخ القيم النصية منها لـ process.env قبل تشغيل الدالة
function exposeEnv(env) {
  const g = globalThis;
  if (!g.process) g.process = { env: {} };
  if (!g.process.env) g.process.env = {};
  Object.keys(env || {}).forEach(function (k) { if (typeof env[k] === 'string') g.process.env[k] = env[k]; });
}

// طبقة التحويل: Request → req/res بشكل Vercel → Response
export async function runVercelHandler(handler, request, env) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach(function (v, k) { headers[k] = v; });
  headers.host = url.host; // guardRequest بيقارن Origin بالـ host عشان يسمح لنفس الموقع
  // مفيش proxy قدّام الـ Worker بيحط الهيدر ده — لو جاي فهو من المرسل نفسه، فمش بنعدّيه
  delete headers['x-forwarded-host'];

  // Vercel بيحوّل جسم JSON لـ object تلقائياً — جسم مش JSON بيوصل undefined والدالة بترد BAD_REQUEST.
  // جسم ضخم بيترفض قبل ما يتقري كله (413)
  let body;
  if (request.method === 'POST') {
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return jsonError(413, 'حجم الطلب أكبر من المسموح.', 'TOO_LARGE');
    const text = await request.text();
    if (text.length > MAX_BODY) return jsonError(413, 'حجم الطلب أكبر من المسموح.', 'TOO_LARGE');
    if (text) { try { body = JSON.parse(text); } catch (e) { body = undefined; } }
  }
  const query = {};
  url.searchParams.forEach(function (v, k) { query[k] = v; });
  const req = { method: request.method, headers: headers, body: body, query: query, url: url.pathname + url.search };

  const out = { status: 200, headers: new Headers(), body: null, sent: false };
  const res = {
    statusCode: 200,
    status: function (code) { out.status = code; this.statusCode = code; return this; },
    setHeader: function (k, v) { out.headers.set(k, String(v)); return this; },
    getHeader: function (k) { return out.headers.get(k); },
    json: function (obj) {
      if (!out.headers.has('content-type')) out.headers.set('content-type', 'application/json; charset=utf-8');
      out.body = JSON.stringify(obj); out.sent = true; return this;
    },
    send: function (data) {
      if (data != null && typeof data === 'object') return this.json(data);
      out.body = data == null ? null : String(data); out.sent = true; return this;
    },
    end: function (data) { if (data != null) out.body = String(data); out.sent = true; return this; }
  };

  exposeEnv(env);
  try {
    await handler(req, res);
  } catch (e) {
    // من غير تفاصيل الخطأ في الرد ولا في السجلات — ممكن تبقى فيها بيانات من المنصة
    return jsonError(500, 'حدث خطأ غير متوقع في الخادم.');
  }
  if (!out.sent) return jsonError(500, 'لم يرسل الخادم أي رد.');
  const noBody = out.status === 204 || out.status === 304 || request.method === 'HEAD';
  return new Response(noBody ? null : out.body, { status: out.status, headers: out.headers });
}

function jsonError(status, message, code) {
  return new Response(JSON.stringify({ error: message, code: code || 'SERVER' }), {
    status: status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

// تعليقات الـ HTML (<!-- -->) ملاحظات لينا إحنا — بتفضل في الكود ومبتتنشرش للزوار ولا لمراجعي المنصات
// (فيها تفاصيل داخلية زي طريقة إضافة المختبِرين وبنود الأسعار المخفية). HTMLRewriter موجود في Cloudflare
// بس — في صفحة الاختبارات المحلية الرد بيرجع زي ما هو
export function stripHtmlComments(response) {
  const type = response.headers.get('content-type') || '';
  if (typeof HTMLRewriter === 'undefined' || !response.body || type.indexOf('text/html') === -1) return response;
  return new HTMLRewriter().onDocument({ comments: function (c) { c.remove(); } }).transform(response);
}

// صفحة 404 بتاعتنا بحالة 404 — من غير رؤوس الطلب الأصلي عشان متبقاش 304 من غير محتوى
async function notFound(request, env) {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new Request(new URL('/404.html', url), { method: 'GET' }));
  const headers = new Headers(page.headers);
  headers.set('cache-control', 'no-store');
  return withSecurityHeaders(stripHtmlComments(new Response(request.method === 'HEAD' ? null : page.body, { status: 404, headers: headers })));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // www.adscenter.online → adscenter.online (نفس المسار) — عنوان واحد رسمي للموقع ولتسجيلات OAuth
    if (url.hostname.indexOf('www.') === 0) {
      return withSecurityHeaders(new Response(null, { status: 301, headers: { Location: 'https://' + url.hostname.slice(4) + path + url.search } }));
    }

    if (path.indexOf('/api/') === 0) {
      const name = path.slice(5).replace(/\/+$/, '');
      if (Object.prototype.hasOwnProperty.call(HANDLERS, name)) {
        return withSecurityHeaders(await runVercelHandler(HANDLERS[name], request, env));
      }
      // مسار API مش موجود: رد JSON (مش صفحة 404 بتاعة الزوار) — عشان أي كود بيستدعيه يفهم الرد
      return withSecurityHeaders(jsonError(404, 'Not found', 'NOT_FOUND'));
    }

    if (Object.prototype.hasOwnProperty.call(REDIRECTS, path)) {
      const r = REDIRECTS[path];
      return withSecurityHeaders(new Response(null, { status: r.permanent ? 308 : 307, headers: { Location: r.destination + url.search } }));
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return withSecurityHeaders(new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } }));
    }

    const assetPath = Object.prototype.hasOwnProperty.call(REWRITES, path) ? REWRITES[path] : path;
    const assetUrl = new URL(assetPath + url.search, url);
    const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (asset.status === 404) return notFound(request, env);
    return withSecurityHeaders(stripHtmlComments(asset));
  }
};
