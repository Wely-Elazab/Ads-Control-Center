// حماية مشتركة لكل ملفات /api — الاسم بيبدأ بـ "_" عشان Vercel ميحوّلوش لـ endpoint
//
// قبل كده كان Access-Control-Allow-Origin: * — يعني أي موقع على الإنترنت يقدر يستخدم الـ endpoints دي
// (ومعاها GOOGLE_ADS_DEVELOPER_TOKEN وأسرار Snapchat/TikTok) من متصفح زوّاره.
// دلوقتي المسموح بس:
//   1) نفس الدومين اللي الطلب جاي عليه (الصفحة والـ API على نفس مشروع Vercel — ده بيغطي الدومين
//      الأساسي وروابط الـ Preview تلقائياً من غير أي إعداد)
//   2) أي دومين إضافي تحطه في متغيّر البيئة ALLOWED_ORIGINS (مفصولين بفاصلة)، مثال:
//      ALLOWED_ORIGINS = https://pauseproof.com,https://www.pauseproof.com
//
// ملاحظة صريحة: ده بيمنع المواقع التانية من استخدام الـ API من المتصفح، لكنه مش بيمنع حد بيبعت
// طلبات مباشرة من سكربت (يقدر يزوّر Origin). الحماية الكاملة محتاجة جلسات مستخدمين — خطوة لاحقة.

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '').split(',').map(function (s) { return s.trim().replace(/\/$/, ''); }).filter(Boolean);
}

// بيرجّع true لو الطلب يكمل، وfalse لو الرد اتبعت خلاص (رفض أو OPTIONS)
export function guardRequest(req, res) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const sameOrigin = !!(origin && host && (origin === 'https://' + host || origin === 'http://' + host));
  // طلب من غير Origin = مش جاي من صفحة ويب تانية (مثلاً same-origin GET) — مسموح
  const ok = !origin || sameOrigin || allowedOrigins().indexOf(origin) !== -1;

  res.setHeader('Vary', 'Origin');
  if (origin && ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (!ok) { res.status(403).json({ error: 'الطلب جاي من دومين غير مسموح (' + origin + ').' }); return false; }
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return false; }
  return true;
}
