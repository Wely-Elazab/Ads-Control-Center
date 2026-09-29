// أدوات ملخص المتجر المشتركة بين Google وSnapchat — الاسم بيبدأ بـ "_" فمش endpoint
//
// بتحوّل صفوف المنصة (تاريخ + جزء + أرقام) للشكل اللي محرك التشخيص (js/diagnosis.js) بيستناه بالظبط:
//   daily: [{ date, spend, imp, clicks, atc, ic, pur, rev }]  — الحساب كله يوم بيوم
//   dims:  [{ id, segs: [{ key, name, w: [الحالية، السابقة، اللي قبلها] }] }] — كل تقسيم بأرقام الـ ٣ فترات
// الفترات نفسها بيحسبها المتصفح (DX.windows) ويبعتها — السيرفر بيتأكد منها بس

import { isDateKey, daysBetweenKeys } from './_dates.js';

export const DX_FIELDS = ['spend', 'imp', 'clicks', 'atc', 'ic', 'pur', 'rev'];
// أطول مدى يومي بنقبله (٩ فترات × أطول فترة ٩٣ يوم أقل من كده بكتير في العادي) — حماية من طلبات ضخمة
const MAX_DAILY_DAYS = 500;

export function dxEmpty() { const b = {}; DX_FIELDS.forEach(function (f) { b[f] = 0; }); return b; }
export function dxAdd(t, r) { DX_FIELDS.forEach(function (f) { const v = Number(r && r[f]); if (isFinite(v) && v > 0) t[f] += v; }); return t; }

function range(r) {
  return r && typeof r === 'object' && isDateKey(r.since) && isDateKey(r.until) && r.since <= r.until ? { since: r.since, until: r.until } : null;
}
// { daily: {since, until}, windows: [٣ فترات] } — أي حاجة ناقصة أو غريبة = null (والـ endpoint بيرجع BAD_REQUEST)
export function dxRanges(body) {
  const daily = range(body && body.daily);
  const ws = body && Array.isArray(body.windows) && body.windows.length === 3 ? body.windows.map(range) : null;
  if (!daily || !ws || ws.some(function (w) { return !w; })) return null;
  if (daysBetweenKeys(daily.since, daily.until) + 1 > MAX_DAILY_DAYS) return null;
  if (ws.some(function (w) { return w.since < daily.since || w.until > daily.until; })) return null;
  return { daily: daily, windows: ws };
}
// أول تاريخ وآخر تاريخ في الفترات الـ ٣ (التقسيمات بتتطلب على المدى ده مرة واحدة يوم بيوم وبتتوزع هنا)
export function windowsSpan(ws) {
  return { since: ws.reduce(function (m, w) { return w.since < m ? w.since : m; }, ws[0].since), until: ws[0].until };
}
export function windowIndex(date, ws) {
  for (let i = 0; i < ws.length; i++) if (date >= ws[i].since && date <= ws[i].until) return i;
  return -1;
}
// صفوف { date, key, name, ...أرقام } → أجزاء التقسيم بأرقام كل فترة (اللي برّه الفترات بيتجاهل)
export function dxSegments(rows, ws) {
  const map = {};
  (rows || []).forEach(function (r) {
    if (!r || r.key == null) return;
    const i = r.date ? windowIndex(r.date, ws) : r.w;
    if (!(i >= 0 && i < 3)) return;
    const key = String(r.key);
    const s = map[key] = map[key] || { key: key, name: r.name || null, w: [null, null, null] };
    if (!s.name && r.name) s.name = r.name;
    s.w[i] = dxAdd(s.w[i] || dxEmpty(), r);
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}
// صفوف يومية (ممكن أكتر من صف لنفس اليوم) → يوم واحد لكل تاريخ
export function dxDaily(rows) {
  const map = {};
  (rows || []).forEach(function (r) {
    if (!r || !isDateKey(r.date)) return;
    const d = map[r.date] = map[r.date] || Object.assign(dxEmpty(), { date: r.date });
    dxAdd(d, r);
  });
  return Object.keys(map).sort().map(function (k) { return map[k]; });
}
