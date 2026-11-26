// المسار: https://adscenter.online/api/google-ads-fetch (بيشتغل جوه cloudflare/worker.js)
// GOOGLE_ADS_DEVELOPER_TOKEN اختياري: من ٩ سبتمبر ٢٠٢٦ Google بتحدد الصلاحية من مشروع Google Cloud
// اللي طلع منه مفتاح الدخول، والـ developer token لو اتبعت بيتجاهل (بنسيبه لو موجود للتوافق)

import { gaql, adKey, missingSpendKeys, STORE_SEGMENTS, storeRow, storeGaps, AD_TEXT_FIELDS, adText, changeActions, CHANGE_LIMIT } from './_google.js';
import { last7DaysRange, resolvePeriod, isDateKey, daysBetweenKeys, todayKeyInTz, shiftDateKey, tzOffsetString } from './_dates.js';
import { guardRequest } from './_cors.js';
import { verifyGoogleToken, sendVerifyFailure } from './_verify.js';
import { text, shaped, periodOf, TOKEN_MAX, badRequest } from './_input.js';

// أرقام حسابات Google: أرقام بس (وممكن بشرطات 123-456-7890)
const CUSTOMER_ID = /^[\d-]{1,32}$/;

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || null;

  const body = req.body || {};
  const accessToken = text(body.accessToken, TOKEN_MAX);
  const customerId = shaped(body.customerId, CUSTOMER_ID);
  if (!accessToken || !customerId) { badRequest(res, 'الحقلان accessToken وcustomerId مطلوبان في جسم الطلب.'); return; }
  const loginCustomerId = shaped(body.loginCustomerId, CUSTOMER_ID);
  const timeZone = text(body.timeZone, 64), clientTz = text(body.clientTz, 64);
  const period = periodOf(body.period);

  // التوكن لازم يكون صادر لتطبيقنا — من غير كده أي حد يستهلك حصة تطبيقنا
  const verified = await verifyGoogleToken(accessToken);
  if (!verified.ok) { sendVerifyFailure(res, verified); return; }

  const range = last7DaysRange(timeZone || clientTz);
  // الفترة اللي المستخدم اختارها للأرقام (الصرف والنتائج) — التنبيهات بتفضل على آخر ٧ أيام دايماً
  const periodRange = resolvePeriod(period, timeZone || clientTz);
  const opts = { developerToken, accessToken, customerId, loginCustomerId };

  // لوحة «ما حققته مع الأداة» (Google دخلها ٢٦ نوفمبر ٢٠٢٦): سجل التعديلات وأرقام إعلانات محددة يوم بيوم — طلب صغير لكل واحد من غير
  // استعلامات الإعلانات الكبيرة تحت
  if (body.action === 'changes') { await sendChanges(res, opts, timeZone || clientTz, body.since); return; }
  if (body.action === 'daily') { await sendDaily(res, opts, body); return; }

  // استعلامين منفصلين عن قصد:
  // 1) كل الإعلانات (غير المحذوفة) بحالتها — من غير segments.date، لأن أي استعلام فيه تاريخ
  //    بيرجّع بس الإعلانات اللي ليها نشاط، فالإعلان المتوقف اللي مصرفش حاجة كان بيختفي خالص
  // 2) المقاييس اليومية لآخر 7 أيام شاملة النهارده بتوقيت الحساب
  // ملاحظة: metrics.cost_micros بالمايكرو — لازم تُقسم على 1,000,000 عشان توصل للقيمة الفعلية بالعملة
  // primary_status: حالة التشغيل الفعلية زي عمود Status في Google Ads — بتكشف إعلان/حملة
  // حالتها ENABLED بس مش شغّالة فعلاً (مدة الحملة خلصت، لسه مبدأتش، أو غير مؤهلة بسبب الدفع/السياسات)
  const statusFields = `
      ad_group_ad.primary_status,
      ad_group_ad.primary_status_reasons,
      ad_group.primary_status,
      campaign.primary_status,`;
  const ACTIVE_ONLY = `ad_group_ad.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND campaign.status != 'REMOVED'`;
  const adsQuery = (withPrimaryStatus, where) => `
    SELECT${withPrimaryStatus ? statusFields : ''}
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.status,
      ad_group_ad.policy_summary.approval_status,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.expanded_text_ad.headline_part1,
      ad_group_ad.ad.expanded_text_ad.description,
      ad_group_ad.ad.image_ad.image_url,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      campaign.id,
      campaign.name,
      campaign.status
    FROM ad_group_ad
    WHERE ${where}
  `;
  // لو الحساب/الإصدار رفض حقول primary_status، بنرجع للاستعلام العادي بدل ما الإعلانات متحمّلش
  const adsWhere = (where) => gaql(opts, adsQuery(true, where)).catch(function () { return gaql(opts, adsQuery(false, where)); });
  const metricsQuery = `
    SELECT
      ad_group.id,
      ad_group_ad.ad.id,
      segments.date,
      metrics.cost_micros,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${range.since}' AND '${range.until}'
  `;

  // حملات Performance Max مفيهاش مجموعات إعلانية ولا إعلانات (ad_group_ad) — Google بتوزّع ميزانيتها
  // على كل أماكن الظهور ومبترجّعش أرقام كل إعلان لوحده. من غير الاستعلام ده صرفها كان بيختفي خالص
  // من الأداة، فالإجمالي بيطلع أقل من لوحة Google. بنجيبها على مستوى الحملة (صف لكل حملة × يوم)،
  // ومعاها اسمها وحالتها — فحملة PMax بتظهر لو صرفت في آخر ٧ أيام أو في الفترة المختارة
  const pmaxQuery = (withPrimaryStatus, since, until, daily) => `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,${withPrimaryStatus ? `
      campaign.primary_status,
      campaign.primary_status_reasons,` : ''}${daily ? `
      segments.date,` : ''}
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND segments.date BETWEEN '${since}' AND '${until}'
  `;
  const pmaxRows = (since, until, daily) => gaql(opts, pmaxQuery(true, since, until, daily))
    .catch(function () { return gaql(opts, pmaxQuery(false, since, until, daily)); });

  // «الأقرب للمتجر» جنب أرقام المنصة (_google.js): استعلامات تحويلات بس، للإعلانات ولحملات PMax، لآخر ٧ أيام
  // وللفترة المختارة. فشلها = null، والأداة بتعرض رقم المنصة زي الأول من غير مقارنة.
  // من غير فلتر النوع والمدة في WHERE (التدقيق الشامل ٢٦ نوفمبر ٢٠٢٦): الصفوف كلها بتيجي، وstoreRow بيفلترها هنا (onlyStore)،
  // وstoreGaps بيقارنها برقم المنصة لنفس المفتاح — المفتاح اللي Google مصنّفش تحويلاته بيرجع في storeUncovered
  const storeQuery = (from, select, since, until, daily, where) => `
    SELECT ${select},${daily ? ' segments.date,' : ''} ${STORE_SEGMENTS}, metrics.conversions, metrics.conversions_value
    FROM ${from}
    WHERE segments.date BETWEEN '${since}' AND '${until}'${where || ''}
  `;
  const segRows = (query) => gaql(opts, query).catch(function () { return null; });
  const onlyStore = (rows) => Array.isArray(rows) ? rows.filter(storeRow) : null;
  const PMAX_ONLY = " AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'";
  const campOf = (row) => row && row.campaign && row.campaign.id;
  // نص الإعلانات اللي مش بحث (_google.js adText): استعلام لوحده عشان أي حقل يترفض ميوقفش الإعلانات — فشله = الاسم الاحتياطي زي الأول
  const textsQuery = 'SELECT ad_group.id, ad_group_ad.ad.id, ' + AD_TEXT_FIELDS.join(', ') + ' FROM ad_group_ad WHERE ' + ACTIVE_ONLY;

  try {
    // مجاميع الفترة المختارة: صف واحد لكل إعلان (من غير تقسيم بالأيام). آخر ٧ أيام مش محتاجة طلب إضافي
    const periodQuery = `
      SELECT ad_group.id, ad_group_ad.ad.id, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM ad_group_ad
      WHERE segments.date BETWEEN '${periodRange.since}' AND '${periodRange.until}'
    `;
    const periodRows = periodRange.isDefault ? Promise.resolve(null) : gaql(opts, periodQuery).catch(function () { return null; });
    // الفترة يوم بيوم لكل إعلان (٣ نوفمبر ٢٠٢٦ — تقييم الإعلان على الفترة نفسها، js/google.js pd)، و«الأقرب للمتجر» بنفس الأيام.
    // المجموع فوق بيفضل زي ما هو للكروت (Google بيرجّع كسور طلبات، وتقسيمها على الأيام والإعلانات بيتعمل في الأداة)
    const periodDailyQuery = `
      SELECT ad_group.id, ad_group_ad.ad.id, segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM ad_group_ad
      WHERE segments.date BETWEEN '${periodRange.since}' AND '${periodRange.until}'
    `;
    const periodDaily = periodRange.isDefault ? Promise.resolve(null) : gaql(opts, periodDailyQuery).catch(function () { return null; });
    const periodStoreDaily = periodRange.isDefault ? Promise.resolve(null)
      : segRows(storeQuery('ad_group_ad', 'ad_group.id, ad_group_ad.ad.id', periodRange.since, periodRange.until, true));
    // فشل استعلامات PMax مش بيوقف تحميل الإعلانات — بيرجع كملاحظة في الواجهة
    const pmaxDaily = pmaxRows(range.since, range.until, true).catch(function (err) { return { error: String(err && err.message ? err.message : err) }; });
    const pmaxPeriod = periodRange.isDefault ? Promise.resolve(null) : pmaxRows(periodRange.since, periodRange.until, false).catch(function () { return null; });
    // PMax يوم بيوم للفترة كمان (٣ نوفمبر ٢٠٢٦ — نفس سبب الإعلانات فوق: حكم الحملة على أيام الفترة نفسها)
    const pmaxPeriodDaily = periodRange.isDefault ? Promise.resolve(null) : pmaxRows(periodRange.since, periodRange.until, true).catch(function () { return null; });

    const custom = !periodRange.isDefault;
    const store = Promise.all([
      segRows(storeQuery('ad_group_ad', 'ad_group.id, ad_group_ad.ad.id', range.since, range.until, true)),
      custom ? segRows(storeQuery('ad_group_ad', 'ad_group.id, ad_group_ad.ad.id', periodRange.since, periodRange.until, false)) : null,
      segRows(storeQuery('campaign', 'campaign.id', range.since, range.until, true, PMAX_ONLY)),
      custom ? segRows(storeQuery('campaign', 'campaign.id', periodRange.since, periodRange.until, false, PMAX_ONLY)) : null,
      custom ? segRows(storeQuery('campaign', 'campaign.id', periodRange.since, periodRange.until, true, PMAX_ONLY)) : null
    ]);
    const texts = gaql(opts, textsQuery).catch(function () { return null; });

    const results = await Promise.all([adsWhere(ACTIVE_ONLY), gaql(opts, metricsQuery), periodRows, pmaxDaily, pmaxPeriod, store, periodDaily, periodStoreDaily, pmaxPeriodDaily, texts]);
    let ads = results[0];

    // إعلانات اتحذفت بعد ما صرفت في الفترة: بنجيبها برقمها (حتى لو محذوفة) عشان صرفها يتحسب.
    // دفعات ٥٠٠ رقم في الاستعلام. فشلها مش بيوقف التحميل
    const missing = missingSpendKeys(ads, [results[1], results[2]]);
    if (missing.adIds.length) {
      const wanted = new Set(missing.keys);
      for (let i = 0; i < missing.adIds.length; i += 500) {
        const chunk = missing.adIds.slice(i, i + 500);
        const extra = await adsWhere('ad_group_ad.ad.id IN (' + chunk.join(', ') + ')').catch(function () { return []; });
        ads = ads.concat(extra.filter(function (row) { return wanted.has(adKey(row)); }));
      }
    }

    const pmax = results[3], st = results[5];
    // المفاتيح اللي Google مصنّفش أغلب تحويلاتها في الأسبوع أو في الفترة (_google.js storeGaps): الإعلانات بمفتاح المجموعة-الإعلان،
    // وحملات PMax برقم الحملة (مفيش تداخل: مفتاح الإعلان فيه شرطة). الأسبوع الأول لو المفتاح اتكرر
    const gaps = [].concat(
      st[0] ? storeGaps(results[1], st[0], adKey) : [],
      st[1] && Array.isArray(results[2]) ? storeGaps(results[2], st[1], adKey) : [],
      st[2] && Array.isArray(pmax) ? storeGaps(pmax, st[2], campOf) : [],
      st[3] && Array.isArray(results[4]) ? storeGaps(results[4], st[3], campOf) : []
    );
    const gapSeen = {};
    const storeUncovered = gaps.filter(function (g) { if (gapSeen[g.k]) return false; gapSeen[g.k] = true; return true; });
    const adTexts = {};
    (results[9] || []).forEach(function (row) {
      const k = adKey(row), txt = adText(row.adGroupAd && row.adGroupAd.ad);
      if (k && txt) adTexts[k] = txt.slice(0, 300);
    });
    res.status(200).json({
      ads: ads, metrics: results[1], periodMetrics: results[2],
      pmax: Array.isArray(pmax) ? pmax : null,
      pmaxPeriod: Array.isArray(results[4]) ? results[4] : null,
      pmaxError: pmax && !Array.isArray(pmax) ? pmax.error : null,
      // «الأقرب للمتجر»: الفترة بتيجي بس لو أرقام المنصة للفترة نفسها رجعت (عشان المقارنة تبقى على نفس الأيام)
      storeMetrics: onlyStore(st[0]), storePeriodMetrics: results[2] ? onlyStore(st[1]) : null,
      storePmax: Array.isArray(pmax) ? onlyStore(st[2]) : null, storePmaxPeriod: Array.isArray(results[4]) ? onlyStore(st[3]) : null,
      periodDaily: Array.isArray(results[6]) ? results[6] : null, storePeriodDaily: Array.isArray(results[6]) ? onlyStore(results[7]) : null,
      pmaxPeriodDaily: Array.isArray(results[8]) ? results[8] : null, storePmaxPeriodDaily: Array.isArray(results[8]) ? onlyStore(st[4]) : null,
      storeUncovered: storeUncovered, adTexts: adTexts,
      range: range, period: periodRange
    });
  } catch (err) {
    sendError(res, err);
  }
}

// خطأ من Google نفسها (gaql بيحط حالته ورمزه) بيرجع بنصه عشان الأداة تشرحه؛ أي خطأ تاني غير متوقع من غير نصه الداخلي في الرد —
// زي باقي ملفات الخادم (OWASP ASVS 7.4.1، التدقيق الشامل ١١ نوفمبر ٢٠٢٦)
function sendError(res, err) {
  if (err && err.status) res.status(err.status).json({ error: String(err.message || err), code: err.code || null });
  else res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم.', code: 'SERVER' });
}

// سجل التعديلات (change_event — _google.js changeActions): من since لحد بكرة بتوقيت الحساب، ومش أقدم من آخر ٣٠ يوم (حد Google نفسها).
// من غير بريد اللي عمل التعديل (change_event.user_email) — اللوحة محتاجة نوع التعديل ووقته بس. complete = false لو الحد اتملا (تعديلات أكتر
// من اللي رجع) — ساعتها الأداة متقولش «لم يتصرّف» على حاجة
async function sendChanges(res, opts, tz, sinceWanted) {
  const today = todayKeyInTz(tz), floor = shiftDateKey(today, -29);
  const since = isDateKey(sinceWanted) && sinceWanted > floor ? sinceWanted : floor, until = shiftDateKey(today, 1);
  const query = 'SELECT change_event.change_date_time, change_event.change_resource_type, change_event.change_resource_name, ' +
    'change_event.resource_change_operation, change_event.changed_fields, change_event.old_resource, change_event.new_resource, ' +
    'change_event.campaign, change_event.ad_group FROM change_event ' +
    "WHERE change_event.change_date_time >= '" + since + "' AND change_event.change_date_time <= '" + until + "' " +
    'ORDER BY change_event.change_date_time DESC LIMIT ' + CHANGE_LIMIT;
  try {
    const rows = await gaql(opts, query);
    const offsets = {};
    const offsetOf = function (d) { return offsets[d] || (offsets[d] = tzOffsetString(d, tz)); };
    const changes = [].concat.apply([], rows.map(function (row) { return changeActions(row, offsetOf); }));
    res.status(200).json({ changes: changes, since: since, complete: rows.length < CHANGE_LIMIT });
  } catch (err) { sendError(res, err); }
}

// أرقام إعلانات وحملات PMax محددة يوم بيوم (لمشكلات أيامها برّه أرقام الكارت): adKeys = «المجموعة-الإعلان»، وcampaignIds = حملات PMax.
// ← { daily: { المفتاح: { 'YYYY-MM-DD': { spend, results, sales } } } } — المدى ٩٣ يوم بالكتير، و٥٠٠ مفتاح من كل نوع
const AD_KEY = /^\d{1,20}-\d{1,20}$/, CAMP_ID = /^\d{1,20}$/;
async function sendDaily(res, opts, body) {
  const since = body.since, until = body.until;
  const pick = function (list, re) { return Array.isArray(list) ? list.filter(function (x) { return typeof x === 'string' && re.test(x); }).slice(0, 500) : []; };
  const adKeys = pick(body.adKeys, AD_KEY), campIds = pick(body.campaignIds, CAMP_ID);
  if (!isDateKey(since) || !isDateKey(until) || since > until || daysBetweenKeys(since, until) > 92 || (!adKeys.length && !campIds.length)) {
    badRequest(res, 'الفترة أو أرقام الإعلانات غير صالحة.');
    return;
  }
  const between = "segments.date BETWEEN '" + since + "' AND '" + until + "'";
  const adIds = adKeys.map(function (k) { return k.split('-')[1]; }).filter(function (id, i, a) { return a.indexOf(id) === i; });
  try {
    const parts = await Promise.all([
      adIds.length ? gaql(opts, 'SELECT ad_group.id, ad_group_ad.ad.id, segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value ' +
        'FROM ad_group_ad WHERE ' + between + ' AND ad_group_ad.ad.id IN (' + adIds.join(', ') + ')') : [],
      campIds.length ? gaql(opts, 'SELECT campaign.id, segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value ' +
        'FROM campaign WHERE ' + between + ' AND campaign.id IN (' + campIds.join(', ') + ')') : []
    ]);
    const daily = {}, wantAds = {};
    adKeys.forEach(function (k) { wantAds[k] = true; });
    const add = function (key, row) {
      const date = row.segments && row.segments.date, m = row.metrics || {};
      if (!key || !isDateKey(date)) return;
      const byDay = daily[key] = daily[key] || {};
      const d = byDay[date] = byDay[date] || { spend: 0, results: 0, sales: 0 };
      d.spend += Number(m.costMicros || 0) / 1e6; d.results += Number(m.conversions || 0); d.sales += Number(m.conversionsValue || 0);
    };
    parts[0].forEach(function (row) { const k = adKey(row); if (k && wantAds[k]) add(k, row); });
    parts[1].forEach(function (row) { add(row.campaign && row.campaign.id ? String(row.campaign.id) : null, row); });
    res.status(200).json({ daily: daily });
  } catch (err) { sendError(res, err); }
}
