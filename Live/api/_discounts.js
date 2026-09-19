// أكواد الخصم — منطق خالص من غير أي اتصال (عشان يتختبر لوحده)
// الأكواد نفسها بتتحفظ في متغيّر البيئة DISCOUNT_CODES على السيرفر، مش في الصفحة —
// أي حاجة في كود الصفحة أي حد يقدر يقراها، فكان أي زائر هيلاقي كل الأكواد ونسبها.
//
// الشكل: الكود:النسبة[:آخر يوم صلاحية] — مفصولين بفاصلة. مثال:
//   DISCOUNT_CODES = FOUNDER-7K2Q:50, PARTNER-X9:20:2026-12-31
// نصيحة: خلي الأكواد مش سهلة التخمين (حروف وأرقام)، لأن مفيش حد لعدد المحاولات لحد مرحلة الأساس

export function normalizeCode(c) {
  return String(c == null ? '' : c).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

export function parseDiscountCodes(raw) {
  const out = {};
  String(raw || '').split(',').forEach(function (item) {
    const parts = item.trim().split(':');
    const code = normalizeCode(parts[0]);
    const percent = Number(parts[1]);
    const until = parts[2] && /^\d{4}-\d{2}-\d{2}$/.test(parts[2].trim()) ? parts[2].trim() : null;
    if (!code || !(percent > 0 && percent <= 100)) return;
    out[code] = { percent: percent, until: until };
  });
  return out;
}

// todayKey بصيغة YYYY-MM-DD — الكود صالح لحد آخر اليوم المكتوب
export function checkDiscount(codes, input, todayKey) {
  const code = normalizeCode(input);
  const entry = code ? codes[code] : null;
  if (!entry) return { valid: false };
  if (entry.until && todayKey > entry.until) return { valid: false, expired: true };
  return { valid: true, code: code, percent: entry.percent };
}
