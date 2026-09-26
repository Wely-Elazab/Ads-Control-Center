// المسار: https://adscenter.online/api/tiktok-ads-fetch (بيشتغل جوه cloudflare/worker.js)

import { last7DaysRange, resolvePeriod } from './_dates.js';
import { guardRequest } from './_cors.js';
import { text, shaped, periodOf, TOKEN_MAX, badRequest } from './_input.js';

const TT_API = 'https://business-api.tiktok.com/open_api/v1.3';
const PAGE_SIZE = 1000; // أقصى حجم صفحة — الافتراضي 10 بس
const MAX_PAGES = 20;   // حد أمان للتصفّح

// TikTok بترجّع HTTP 200 حتى مع الأخطاء — الخطأ الحقيقي في code != 0
async function ttGet(url, headers) {
  const r = await fetch(url, { headers: headers });
  const data = await r.json().catch(function () { return null; });
  if (!data || data.code !== 0) {
    throw new Error((data && data.message) || ('HTTP ' + r.status));
  }
  return data.data || {};
}

async function ttGetAllPages(baseUrl, headers) {
  let list = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await ttGet(baseUrl + '&page=' + page + '&page_size=' + PAGE_SIZE, headers);
    list = list.concat(data.list || []);
    const totalPages = (data.page_info && data.page_info.total_page) || 1;
    if (page >= totalPages) break;
  }
  return list;
}

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const body = req.body || {};
  const accessToken = text(body.accessToken, TOKEN_MAX);
  // أرقام حسابات TikTok (advertiser_id) أرقام بس
  const advertiserId = shaped(body.advertiserId, /^\d{1,32}$/);
  if (!accessToken || !advertiserId) { badRequest(res, 'الحقلان accessToken وadvertiserId مطلوبان في جسم الطلب.'); return; }
  const clientTz = text(body.clientTz, 64), period = periodOf(body.period);

  // ملاحظة: TikTok بتستخدم اسم Header مخصص (Access-Token) مش "Authorization: Bearer" العادي
  const headers = { 'Access-Token': accessToken, 'Content-Type': 'application/json' };
  const adv = encodeURIComponent(advertiserId);

  // بيانات الحساب (التوقيت والعملة) — لو فشلت نكمّل بتوقيت المتصفح بدل ما نوقف كل حاجة
  let advertiser = null;
  try {
    const info = await ttGet(TT_API + '/advertiser/info/?advertiser_ids=' + encodeURIComponent(JSON.stringify([String(advertiserId)])) +
      '&fields=' + encodeURIComponent(JSON.stringify(['name', 'timezone', 'currency'])), headers);
    const a = info.list && info.list[0];
    if (a) advertiser = { name: a.name || null, timezone: a.timezone || null, currency: a.currency || null };
  } catch (e) { /* مش أساسي */ }

  // secondary_status = حالة التشغيل الفعلية (زي: الحملة متوقفة، المجموعة متوقفة، المدة خلصت، الرصيد خلص)،
  // لأن operation_status بيقول بس هل الإعلان نفسه متشغّل يدوياً. لو الحقل اترفض بنرجع للطلب العادي
  const adFields = ['ad_id', 'ad_name', 'operation_status', 'ad_format', 'landing_page_url', 'video_id', 'image_ids', 'ad_text', 'campaign_id', 'adgroup_id', 'create_time', 'modify_time'];
  const adsUrl = function (fields) { return TT_API + '/ad/get/?advertiser_id=' + adv + '&fields=' + encodeURIComponent(JSON.stringify(fields)); };
  // أسماء الحملة والمجموعة للعرض بالحملات — لو الحقول دي اترفضت بنكمل من غيرها قبل ما نتنازل عن secondary_status
  const nameFields = ['campaign_name', 'adgroup_name'];
  let ads;
  try {
    ads = await ttGetAllPages(adsUrl(adFields.concat(['secondary_status'], nameFields)), headers)
      .catch(function () { return ttGetAllPages(adsUrl(adFields.concat(['secondary_status'])), headers); })
      .catch(function () { return ttGetAllPages(adsUrl(adFields), headers); });
  } catch (err) {
    res.status(502).json({ error: String(err && err.message ? err.message : err) });
    return;
  }

  // تقرير يومي على مستوى الإعلان — data_level=AUCTION_AD إلزامي مع dimension ad_id
  const range = last7DaysRange((advertiser && advertiser.timezone) || clientTz);
  let report = [];
  let reportError = null;
  try {
    report = await ttGetAllPages(TT_API + '/report/integrated/get/?advertiser_id=' + adv +
      '&report_type=BASIC&data_level=AUCTION_AD&service_type=AUCTION' +
      '&dimensions=' + encodeURIComponent(JSON.stringify(['ad_id', 'stat_time_day'])) +
      '&metrics=' + encodeURIComponent(JSON.stringify(['spend', 'conversion', 'cost_per_conversion'])) +
      '&start_date=' + range.since + '&end_date=' + range.until, headers);
  } catch (err) {
    reportError = String(err && err.message ? err.message : err);
  }

  // مجاميع الفترة المختارة: تقرير من غير تقسيم بالأيام (صف لكل إعلان). آخر ٧ أيام مش محتاجة طلب إضافي
  const periodRange = resolvePeriod(period, (advertiser && advertiser.timezone) || clientTz);
  let periodReport = null;
  if (!periodRange.isDefault) {
    try {
      periodReport = await ttGetAllPages(TT_API + '/report/integrated/get/?advertiser_id=' + adv +
        '&report_type=BASIC&data_level=AUCTION_AD&service_type=AUCTION' +
        '&dimensions=' + encodeURIComponent(JSON.stringify(['ad_id'])) +
        '&metrics=' + encodeURIComponent(JSON.stringify(['spend', 'conversion'])) +
        '&start_date=' + periodRange.since + '&end_date=' + periodRange.until, headers);
    } catch (err) { periodReport = null; }
  }

  res.status(200).json({ ads: ads, report: report, reportError: reportError, periodReport: periodReport, period: periodRange, range: range, advertiser: advertiser });
}
