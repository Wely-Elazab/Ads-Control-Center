// نفس مجلد /api
// المسار النهائي: https://<مشروعك>.vercel.app/api/snapchat-ads-fetch
// بيستقبل action='accounts' لجلب قائمة الحسابات، أو action='ads' لجلب إعلانات حساب معيّن

import { last7DaysRange, shiftDateKey, tzOffsetString } from './_dates.js';
import { guardRequest } from './_cors.js';

const SNAP_API = 'https://adsapi.snapchat.com/v1';
const MAX_PAGES = 20; // حد أمان للتصفّح (1000 إعلان في الصفحة)

function snapError(data, status) {
  return (data && (data.debug_message || data.display_message || data.error_description || data.error)) || ('HTTP ' + status);
}

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const { accessToken, action, adAccountId, clientTz } = req.body || {};
  if (!accessToken || !action) {
    res.status(400).json({ error: 'accessToken و action مطلوبين في جسم الطلب.' });
    return;
  }

  const headers = { 'Authorization': 'Bearer ' + accessToken };

  try {
    if (action === 'accounts') {
      const r = await fetch(SNAP_API + '/me/organizations?with_ad_accounts=true', { headers: headers });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    if (action === 'ads') {
      if (!adAccountId) { res.status(400).json({ error: 'adAccountId مطلوب لجلب الإعلانات.' }); return; }
      const accountPath = SNAP_API + '/adaccounts/' + encodeURIComponent(adAccountId);

      // توقيت الحساب نفسه — Snapchat بيرفض أي start_time/end_time مش على بداية يوم بتوقيت الحساب
      const accResp = await fetch(accountPath, { headers: headers });
      const accData = await accResp.json().catch(function () { return null; });
      const acc = accData && accData.adaccounts && accData.adaccounts[0] && accData.adaccounts[0].adaccount;
      const tz = (acc && acc.timezone) || clientTz;

      // كل الإعلانات مع التصفّح (الافتراضي كان صفحة واحدة بس)
      let ads = [];
      let url = accountPath + '/ads?limit=1000';
      for (let page = 0; url && page < MAX_PAGES; page++) {
        const r = await fetch(url, { headers: headers });
        const data = await r.json().catch(function () { return null; });
        if (!r.ok || !data || data.request_status === 'ERROR') {
          res.status(r.ok ? 502 : r.status).json({ error: snapError(data, r.status) });
          return;
        }
        (data.ads || []).forEach(function (item) { if (item && item.ad) ads.push(item.ad); });
        url = data.paging && data.paging.next_link;
      }

      // نهاية النطاق حصرية: بداية اليوم اللي بعد النهارده
      const range = last7DaysRange(tz);
      const endKey = shiftDateKey(range.until, 1);
      const startTime = range.since + 'T00:00:00.000' + tzOffsetString(range.since, tz);
      const endTime = endKey + 'T00:00:00.000' + tzOffsetString(endKey, tz);
      const statsUrl = accountPath + '/stats' +
        '?granularity=DAY&breakdown=ad&fields=spend,swipes,impressions' +
        '&start_time=' + encodeURIComponent(startTime) + '&end_time=' + encodeURIComponent(endTime);
      const statsResp = await fetch(statsUrl, { headers: headers });
      const statsData = await statsResp.json().catch(function () { return null; });
      const statsError = (!statsResp.ok || (statsData && statsData.request_status === 'ERROR')) ? snapError(statsData, statsResp.status) : null;

      res.status(200).json({
        ads: ads,
        stats: statsError ? null : statsData,
        statsError: statsError,
        range: range,
        account: acc ? { timezone: acc.timezone || null, currency: acc.currency || null } : null
      });
      return;
    }

    res.status(400).json({ error: 'action غير معروف — استخدم accounts أو ads.' });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
