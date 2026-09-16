// أدوات تواريخ مشتركة لملفات /api — الاسم بيبدأ بـ "_" عشان Vercel ميحوّلوش لـ endpoint
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
