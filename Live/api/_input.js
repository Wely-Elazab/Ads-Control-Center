// التحقق من مدخلات /api — الاسم بيبدأ بـ "_" فمش endpoint (cloudflare/worker.js بيشغّل اللي في HANDLERS بس)
//
// أي قيمة جاية من المتصفح لازم تبقى نص بطول معقول وبالشكل المتوقع قبل ما تتبعت لأي منصة.
// قبل كده object أو نص ضخم كان بيعدّي زي ما هو (مثلاً "Bearer [object Object]") لحد ما المنصة ترفضه
// برسالة غريبة — دلوقتي بيرجع BAD_REQUEST واضح من عندنا

// توكنات Snapchat (JWT) ممكن توصل لحوالي ٢٠٠٠ حرف — الحد ده واسع كفاية لكل المنصات
export const TOKEN_MAX = 8192;

// نص مش فاضي وطوله في الحدود — وإلا null
export function text(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= (max || 4096) ? v : null;
}

// نص (أو رقم) بيطابق شكل معيّن زي رقم حساب — وإلا null
export function shaped(v, re, max) {
  const s = typeof v === 'number' && isFinite(v) ? String(v) : text(v, max || 128);
  return s && re.test(s) ? s : null;
}

// الفترة: object أو ولا حاجة (resolvePeriod في _dates.js بيتحقق من قيمها بالتفصيل)
export function periodOf(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

export function badRequest(res, message) {
  res.status(400).json({ error: message, code: 'BAD_REQUEST' });
}
