// أدوات Google Ads مشتركة بين google-list-accounts و google-ads-fetch
// الاسم بيبدأ بـ "_" فمش endpoint

export const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v24';

// «الأقرب للمتجر» (قرار ٦ أكتوبر ٢٠٢٦): التحويلات اللي Google بينسبها لنقرة على الإعلان (مش ظهور ولا مشاهدة فيديو)
// وحصلت خلال ٧ أيام منها. التقسيمين دول بيتطلبوا مع مقاييس التحويلات بس (مش الصرف والنقرات)، ومش متاحين
// مع الجهاز (segments.device) ولا الدولة (user_location_view). «آخر نقرة» مش ممكنة من الاستعلام: نموذج الإسناد
// متحدد على إجراء التحويل نفسه. Google بيقول إن الأيام محسوبة «من الظهور» (وثائق ConversionLagBucket)
export const STORE_LAGS = ['LESS_THAN_ONE_DAY', 'ONE_TO_TWO_DAYS', 'TWO_TO_THREE_DAYS', 'THREE_TO_FOUR_DAYS', 'FOUR_TO_FIVE_DAYS', 'FIVE_TO_SIX_DAYS', 'SIX_TO_SEVEN_DAYS'];
export const STORE_SEGMENTS = 'segments.conversion_attribution_event_type, segments.conversion_lag_bucket';
// الصف يتحسب في «الأقرب للمتجر» بس لو نوعه نقرة ومدته ٧ أيام أو أقل. الفلترة هنا في الكود مش في WHERE (التدقيق الشامل ٢٦ نوفمبر ٢٠٢٦،
// حساب حقيقي): حملات Performance Max تحويلاتها مبترجعش بنوع «نقرة» — حملة Google بيقول عنها ٨ تحويلات وحملة تانية ١٬٢٣٧ طلعوا «صفر»
// في الأداة، وحملات البحث والتطبيقات في نفس الحساب كانت مطابقة. فالصفوف بتيجي كلها، وstoreGaps بيعرف المفتاح اللي Google مصنّفش تحويلاته
export function storeRow(row) {
  const s = (row && row.segments) || {};
  return s.conversionAttributionEventType === 'INTERACTION' && STORE_LAGS.indexOf(s.conversionLagBucket) > -1;
}
// الأنواع اللي Google بيسمّيها فعلاً (وثائق ConversionAttributionEventType v24): نقرة، ظهور، مشاهدة ١٠ ثواني. UNKNOWN وUNSPECIFIED = مش مصنّف
const STORE_TYPES = ['INTERACTION', 'IMPRESSION', 'ENGAGED_VIEW'];
// صف «مصنّف»: Google قال نوعه ومدته — سواء اتحسب في «الأقرب للمتجر» أو لأ
export function storeKnown(row) {
  const s = (row && row.segments) || {};
  const lag = s.conversionLagBucket;
  return STORE_TYPES.indexOf(s.conversionAttributionEventType) > -1 && !!lag && lag !== 'UNKNOWN' && lag !== 'UNSPECIFIED';
}
function convOf(row) { const n = Number(row && row.metrics && row.metrics.conversions); return isFinite(n) && n > 0 ? n : 0; }
function round2(n) { return Math.round(n * 100) / 100; }
// المفاتيح اللي Google مصنّفش أغلب تحويلاتها: رقم المنصة (platRows) ناقص المصنّف من نفس المفتاح والمدى (segRows) أكبر من ١٠٪ (ونص تحويل
// على الأقل — كسور Google). المفتاح ده الأداة بتعرض رقم المنصة بتاعه من غير مقارنة، بدل «صفر» غلط. c = المصنّف، a = كل صفوفه المقسّمة
// (a = صفر يعني Google مرجّعش صفوف مقسّمة خالص للمفتاح ده، وa أكبر من c يعني رجّعها من غير نوع أو مدة)
export function storeGaps(platRows, segRows, keyOf) {
  const plat = {}, known = {}, all = {};
  const add = function (map, k, v) { map[k] = (map[k] || 0) + v; };
  (platRows || []).forEach(function (r) { const k = keyOf(r); if (k) add(plat, String(k), convOf(r)); });
  (segRows || []).forEach(function (r) {
    const k = keyOf(r);
    if (!k) return;
    add(all, String(k), convOf(r));
    if (storeKnown(r)) add(known, String(k), convOf(r));
  });
  return Object.keys(plat).filter(function (k) {
    const p = plat[k], c = known[k] || 0;
    return p > 0 && p - c > Math.max(0.5, 0.1 * p);
  }).map(function (k) { return { k: k, p: round2(plat[k]), c: round2(known[k] || 0), a: round2(all[k] || 0) }; });
}

// نص إعلان مش بحث (عرض، تطبيقات، فيديو، Demand Gen) — أول عنوان فيه. الحقول من وثائق ad_group_ad v24 (التدقيق الشامل ٢٦ نوفمبر ٢٠٢٦):
// من غيره كارت الإعلان كان بيتسمّى «Google #رقم». إعلانات الاتصال (CALL_AD) نصها مش متاح في v24 أصلاً
export const AD_TEXT_FIELDS = [
  'ad_group_ad.ad.responsive_display_ad.headlines', 'ad_group_ad.ad.responsive_display_ad.long_headline',
  'ad_group_ad.ad.app_ad.headlines', 'ad_group_ad.ad.video_responsive_ad.headlines',
  'ad_group_ad.ad.demand_gen_multi_asset_ad.headlines', 'ad_group_ad.ad.demand_gen_video_responsive_ad.headlines',
  'ad_group_ad.ad.demand_gen_carousel_ad.headline', 'ad_group_ad.ad.demand_gen_product_ad.headline'
];
export function adText(ad) {
  const a = ad || {};
  const first = function (list) { return Array.isArray(list) && list[0] && list[0].text ? String(list[0].text) : ''; };
  const one = function (asset) { return asset && asset.text ? String(asset.text) : ''; };
  const of = function (k) { return a[k] || {}; };
  return first(of('responsiveDisplayAd').headlines) || one(of('responsiveDisplayAd').longHeadline) || first(of('appAd').headlines) ||
    first(of('videoResponsiveAd').headlines) || first(of('demandGenMultiAssetAd').headlines) || first(of('demandGenVideoResponsiveAd').headlines) ||
    one(of('demandGenCarouselAd').headline) || one(of('demandGenProductAd').headline);
}

// رسالة الخطأ الحقيقية من Google بدل ما تتخبّى ورا "مفيش بيانات"
function firstDetail(data) {
  const e = Array.isArray(data) ? (data[0] && data[0].error) : (data && data.error);
  const detail = e && e.details && e.details[0] && e.details[0].errors && e.details[0].errors[0];
  return { e: e, detail: detail };
}
export function googleErrorMessage(data, status) {
  const f = firstDetail(data);
  if (!f.e) return 'HTTP ' + status;
  if (f.detail && f.detail.message) return f.detail.message;
  return f.e.message || ('HTTP ' + status);
}
// كود الخطأ نفسه (زي CUSTOMER_NOT_ENABLED) — عشان نفرّق "حساب مقفول" عن عطل حقيقي
// errorCode بيجي كده: { "authorizationError": "CUSTOMER_NOT_ENABLED" }
export function googleErrorCode(data) {
  const f = firstDetail(data);
  const code = f.detail && f.detail.errorCode;
  if (!code || typeof code !== 'object') return null;
  const key = Object.keys(code)[0];
  return key ? String(code[key]) : null;
}

// أرقام حسابات Google أرقام بس — بننضّفها من أي حاجة تانية عشان محدش يقدر يحقن مسار في الرابط
// أو سطر جديد في الهيدر عن طريق قيمة ملغومة
export function cleanCustomerId(id) {
  const clean = String(id == null ? '' : id).replace(/\D/g, '');
  return clean || null;
}

export function googleHeaders(developerToken, accessToken, loginCustomerId) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + accessToken
  };
  // اختياري من سبتمبر ٢٠٢٦ (Google بقت بتتجاهله) — بيتبعت بس لو متضبط
  if (developerToken) headers['developer-token'] = developerToken;
  const login = cleanCustomerId(loginCustomerId);
  if (login) headers['login-customer-id'] = login;
  return headers;
}

// مفتاح الإعلان عندنا: رقم المجموعة الإعلانية + رقم الإعلان (نفس الإعلان ممكن يتكرر في أكتر من مجموعة)
export function adKey(row) {
  const g = row && row.adGroup && row.adGroup.id;
  const a = row && row.adGroupAd && row.adGroupAd.ad && row.adGroupAd.ad.id;
  return g && a ? String(g) + '-' + String(a) : null;
}
// إعلانات صرفت في الفترة ومش موجودة في قائمة الإعلانات — غالباً اتحذفت (REMOVED) بعد ما صرفت.
// من غيرها صرفها كان بيختفي من الأرقام، فالإجمالي يطلع أقل من لوحة Google
export function missingSpendKeys(adRows, metricLists) {
  const have = new Set((adRows || []).map(adKey));
  const keys = new Set(), adIds = new Set();
  (metricLists || []).forEach(function (rows) {
    (rows || []).forEach(function (row) {
      const k = adKey(row);
      const cost = Number((row.metrics && row.metrics.costMicros) || 0);
      if (!k || cost <= 0 || have.has(k)) return;
      keys.add(k);
      adIds.add(String(row.adGroupAd.ad.id).replace(/\D/g, ''));
    });
  });
  return { keys: Array.from(keys), adIds: Array.from(adIds).filter(Boolean) };
}

// بيشغّل استعلام GAQL عن طريق searchStream وبيرجّع كل الصفوف في مصفوفة واحدة
export async function gaql(opts, query) {
  const customerId = cleanCustomerId(opts.customerId);
  if (!customerId) {
    const bad = new Error('رقم حساب Google Ads غير صالح.');
    bad.status = 400;
    throw bad;
  }
  const response = await fetch(GOOGLE_ADS_API + '/customers/' + customerId + '/googleAds:searchStream', {
    method: 'POST',
    headers: googleHeaders(opts.developerToken, opts.accessToken, opts.loginCustomerId),
    body: JSON.stringify({ query: query })
  });
  const data = await response.json().catch(function () { return null; });
  if (!response.ok) {
    const err = new Error(googleErrorMessage(data, response.status));
    err.status = response.status;
    err.code = googleErrorCode(data);
    throw err;
  }
  // رد ناجح بس مش مقروء، أو فيه خطأ في نص البث (searchStream بيبعت أجزاء — الجزء اللي فيه error معناه إن الباقي مجاش): الصفوف ناقصة،
  // وأرقام ناقصة من غير ما حد يعرف أسوأ من خطأ واضح (التدقيق الشامل ٢٦ نوفمبر ٢٠٢٦، ١٣٤). الاستعلامات الاختيارية بتمسك الخطأ لوحدها
  const chunks = Array.isArray(data) ? data : [data];
  const broken = data === null ? { error: { message: 'HTTP ' + response.status } } : chunks.filter(function (c) { return c && c.error; })[0];
  if (broken) {
    const err = new Error(googleErrorMessage([broken], 502));
    err.status = 502;
    // من غير رمز من Google = رسالة الأداة العامة («خطأ غير متوقع» — core.js SERVER_ERROR_KEYS) بدل «HTTP 200»
    err.code = googleErrorCode([broken]) || 'SERVER';
    throw err;
  }
  let rows = [];
  chunks.forEach(function (chunk) {
    if (chunk && chunk.results) rows = rows.concat(chunk.results);
  });
  return rows;
}
