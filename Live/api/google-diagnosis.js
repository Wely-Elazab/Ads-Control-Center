// المسار: https://adscenter.online/api/google-diagnosis (بيشتغل جوه cloudflare/worker.js)
// أرقام ملخص المتجر من Google Ads (قراءة بس): الحساب يوم بيوم + تقسيماته (الحملة، الدولة، الجهاز، الشبكة)
// بالشكل اللي محرك التشخيص (js/diagnosis.js) بيستناه. ١٠ استعلامات GAQL بالتوازي — أي تقسيم استعلامه
// فشل بيتشال لوحده (والمحرك بيشتغل بالباقي)، لكن الأرقام اليومية للحساب لازم تنجح وإلا الطلب كله بيفشل.
//
// مراحل الشراء في Google = «فئات التحويل»: PURCHASE (الشراء)، ADD_TO_CART (الإضافة للسلة)، BEGIN_CHECKOUT (بدء الدفع).
// الشراء من «التحويلات» الأساسية (نفس عمود Conversions في Google Ads) — ولو الحساب حاطط الشراء كإجراء ثانوي
// (أساسي = صفر وكل التحويلات > صفر) بنرجع لـ «كل التحويلات». السلة وبدء الدفع من «كل التحويلات» دايماً،
// لأنهم غالباً إجراءات ثانوية مش بيتحسّن عليها. لم يُختبر على حساب Google حقيقي بعد.
//
// التحويلات على «الأقرب للمتجر» زي الإعلانات (_google.js): الحساب يوم بيوم والحملات والشبكة. الجهاز والدولة Google
// مبيسمحش فيهم بالتقسيمين، فبيفضلوا بأرقام المنصة — والمحرك بيوقف تحليل الطلبات عليهم لوحده لو مطلعوش مطابقين للإجمالي.
// لو استعلام الحساب اليومي رفض الفلتر، الملخص كله بيرجع لأرقام المنصة (قرار واحد عشان المصادر متتلخبطش)

import { gaql, STORE_SEGMENTS, STORE_FILTER, storeRow } from './_google.js';
import { guardRequest } from './_cors.js';
import { verifyGoogleToken, sendVerifyFailure } from './_verify.js';
import { text, shaped, TOKEN_MAX, badRequest } from './_input.js';
import { dxRanges, windowsSpan, dxSegments, dxDaily, wholeCounts } from './_dx.js';

const CUSTOMER_ID = /^[\d-]{1,32}$/;
// الدولة في Google رقم «معيار جغرافي» = ٢٠٠٠ + الرقم الدولي للدولة (ISO 3166). بنحوّل الشائع منها لرمز الدولة،
// والباقي بيفضل برقمه (بيتعرض كرقم — أحسن من اسم غلط)
const COUNTRY_BY_CRITERION = {
  2682: 'SA', 2414: 'KW', 2784: 'AE', 2634: 'QA', 2048: 'BH', 2512: 'OM', 2818: 'EG', 2400: 'JO', 2422: 'LB', 2368: 'IQ',
  2504: 'MA', 2012: 'DZ', 2788: 'TN', 2434: 'LY', 2887: 'YE', 2760: 'SY', 2275: 'PS', 2840: 'US', 2826: 'GB', 2276: 'DE',
  2250: 'FR', 2792: 'TR', 2356: 'IN', 2586: 'PK'
};
const CATEGORY_FIELD = { PURCHASE: 'pur', ADD_TO_CART: 'atc', BEGIN_CHECKOUT: 'ic' };

function micros(v) { const n = Number(v); return isFinite(n) ? n / 1e6 : 0; }
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

// هدف الحملة (js/diagnosis.js بيحكم بالطلبات على sales وtraffic بس): الدفع مقابل الظهور أو المشاهدة = وعي
// (فيديو يوتيوب أو شبكة إعلانية)، حملات التطبيقات = تطبيق، و«أقصى عدد نقرات» = زيارات.
// أي حاجة تانية (تحسين للتحويلات، Performance Max، تسوّق، CPC يدوي) = مبيعات زي الأول
const AWARENESS_BIDDING = { TARGET_CPM: 1, MANUAL_CPM: 1, FIXED_CPM: 1, TARGET_CPV: 1, MANUAL_CPV: 1, FIXED_SHARE_OF_VOICE: 1 };
export function googleGoal(c) {
  const ch = c && c.advertisingChannelType, bid = c && c.biddingStrategyType;
  if (ch === 'MULTI_CHANNEL') return 'app';
  if (AWARENESS_BIDDING[bid]) return 'awareness';
  if (bid === 'TARGET_SPEND') return 'traffic';
  return 'sales';
}

// التقسيمات: from = الجدول، key/name/goal = إزاي نطلّع مفتاح الجزء واسمه وهدفه من الصف
const DIMS = [
  { id: 'campaign', from: 'campaign', store: true, select: 'campaign.id, campaign.name, campaign.advertising_channel_type, campaign.bidding_strategy_type',
    key: function (r) { return r.campaign && r.campaign.id; }, name: function (r) { return r.campaign && r.campaign.name; },
    goal: function (r) { return googleGoal(r.campaign); } },
  { id: 'gDevice', from: 'customer', select: 'segments.device',
    key: function (r) { return r.segments && r.segments.device; } },
  { id: 'network', from: 'customer', store: true, select: 'segments.ad_network_type',
    key: function (r) { return r.segments && r.segments.adNetworkType; } },
  { id: 'country', from: 'user_location_view', select: 'user_location_view.country_criterion_id',
    key: function (r) {
      const id = r.userLocationView && r.userLocationView.countryCriterionId;
      return id ? (COUNTRY_BY_CRITERION[Number(id)] || String(id)) : null;
    } }
];

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;
  const body = req.body || {};
  const accessToken = text(body.accessToken, TOKEN_MAX);
  const customerId = shaped(body.customerId, CUSTOMER_ID);
  const ranges = dxRanges(body);
  if (!accessToken || !customerId || !ranges) { badRequest(res, 'الحقول accessToken وcustomerId وdaily وwindows مطلوبة وبتواريخ صحيحة.'); return; }
  const verified = await verifyGoogleToken(accessToken);
  if (!verified.ok) { sendVerifyFailure(res, verified); return; }

  const opts = { developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || null, accessToken: accessToken, customerId: customerId,
    loginCustomerId: shaped(body.loginCustomerId, CUSTOMER_ID) };
  const between = function (r) { return "segments.date BETWEEN '" + r.since + "' AND '" + r.until + "'"; };
  const span = windowsSpan(ranges.windows);
  const costQuery = function (select, from, r) {
    return 'SELECT segments.date, ' + (select ? select + ', ' : '') + 'metrics.cost_micros, metrics.impressions, metrics.clicks FROM ' + from + ' WHERE ' + between(r);
  };
  const convQuery = function (select, from, r, store) {
    return 'SELECT segments.date, ' + (select ? select + ', ' : '') + 'segments.conversion_action_category, ' + (store ? STORE_SEGMENTS + ', ' : '') +
      'metrics.conversions, metrics.all_conversions, metrics.conversions_value, metrics.all_conversions_value FROM ' + from + ' WHERE ' + between(r) +
      " AND segments.conversion_action_category IN ('PURCHASE', 'ADD_TO_CART', 'BEGIN_CHECKOUT')" + (store ? STORE_FILTER : '');
  };
  const conv = function (select, from, r, store) {
    return store ? gaql(opts, convQuery(select, from, r, true)).then(function (rows) { return rows.filter(storeRow); }) : gaql(opts, convQuery(select, from, r, false));
  };

  try {
    const costDaily = gaql(opts, costQuery('', 'customer', ranges.daily));
    costDaily.catch(function () {});   // الخطأ بيتعامل معاه تحت (await) — ده بس عشان ميتسجّلش «رفض من غير معالجة» وإحنا مستنيين التحويلات
    const runDims = function (store) {
      return DIMS.map(function (d) {
        return Promise.all([gaql(opts, costQuery(d.select, d.from, span)), conv(d.select, d.from, span, store && d.store)])
          .catch(function (e) { return { error: String(e && e.message ? e.message : e) }; });
      });
    };
    let store = true, dimPs = runDims(true);
    let convDaily = await conv('', 'customer', ranges.daily, true).catch(function () { store = false; return null; });
    if (!store) { dimPs = runDims(false); convDaily = await conv('', 'customer', ranges.daily, false); }
    const dailyRes = [await costDaily, convDaily];
    const dimRes = await Promise.all(dimPs);

    // الشراء أساسي ولا ثانوي في الحساب ده؟ (من الأرقام اليومية كلها)
    let primary = 0, all = 0;
    dailyRes[1].forEach(function (r) {
      if (r.segments && r.segments.conversionActionCategory === 'PURCHASE') { primary += num(r.metrics && r.metrics.conversions); all += num(r.metrics && r.metrics.allConversions); }
    });
    const usePrimary = primary > 0;
    const toRows = function (cost, conv, keyFn, nameFn, goalFn) {
      const out = [];
      cost.forEach(function (r) {
        const m = r.metrics || {};
        out.push({ date: r.segments && r.segments.date, key: keyFn ? keyFn(r) : 'all', name: nameFn ? nameFn(r) : null, goal: goalFn ? goalFn(r) : null,
          spend: micros(m.costMicros), imp: num(m.impressions), clicks: num(m.clicks) });
      });
      conv.forEach(function (r) {
        const m = r.metrics || {}, cat = r.segments && r.segments.conversionActionCategory, f = CATEGORY_FIELD[cat];
        if (!f) return;
        const row = { date: r.segments && r.segments.date, key: keyFn ? keyFn(r) : 'all', name: nameFn ? nameFn(r) : null, goal: goalFn ? goalFn(r) : null };
        if (f === 'pur') {
          row.pur = usePrimary ? num(m.conversions) : num(m.allConversions);
          row.rev = usePrimary ? num(m.conversionsValue) : num(m.allConversionsValue);
        } else row[f] = num(m.allConversions);
        out.push(row);
      });
      return out;
    };
    const dims = [];
    DIMS.forEach(function (d, i) {
      const r = dimRes[i];
      if (!Array.isArray(r)) return;
      dims.push({ id: d.id, segs: dxSegments(toRows(r[0], r[1], d.key, d.name, d.goal), ranges.windows) });
    });
    // الطلبات والسلة وبدء الدفع أعداد صحيحة — Google بيرجّعها كسور (_dx.js wholeCounts)
    const daily = dxDaily(toRows(dailyRes[0], dailyRes[1]));
    wholeCounts(daily, dims, ['pur', 'atc', 'ic']);
    res.status(200).json({
      daily: daily,
      dims: dims,
      purchases: usePrimary ? 'primary' : (all > 0 ? 'all' : 'none'),
      numbers: store ? 'store' : 'platform',
      dimErrors: DIMS.map(function (d, i) { return Array.isArray(dimRes[i]) ? null : { id: d.id, error: dimRes[i].error }; }).filter(Boolean)
    });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: String(err && err.message ? err.message : err), code: (err && err.code) || null });
  }
}
