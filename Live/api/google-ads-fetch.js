// نفس مجلد /api بتاع google-list-accounts.js
// المسار النهائي: https://<مشروعك>.vercel.app/api/google-ads-fetch
// بيستخدم نفس متغيّر البيئة GOOGLE_ADS_DEVELOPER_TOKEN

import { gaql } from './_google.js';
import { last7DaysRange } from './_dates.js';
import { guardRequest } from './_cors.js';

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    res.status(500).json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN غير مضبوط في إعدادات Vercel (Environment Variables).' });
    return;
  }

  const { accessToken, customerId, loginCustomerId, timeZone, clientTz } = req.body || {};
  if (!accessToken || !customerId) {
    res.status(400).json({ error: 'accessToken و customerId مطلوبين في جسم الطلب.' });
    return;
  }

  const range = last7DaysRange(timeZone || clientTz);
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
      ad_group.primary_status,
      campaign.primary_status,`;
  const adsQuery = (withPrimaryStatus) => `
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
    WHERE ad_group_ad.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
  `;
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

  try {
    // لو الحساب/الإصدار رفض حقول primary_status، بنرجع للاستعلام العادي بدل ما الإعلانات متحمّلش
    const adsRows = gaql(opts, adsQuery(true)).catch(function () { return gaql(opts, adsQuery(false)); });
    const results = await Promise.all([adsRows, gaql(opts, metricsQuery)]);
    res.status(200).json({ ads: results[0], metrics: results[1], range: range });
  } catch (err) {
    res.status(err && err.status ? err.status : 500).json({ error: String(err && err.message ? err.message : err) });
  }
}
