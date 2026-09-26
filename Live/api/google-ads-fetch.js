// المسار: https://adscenter.online/api/google-ads-fetch (بيشتغل جوه cloudflare/worker.js)
// GOOGLE_ADS_DEVELOPER_TOKEN اختياري: من ٩ سبتمبر ٢٠٢٦ Google بتحدد الصلاحية من مشروع Google Cloud
// اللي طلع منه مفتاح الدخول، والـ developer token لو اتبعت بيتجاهل (بنسيبه لو موجود للتوافق)

import { gaql, adKey, missingSpendKeys } from './_google.js';
import { last7DaysRange, resolvePeriod } from './_dates.js';
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

  try {
    // مجاميع الفترة المختارة: صف واحد لكل إعلان (من غير تقسيم بالأيام). آخر ٧ أيام مش محتاجة طلب إضافي
    const periodQuery = `
      SELECT ad_group.id, ad_group_ad.ad.id, metrics.cost_micros, metrics.conversions, metrics.conversions_value
      FROM ad_group_ad
      WHERE segments.date BETWEEN '${periodRange.since}' AND '${periodRange.until}'
    `;
    const periodRows = periodRange.isDefault ? Promise.resolve(null) : gaql(opts, periodQuery).catch(function () { return null; });
    // فشل استعلامات PMax مش بيوقف تحميل الإعلانات — بيرجع كملاحظة في الواجهة
    const pmaxDaily = pmaxRows(range.since, range.until, true).catch(function (err) { return { error: String(err && err.message ? err.message : err) }; });
    const pmaxPeriod = periodRange.isDefault ? Promise.resolve(null) : pmaxRows(periodRange.since, periodRange.until, false).catch(function () { return null; });

    const results = await Promise.all([adsWhere(ACTIVE_ONLY), gaql(opts, metricsQuery), periodRows, pmaxDaily, pmaxPeriod]);
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

    const pmax = results[3];
    res.status(200).json({
      ads: ads, metrics: results[1], periodMetrics: results[2],
      pmax: Array.isArray(pmax) ? pmax : null,
      pmaxPeriod: Array.isArray(results[4]) ? results[4] : null,
      pmaxError: pmax && !Array.isArray(pmax) ? pmax.error : null,
      range: range, period: periodRange
    });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: String(err && err.message ? err.message : err), code: (err && err.code) || null });
  }
}
