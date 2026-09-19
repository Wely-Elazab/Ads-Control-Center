// نفس مجلد /api
// المسار النهائي: https://<مشروعك>.vercel.app/api/snapchat-ads-fetch
// بيستقبل action='accounts' لجلب قائمة الحسابات، أو action='ads' لجلب إعلانات حساب معيّن

import { last7DaysRange, shiftDateKey, tzOffsetString, resolvePeriod } from './_dates.js';
import { guardRequest } from './_cors.js';

const SNAP_API = 'https://adsapi.snapchat.com/v1';
const MAX_PAGES = 20; // حد أمان للتصفّح (1000 إعلان في الصفحة)

function snapError(data, status) {
  return (data && (data.debug_message || data.display_message || data.error_description || data.error)) || ('HTTP ' + status);
}

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const { accessToken, action, adAccountId, clientTz, period } = req.body || {};
  if (!accessToken || !action) {
    res.status(400).json({ error: 'accessToken و action مطلوبين في جسم الطلب.', code: 'BAD_REQUEST' });
    return;
  }

  const headers = { 'Authorization': 'Bearer ' + accessToken };

  try {
    if (action === 'accounts') {
      const r = await fetch(SNAP_API + '/me/organizations?with_ad_accounts=true', { headers: headers });
      const data = await r.json().catch(function () { return null; });
      // الخطأ بيرجع كـ { error } بحالة Snapchat نفسها (401 = الجلسة انتهت) — قبل كده كان بيوصل للواجهة كأنه «مفيش حسابات»
      if (!r.ok || !data || data.request_status === 'ERROR') {
        res.status(r.ok ? 502 : r.status).json({ error: snapError(data, r.status) });
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (action === 'ads') {
      if (!adAccountId) { res.status(400).json({ error: 'adAccountId مطلوب لجلب الإعلانات.', code: 'BAD_REQUEST' }); return; }
      const accountPath = SNAP_API + '/adaccounts/' + encodeURIComponent(adAccountId);

      // كل الإعلانات مع التصفّح (الافتراضي كان صفحة واحدة بس)
      // لو Snapchat رفض limit=1000 بنعيد المحاولة بالحجم الافتراضي بدل ما نرجع بمفيش إعلانات خالص
      const fetchAds = async function (firstUrl) {
        const out = [];
        let url = firstUrl;
        for (let page = 0; url && page < MAX_PAGES; page++) {
          const r = await fetch(url, { headers: headers });
          const data = await r.json().catch(function () { return null; });
          if (!r.ok || !data || data.request_status === 'ERROR') return { error: snapError(data, r.status), status: r.ok ? 502 : r.status };
          (data.ads || []).forEach(function (item) { if (item && item.ad) out.push(item.ad); });
          url = data.paging && data.paging.next_link;
        }
        return { ads: out };
      };
      const fetchAdsSafe = async function () {
        const first = await fetchAds(accountPath + '/ads?limit=1000');
        return first.error ? fetchAds(accountPath + '/ads') : first;
      };

      // حالة المجموعات الإعلانية (Ad Squads) والحملات: الإعلان ممكن يكون ACTIVE وهو فعلياً مش شغّال
      // لأن المجموعة أو الحملة متوقفة أو مدتها خلصت. فشل الطلبين دول مش بيوقف التحميل
      const fetchList = async function (path, key, itemKey, firstUrl) {
        const out = [];
        let u = firstUrl || (accountPath + path + '?limit=1000');
        for (let page = 0; u && page < MAX_PAGES; page++) {
          const r = await fetch(u, { headers: headers });
          const d = await r.json().catch(function () { return null; });
          if (!r.ok || !d || d.request_status === 'ERROR') return null;
          (d[key] || []).forEach(function (item) { if (item && item[itemKey]) out.push(item[itemKey]); });
          u = d.paging && d.paging.next_link;
        }
        return out;
      };
      // نفس فكرة الإعلانات: لو الحجم الكبير اترفض بنعيد بالحجم الافتراضي
      const fetchListSafe = async function (path, key, itemKey) {
        const first = await fetchList(path, key, itemKey);
        return first || (await fetchList(path, key, itemKey, accountPath + path));
      };

      // السرعة: الطلبات دي كانت بتتبعت ورا بعض (الحساب ← الإعلانات ← المجموعات والحملات ← الأرقام ← الفترة)،
      // فالحسابات الكبيرة كانت بتاخد وقت طويل وممكن توصل لحد وقت الطلب على Vercel.
      // دلوقتي: الإعلانات والمجموعات والحملات بتبدأ مع طلب الحساب نفسه، والأرقام أول ما توقيت الحساب يوصل —
      // كلها بالتوازي. الترتيب الوحيد اللي لازم: الأرقام محتاجة توقيت الحساب (Snapchat بيرفض أي وقت مش على بداية يوم بتوقيته)
      const accountP = fetch(accountPath, { headers: headers })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) { return d && d.adaccounts && d.adaccounts[0] && d.adaccounts[0].adaccount; })
        .catch(function () { return null; });
      // كل طلب بيرجّع خطأه كقيمة بدل ما يرفض — لأننا بنستنى طلب الحساب الأول، ورفض مش متعالج في الوقت ده
      // ممكن يوقف الدالة كلها على Vercel (Node بيعتبره unhandled rejection)
      const errOf = function (e) { return String(e && e.message ? e.message : e); };
      const adsP = fetchAdsSafe().catch(function (e) { return { error: errOf(e), status: 502 }; });
      const squadsP = fetchListSafe('/adsquads', 'adsquads', 'adsquad').catch(function () { return null; });
      const campaignsP = fetchListSafe('/campaigns', 'campaigns', 'campaign').catch(function () { return null; });

      const acc = await accountP;
      const tz = (acc && acc.timezone) || clientTz;

      // نهاية النطاق حصرية: بداية اليوم اللي بعد النهارده
      const range = last7DaysRange(tz);
      const endKey = shiftDateKey(range.until, 1);
      const startTime = range.since + 'T00:00:00.000' + tzOffsetString(range.since, tz);
      const endTime = endKey + 'T00:00:00.000' + tzOffsetString(endKey, tz);
      const fetchStats = async function (fields, granularity, from, to) {
        const statsUrl = accountPath + '/stats' +
          '?granularity=' + granularity + '&breakdown=ad&fields=' + fields +
          '&start_time=' + encodeURIComponent(from) + '&end_time=' + encodeURIComponent(to);
        const r = await fetch(statsUrl, { headers: headers });
        const data = await r.json().catch(function () { return null; });
        const error = (!r.ok || (data && data.request_status === 'ERROR')) ? snapError(data, r.status) : null;
        return { data: data, error: error };
      };
      // بنطلب المشتريات وقيمتها (من Snap Pixel) عشان تنبيهات العائد والصرف بدون طلبات.
      // لو الحساب مش بيدعمها ورفض الطلب، بنرجع للإنفاق والسوايب بس بدل ما نخسر الإنفاق كله
      const FIELDS_FULL = 'spend,swipes,impressions,conversion_purchases,conversion_purchases_value';
      const FIELDS_BASIC = 'spend,swipes,impressions';
      const statsSafe = async function (granularity, from, to) {
        const first = await fetchStats(FIELDS_FULL, granularity, from, to);
        return first.error ? fetchStats(FIELDS_BASIC, granularity, from, to) : first;
      };
      const statsP = statsSafe('DAY', startTime, endTime).catch(function (e) { return { data: null, error: errOf(e) }; });

      // مجاميع الفترة المختارة (TOTAL = رقم واحد لكل إعلان). آخر ٧ أيام مش محتاجة طلب إضافي
      const periodRange = resolvePeriod(period, tz);
      let periodP = Promise.resolve(null);
      if (!periodRange.isDefault) {
        const pEnd = shiftDateKey(periodRange.until, 1);
        const pFrom = periodRange.since + 'T00:00:00.000' + tzOffsetString(periodRange.since, tz);
        const pTo = pEnd + 'T00:00:00.000' + tzOffsetString(pEnd, tz);
        periodP = statsSafe('TOTAL', pFrom, pTo).then(function (p) { return p.error ? null : p.data; }).catch(function () { return null; });
      }

      const results = await Promise.all([adsP, squadsP, campaignsP, statsP, periodP]);
      const adsResult = results[0], squadList = results[1], campaignList = results[2], stats = results[3];
      if (adsResult.error) {
        res.status(adsResult.status || 502).json({ error: adsResult.error });
        return;
      }
      const squads = (squadList || []).map(function (s) {
        return { id: s.id, name: s.name || null, status: s.status, campaign_id: s.campaign_id, start_time: s.start_time || null, end_time: s.end_time || null };
      });
      const campaigns = (campaignList || []).map(function (c) {
        return { id: c.id, name: c.name || null, status: c.status, start_time: c.start_time || null, end_time: c.end_time || null };
      });

      res.status(200).json({
        ads: adsResult.ads,
        squads: squadList ? squads : null,
        campaigns: campaignList ? campaigns : null,
        stats: stats.error ? null : stats.data,
        statsError: stats.error,
        periodStats: results[4],
        period: periodRange,
        range: range,
        account: acc ? { timezone: acc.timezone || null, currency: acc.currency || null } : null
      });
      return;
    }

    res.status(400).json({ error: 'action غير معروف — استخدم accounts أو ads.', code: 'BAD_REQUEST' });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
