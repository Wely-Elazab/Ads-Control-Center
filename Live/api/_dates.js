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

// نافذة تقييم الإعلانات بتوقيت الحساب: ٧ أيام مكتملة + النهارده (نفس js/core.js last7Days — من ١٠ أكتوبر ٢٠٢٦)
export function last7DaysRange(tz) {
  const until = todayKeyInTz(tz);
  return { since: shiftDateKey(until, -7), until: until, timeZone: isValidTz(tz) ? tz : 'UTC' };
}

// ---------- فترة البيانات اللي المستخدم اختارها ----------
// بتتحسب بتوقيت الحساب نفسه (نفس منطق الواجهة بالظبط). أقصى مدة ٩٣ يوم عشان الطلبات تفضل سريعة.
// كل الفترات (حتى آخر ٧ أيام) بتتجاب مجاميعها لوحدها: النافذة اليومية فيها النهارده، والفترة أيام مكتملة بس
const PERIOD_MAX_DAYS = 93;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// تاريخ حقيقي بالشكل YYYY-MM-DD — «2026-02-31» أو «2026-13-01» مبتتقبلش (كانت بتتبعت للمنصة وترجع خطأ)
export function isDateKey(k) { return typeof k === 'string' && DATE_KEY.test(k) && shiftDateKey(k, 0) === k; }

export function daysBetweenKeys(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

export function resolvePeriod(period, tz) {
  const today = todayKeyInTz(tz), yesterday = shiftDateKey(today, -1);
  const preset = (period && period.preset) || 'last7';
  // الفترات المتحركة = أيام مكتملة بس، والنهارده منفصل (نفس resolvePeriodFor في js/core.js — ١٠ أكتوبر ٢٠٢٦).
  // isDefault دايماً false: مجاميع الفترة بتتجاب لوحدها (النافذة اليومية فيها النهارده)
  let since = shiftDateKey(today, -7), until = yesterday;
  if (preset === 'today') { since = until = today; }
  else if (preset === 'yesterday') { since = until = yesterday; }
  else if (preset === 'last14') { since = shiftDateKey(today, -14); }
  else if (preset === 'last30') { since = shiftDateKey(today, -30); }
  else if (preset === 'thisMonth') { since = today.slice(0, 8) + '01'; if (since > until) until = today; }
  else if (preset === 'lastMonth') {
    until = shiftDateKey(today.slice(0, 8) + '01', -1);
    since = until.slice(0, 8) + '01';
  } else if (preset === 'custom' && period && isDateKey(period.since) && isDateKey(period.until)) {
    since = period.since; until = period.until;
    if (since > until) { const t = since; since = until; until = t; }
    if (until > today) until = today;
    if (since > until) since = until;
  } else if (preset !== 'last7') {
    return { preset: 'last7', since: shiftDateKey(today, -7), until: yesterday, isDefault: false };
  }
  if (daysBetweenKeys(since, until) > PERIOD_MAX_DAYS - 1) since = shiftDateKey(until, -(PERIOD_MAX_DAYS - 1));
  return { preset: preset, since: since, until: until, isDefault: false };
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
