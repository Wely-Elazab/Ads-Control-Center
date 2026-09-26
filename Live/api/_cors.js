// حماية مشتركة لكل ملفات /api — الاسم بيبدأ بـ "_" فمش endpoint (cloudflare/worker.js بيشغّل اللي في HANDLERS بس)
//
// قبل كده كان Access-Control-Allow-Origin: * — يعني أي موقع على الإنترنت يقدر يستخدم الـ endpoints دي
// (ومعاها أسرار Google/Snapchat/TikTok) من متصفح زوّاره. دلوقتي المسموح بس:
//   1) نفس الدومين اللي الطلب جاي عليه (الصفحة والـ API على نفس الـ Worker)
//   2) أي دومين إضافي تحطه في متغيّر البيئة ALLOWED_ORIGINS (مفصولين بفاصلة)، مثال:
//      ALLOWED_ORIGINS = https://example.com,https://www.example.com
// الـ host بييجي من رابط الطلب نفسه (الـ Worker بيحطه ومبيسمحش بـ X-Forwarded-Host من المتصفح)
//
// ملاحظة صريحة: ده بيمنع المواقع التانية من استخدام الـ API من المتصفح، لكنه مش بيمنع حد بيبعت
// طلبات مباشرة من سكربت (يقدر يزوّر Origin). الحماية الكاملة محتاجة جلسات مستخدمين — خطوة لاحقة.
// لحد وقتها: Google بيتحقق إن التوكن لتطبيقنا (_verify.js)، وكل المدخلات بتتراجع (_input.js)

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '').split(',').map(function (s) { return s.trim().replace(/\/$/, ''); }).filter(Boolean);
}

// بيرجّع true لو الطلب يكمل، وfalse لو الرد اتبعت خلاص (رفض أو OPTIONS)
export function guardRequest(req, res) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const sameOrigin = !!(origin && host && (origin === 'https://' + host || origin === 'http://' + host));
  // طلب من غير Origin = مش جاي من صفحة ويب تانية (مثلاً same-origin GET) — مسموح
  const ok = !origin || sameOrigin || allowedOrigins().indexOf(origin) !== -1;

  res.setHeader('Vary', 'Origin');
  // ردود فيها بيانات حساب إعلاني — متتخزنش في أي كاش وسيط ولا في المتصفح
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin && ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (!ok) { res.status(403).json({ error: 'ورد الطلب من نطاق غير مسموح به.', code: 'ORIGIN' }); return false; }
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed', code: 'BAD_REQUEST' }); return false; }
  return true;
}
