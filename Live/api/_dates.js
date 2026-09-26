// أدوات تواريخ مشتركة لملفات /api — الاسم بيبدأ بـ "_" فمش endpoint
// كل المنصات بتحسب "اليوم" بتوقيت الحساب الإعلاني نفسه، مش بتوقيت UTC ولا توقيت السيرفر،
// عشان مفتاح كل يوم في الجدول يطابق التاريخ اللي المنصة بترجّعه بالظبط

function partsInTz(date, tz, extra) {
  const opts = Object.assign({ year: 'numeric', month: '2-digit', day: '2-digit' }, extra || {});
  if (tz) {
    try { return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: tz }, opts)).formatToParts(date); } catch (e) { /* توقيت غير معروف — نكمّل بـ UTC */ }
  }
  return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'UTC' }, opts)).formatToParts(date);
}

function pick(parts, type) {
  const p = parts.find(function (x) { return x.type === type; });
  return p ? p.value : '';
}

// تاريخ النهارده بصيغة YYYY-MM-DD بتوقيت معيّن
export function todayKeyInTz(tz) {
  const parts = partsInTz(new Date(), tz);
  return pick(parts, 'year') + '-' + pick(parts, 'month') + '-' + pick(parts, 'day');
}

// إزاحة تاريخ بعدد أيام (حساب تقويمي بحت، من غير أي توقيت)
export function shiftDateKey(key, days) {
  const p = key.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
}

// نطاق آخر 7 أيام شاملة النهارده بتوقيت الحساب
export function last7DaysRange(tz) {
  const until = todayKeyInTz(tz);
  return { since: shiftDateKey(until, -6), until: until, timeZone: isValidTz(tz) ? tz : 'UTC' };
}

// ---------- فترة البيانات اللي المستخدم اختارها ----------
// بتتحسب بتوقيت الحساب نفسه (نفس منطق الواجهة بالظبط). أقصى مدة ٩٣ يوم عشان الطلبات تفضل سريعة.
// last7 بيرجّع null — الواجهة بتحسبها من بيانات آخر ٧ أيام اللي بتتجاب أصلاً، من غير طلب إضافي
const PERIOD_MAX_DAYS = 93;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// تاريخ حقيقي بالشكل YYYY-MM-DD — «2026-02-31» أو «2026-13-01» مبتتقبلش (كانت بتتبعت للمنصة وترجع خطأ)
function isDateKey(k) { return typeof k === 'string' && DATE_KEY.test(k) && shiftDateKey(k, 0) === k; }

function daysBetweenKeys(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

export function resolvePeriod(period, tz) {
  const today = todayKeyInTz(tz);
  const preset = (period && period.preset) || 'last7';
  let since = shiftDateKey(today, -6), until = today;
  if (preset === 'today') { since = today; }
  else if (preset === 'yesterday') { since = until = shiftDateKey(today, -1); }
  else if (preset === 'last14') { since = shiftDateKey(today, -13); }
  else if (preset === 'last30') { since = shiftDateKey(today, -29); }
  else if (preset === 'thisMonth') { since = today.slice(0, 8) + '01'; }
  else if (preset === 'lastMonth') {
    until = shiftDateKey(today.slice(0, 8) + '01', -1);
    since = until.slice(0, 8) + '01';
  } else if (preset === 'custom' && period && isDateKey(period.since) && isDateKey(period.until)) {
    since = period.since; until = period.until;
    if (since > until) { const t = since; since = until; until = t; }
    if (until > today) until = today;
    if (since > until) since = until;
  } else if (preset !== 'last7') {
    return { preset: 'last7', since: shiftDateKey(today, -6), until: today, isDefault: true };
  }
  if (daysBetweenKeys(since, until) > PERIOD_MAX_DAYS - 1) since = shiftDateKey(until, -(PERIOD_MAX_DAYS - 1));
  return { preset: preset, since: since, until: until, isDefault: preset === 'last7' };
}

function isValidTz(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}

// فرق التوقيت بصيغة +03:00 لتاريخ معيّن (Snapchat بيطلبه صريح في start_time/end_time)
export function tzOffsetString(dateKey, tz) {
  const p = dateKey.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
  const name = pick(partsInTz(noonUtc, tz, { timeZoneName: 'longOffset' }), 'timeZoneName'); // مثال: GMT+03:00 أو GMT
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] + ':' + (m[2] || '00')) : '+00:00';
}
