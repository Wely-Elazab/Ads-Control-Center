// المسار: https://adscenter.online/api/snapchat-ads-fetch (بيشتغل جوه cloudflare/worker.js)
// بيستقبل action='accounts' لجلب قائمة الحسابات، أو action='ads' لجلب إعلانات حساب معيّن

import { last7DaysRange, shiftDateKey, tzOffsetString, resolvePeriod } from './_dates.js';
import { guardRequest } from './_cors.js';
import { text, shaped, periodOf, TOKEN_MAX, badRequest } from './_input.js';
import { dxRanges, dxSegments, dxDaily } from './_dx.js';

const SNAP_API = 'https://adsapi.snapchat.com/v1';
const MAX_PAGES = 20; // حد أمان للتصفّح (1000 إعلان في الصفحة)

// «الأقرب للمتجر» (قرار ٦ أكتوبر ٢٠٢٦): المشتريات اللي حصلت خلال ٧ أيام من سوايب على الإعلان، من غير المشاهدة،
// ومحسوبة بيوم الشراء نفسه. طلب منفصل جنب طلب المنصة (الافتراضي ٢٨ يوم سوايب + يوم مشاهدة) — إعداد واحد لكل طلب.
// Snapchat بيرجّع النوافذ اللي استخدمها جوه كل timeseries_stat/total_stat، فلو مش اللي طلبناها بنتجاهل الرد.
// لم يُختبر على حساب Snapchat حقيقي بعد
const STORE_WINDOWS = '&swipe_up_attribution_window=7_DAY&view_attribution_window=none&action_report_time=conversion';
const STORE_FIELDS = 'conversion_purchases,conversion_purchases_value';
export function storeWindowsOk(data) {
  const list = (data && (data.timeseries_stats || data.total_stats)) || [];
  return list.every(function (e) {
    const ts = (e && (e.timeseries_stat || e.total_stat)) || e || {};
    const swipe = ts.swipe_up_attribution_window, view = ts.view_attribution_window;
    return (swipe == null || String(swipe).toUpperCase() === '7_DAY') && (view == null || String(view).toLowerCase() === 'none');
  });
}

// روابط الصفحة الجاية بنتبعها بس لو على نفس API بتاع Snapchat — التوكن بيتبعت معاها
function nextLink(u) { return typeof u === 'string' && u.indexOf(SNAP_API + '/') === 0 ? u : null; }

function snapError(data, status) {
  return (data && (data.debug_message || data.display_message || data.error_description || data.error)) || ('HTTP ' + status);
}

// هدف الحملة لملخص المتجر (js/diagnosis.js بيحكم بالطلبات على sales وtraffic بس). Snapchat عنده نظامين:
// objective_v2_properties الجديد، وobjective القديم. أي قيمة مش معروفة = مبيعات (زي الأول). لم يُختبر على حساب حقيقي
const SNAP_GOAL_V2 = { SALES: 'sales', TRAFFIC: 'traffic', AWARENESS_AND_ENGAGEMENT: 'awareness', LEADS: 'leads', APP_PROMOTION: 'app' };
const SNAP_GOAL = {
  BRAND_AWARENESS: 'awareness', VIDEO_VIEW: 'awareness', VIDEO_VIEWS: 'awareness', PROMOTE_STORIES: 'awareness', PROMOTE_PLACES: 'awareness',
  ENGAGEMENT: 'engagement', LEAD_GENERATION: 'leads', APP_INSTALL: 'app', APP_INSTALLS: 'app', APP_CONVERSION: 'app', APP_REENGAGEMENT: 'app',
  WEB_VIEW: 'traffic', WEB_CONVERSION: 'sales', CATALOG_SALES: 'sales'
};
export function snapGoal(c) {
  const v2 = c && c.objective_v2_properties && c.objective_v2_properties.objective_v2_type;
  return SNAP_GOAL_V2[v2] || SNAP_GOAL[c && c.objective] || 'sales';
}

// أرقام الإعلانات اللي رجعت في الإحصائيات (الأسبوع والفترة) — breakdown=ad بيرجّع بس الإعلانات اللي ليها أرقام
export function keptAdIds() {
  const out = {};
  Array.prototype.forEach.call(arguments, function (data) {
    ((data && (data.timeseries_stats || data.total_stats)) || []).forEach(function (e) {
      const ts = (e && (e.timeseries_stat || e.total_stat)) || e || {};
      ((ts.breakdown_stats && ts.breakdown_stats.ad) || []).forEach(function (b) { if (b && b.id) out[b.id] = 1; });
    });
  });
  return out;
}
// شغّال فعلاً: ACTIVE مش كفاية — Snapchat بيرجّع delivery_status (حساب حقيقي: ٣٢٦ ACTIVE منهم ١٨ بس VALID). المرفوض
// والمستني مراجعة بيفضلوا (زي Meta)، ولو الحقل مش موجود منخبّيش إعلان ممكن يكون شغّال
export function snapAdLive(a) {
  if (!a || a.status !== 'ACTIVE') return false;
  if (/REJECT/i.test(a.review_status || '')) return true;
  const ds = a.delivery_status;
  if (!Array.isArray(ds) || !ds.length) return true;
  return ds.some(function (s) { return s === 'VALID' || /PENDING_REVIEW/.test(String(s)); });
}
// المحتوى الإبداعي بالحقول اللي الأداة بتعرضها بس. الرابط من web_view (أو جوه collection/deep link)
export function snapCreative(c) {
  const web = c.web_view_properties || {}, col = c.collection_properties || {}, deep = c.deep_link_properties || {};
  const colWeb = col.web_view_properties || {};
  return {
    type: c.type || null, headline: c.headline || null, brand: c.brand_name || null, cta: c.call_to_action || null,
    mediaId: c.top_snap_media_id || null,
    url: web.url || colWeb.url || deep.web_view_fallback_url || deep.deep_link_uri || null
  };
}
// الوسيط: صورة أو فيديو ورابط تنزيله (رابط موقّع مؤقت من Snapchat)
export function snapMedia(m) {
  const img = m.image_metadata || {}, vid = m.video_metadata || {};
  return {
    type: m.type || null, url: m.download_link || null,
    w: img.width_px || vid.width_px || null, h: img.height_px || vid.height_px || null,
    duration: m.duration_in_seconds || vid.duration_in_seconds || null
  };
}

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const body = req.body || {};
  const accessToken = text(body.accessToken, TOKEN_MAX), action = text(body.action, 16);
  if (!accessToken || !action) { badRequest(res, 'الحقلان accessToken وaction مطلوبان في جسم الطلب.'); return; }
  const clientTz = text(body.clientTz, 64), period = periodOf(body.period);

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
      // أرقام حسابات Snapchat على شكل UUID (حروف وأرقام وشرطات)
      const adAccountId = shaped(body.adAccountId, /^[A-Za-z0-9-]{1,64}$/);
      if (!adAccountId) { badRequest(res, 'الحقل adAccountId مطلوب لجلب الإعلانات.'); return; }
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
          url = nextLink(data.paging && data.paging.next_link);
        }
        return { ads: out };
      };
      const fetchAdsSafe = async function () {
        const first = await fetchAds(accountPath + '/ads?limit=1000');
        return first.error ? fetchAds(accountPath + '/ads') : first;
      };

      // حالة المجموعات الإعلانية (Ad Squads) والحملات: الإعلان ممكن يكون ACTIVE وهو فعلياً مش شغّال
      // لأن المجموعة أو الحملة متوقفة أو مدتها خلصت. فشل الطلبين دول مش بيوقف التحميل
      const fetchList = async function (path, key, itemKey, firstUrl, maxPages) {
        const out = [];
        let u = firstUrl || (accountPath + path + '?limit=1000');
        for (let page = 0; u && page < (maxPages || MAX_PAGES); page++) {
          const r = await fetch(u, { headers: headers });
          const d = await r.json().catch(function () { return null; });
          if (!r.ok || !d || d.request_status === 'ERROR') return null;
          (d[key] || []).forEach(function (item) { if (item && item[itemKey]) out.push(item[itemKey]); });
          u = nextLink(d.paging && d.paging.next_link);
        }
        return out;
      };
      // نفس فكرة الإعلانات: لو الحجم الكبير اترفض بنعيد بالحجم الافتراضي
      const fetchListSafe = async function (path, key, itemKey, maxPages) {
        const first = await fetchList(path, key, itemKey, null, maxPages);
        return first || (await fetchList(path, key, itemKey, accountPath + path, maxPages));
      };

      // السرعة: الطلبات دي كانت بتتبعت ورا بعض (الحساب ← الإعلانات ← المجموعات والحملات ← الأرقام ← الفترة)،
      // فالحسابات الكبيرة كانت بتاخد وقت طويل وممكن توصل لحد وقت الطلب على الخادم.
      // دلوقتي: الإعلانات والمجموعات والحملات بتبدأ مع طلب الحساب نفسه، والأرقام أول ما توقيت الحساب يوصل —
      // كلها بالتوازي. الترتيب الوحيد اللي لازم: الأرقام محتاجة توقيت الحساب (Snapchat بيرفض أي وقت مش على بداية يوم بتوقيته)
      const accountP = fetch(accountPath, { headers: headers })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) { return d && d.adaccounts && d.adaccounts[0] && d.adaccounts[0].adaccount; })
        .catch(function () { return null; });
      // كل طلب بيرجّع خطأه كقيمة بدل ما يرفض — لأننا بنستنى طلب الحساب الأول، ورفض مش متعالج في الوقت ده
      // ممكن يوقف الدالة كلها (unhandled rejection)
      const errOf = function (e) { return String(e && e.message ? e.message : e); };
      const adsP = fetchAdsSafe().catch(function (e) { return { error: errOf(e), status: 502 }; });
      const squadsP = fetchListSafe('/adsquads', 'adsquads', 'adsquad').catch(function () { return null; });
      const campaignsP = fetchListSafe('/campaigns', 'campaigns', 'campaign').catch(function () { return null; });
      // المحتوى الإبداعي (العنوان، الرابط، نوع الإعلان) والوسائط (صورة أو فيديو): من غيرهم كل إعلان كان «صورة ثابتة» من غير
      // صورة ولا وجهة، حتى إعلانات الفيديو (حساب حقيقي ١١ أكتوبر). قوائم الحساب بالصفحات مش طلب لكل إعلان — حد الطلبات
      // الفرعية في Cloudflare. فشلهم مش بيوقف التحميل: الإعلانات بتظهر زي الأول من غير صور
      const creativesP = fetchListSafe('/creatives', 'creatives', 'creative', 5).catch(function () { return null; });
      const mediaP = fetchListSafe('/media', 'media', 'media', 5).catch(function () { return null; });

      const acc = await accountP;
      const tz = (acc && acc.timezone) || clientTz;

      // نهاية النطاق حصرية: بداية اليوم اللي بعد النهارده
      const range = last7DaysRange(tz);
      const endKey = shiftDateKey(range.until, 1);
      const startTime = range.since + 'T00:00:00.000' + tzOffsetString(range.since, tz);
      const endTime = endKey + 'T00:00:00.000' + tzOffsetString(endKey, tz);
      const fetchStats = async function (fields, granularity, from, to, extra) {
        const statsUrl = accountPath + '/stats' +
          '?granularity=' + granularity + '&breakdown=ad&fields=' + fields +
          '&start_time=' + encodeURIComponent(from) + '&end_time=' + encodeURIComponent(to) + (extra || '');
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
      // «الأقرب للمتجر»: فشله أو نوافذ غير اللي طلبناها = null، والأداة بتعرض رقم المنصة زي الأول من غير مقارنة
      const storeOf = function (granularity, from, to) {
        return fetchStats(STORE_FIELDS, granularity, from, to, STORE_WINDOWS)
          .then(function (p) { return !p.error && p.data && storeWindowsOk(p.data) ? p.data : null; })
          .catch(function () { return null; });
      };
      const storeP = storeOf('DAY', startTime, endTime);

      // مجاميع الفترة المختارة (TOTAL = رقم واحد لكل إعلان). آخر ٧ أيام مش محتاجة طلب إضافي
      const periodRange = resolvePeriod(period, tz);
      let periodP = Promise.resolve(null), periodStoreP = Promise.resolve(null);
      if (!periodRange.isDefault) {
        const pEnd = shiftDateKey(periodRange.until, 1);
        const pFrom = periodRange.since + 'T00:00:00.000' + tzOffsetString(periodRange.since, tz);
        const pTo = pEnd + 'T00:00:00.000' + tzOffsetString(pEnd, tz);
        periodP = statsSafe('TOTAL', pFrom, pTo).then(function (p) { return p.error ? null : p.data; }).catch(function () { return null; });
        periodStoreP = storeOf('TOTAL', pFrom, pTo);
      }

      const results = await Promise.all([adsP, squadsP, campaignsP, statsP, periodP, storeP, periodStoreP, creativesP, mediaP]);
      const adsResult = results[0], squadList = results[1], campaignList = results[2], stats = results[3];
      if (adsResult.error) {
        res.status(adsResult.status || 502).json({ error: adsResult.error });
        return;
      }
      // الإعلانات اللي ليها أرقام في الأسبوع أو الفترة، أو شغّالة فعلاً — زي Meta. قبل كده كل إعلانات الحساب من أول ما اتعمل:
      // حساب حقيقي ١١ أكتوبر ١٢٣٦ إعلان (٨٥٠ ك.ب و٥ ثواني) منهم ٤٠ صرفوا و١٨ شغّالين، و«تم تحميل ١٢٧٧ إعلاناً»
      const keep = keptAdIds(stats.error ? null : stats.data, results[4]);
      const ads = adsResult.ads.filter(function (a) { return keep[a.id] || snapAdLive(a); });
      const usedSquads = {}, usedCreatives = {};
      ads.forEach(function (a) { usedSquads[a.ad_squad_id] = 1; if (a.creative_id) usedCreatives[a.creative_id] = 1; });
      const squads = (squadList || []).filter(function (s) { return usedSquads[s.id]; }).map(function (s) {
        return { id: s.id, name: s.name || null, status: s.status, campaign_id: s.campaign_id, start_time: s.start_time || null, end_time: s.end_time || null };
      });
      const usedCampaigns = {};
      squads.forEach(function (s) { usedCampaigns[s.campaign_id] = 1; });
      const campaigns = (campaignList || []).filter(function (c) { return !squadList || usedCampaigns[c.id]; }).map(function (c) {
        return { id: c.id, name: c.name || null, status: c.status, start_time: c.start_time || null, end_time: c.end_time || null };
      });
      const creatives = {}, usedMedia = {};
      (results[7] || []).forEach(function (c) {
        if (!c || !usedCreatives[c.id]) return;
        creatives[c.id] = snapCreative(c);
        if (creatives[c.id].mediaId) usedMedia[creatives[c.id].mediaId] = 1;
      });
      const media = {};
      (results[8] || []).forEach(function (m) { if (m && usedMedia[m.id]) media[m.id] = snapMedia(m); });

      res.status(200).json({
        ads: ads,
        creatives: results[7] ? creatives : null,
        media: results[8] ? media : null,
        squads: squadList ? squads : null,
        campaigns: campaignList ? campaigns : null,
        stats: stats.error ? null : stats.data,
        statsError: stats.error,
        periodStats: results[4],
        storeStats: stats.error ? null : results[5],
        periodStoreStats: results[4] ? results[6] : null,
        period: periodRange,
        range: range,
        account: acc ? { timezone: acc.timezone || null, currency: acc.currency || null } : null
      });
      return;
    }

    // ملخص المتجر: الحساب يوم بيوم + الحملات والدول لكل فترة من الـ ٣ (بشكل js/diagnosis.js). قراءة بس.
    // لم يُختبر على حساب Snapchat حقيقي بعد — التقسيم بالدولة بالذات (report_dimension) مش مضمون الشكل،
    // فلو ماتفهمش بيتشال، ومحرك التشخيص كمان بيشيل أي تقسيم أرقامه مش مطابقة لإجمالي الحساب
    if (action === 'diagnosis') {
      const adAccountId = shaped(body.adAccountId, /^[A-Za-z0-9-]{1,64}$/);
      const ranges = dxRanges(body);
      if (!adAccountId || !ranges) { badRequest(res, 'الحقول adAccountId وdaily وwindows مطلوبة وبتواريخ صحيحة.'); return; }
      const accountPath = SNAP_API + '/adaccounts/' + encodeURIComponent(adAccountId);
      const accR = await fetch(accountPath, { headers: headers });
      const accD = await accR.json().catch(function () { return null; });
      if (!accR.ok || !accD || accD.request_status === 'ERROR') { res.status(accR.ok ? 502 : accR.status).json({ error: snapError(accD, accR.status) }); return; }
      const acc = accD.adaccounts && accD.adaccounts[0] && accD.adaccounts[0].adaccount;
      const tz = (acc && acc.timezone) || clientTz;
      const at = function (key) { return encodeURIComponent(key + 'T00:00:00.000' + tzOffsetString(key, tz)); };
      const span = function (r) { return '&start_time=' + at(r.since) + '&end_time=' + at(shiftDateKey(r.until, 1)); };
      const FULL = 'spend,impressions,swipes,conversion_purchases,conversion_purchases_value,conversion_add_cart,conversion_start_checkout';
      const BASIC = 'spend,impressions,swipes';
      const get = async function (query) {
        const r = await fetch(accountPath + '/stats?' + query, { headers: headers });
        const d = await r.json().catch(function () { return null; });
        if (!r.ok || !d || d.request_status === 'ERROR') { const e = new Error(snapError(d, r.status)); e.status = r.ok ? 502 : r.status; throw e; }
        return d;
      };
      // الملخص على «الأقرب للمتجر» زي الإعلانات (STORE_WINDOWS). لو Snapchat رفض النوافذ أو رجّع غيرها بنكمّل الملخص كله
      // بنوافذ المنصة — قرار واحد لكل الطلبات عشان الأيام والتقسيمات تفضل من نفس المصدر
      let windows = STORE_WINDOWS;
      const getWindowed = function (query) {
        if (!windows) return get(query);
        return get(query + windows).then(function (d) {
          if (storeWindowsOk(d)) return d;
          throw new Error('windows');
        }).catch(function () { windows = ''; return get(query); });
      };
      // حساب مش بيدعم التحويلات بيرفض الطلب كله — بنرجع للإنفاق والظهور والسوايب (والمحرك هيقول «لا تُسجَّل مشتريات»)
      const getStats = function (query) { return getWindowed(query + '&fields=' + FULL).catch(function () { return get(query + '&fields=' + BASIC); }); };
      const row = function (st, extra) {
        st = st || {};
        return Object.assign({
          spend: Number(st.spend || 0) / 1e6, imp: Number(st.impressions || 0), clicks: Number(st.swipes || 0),
          pur: Number(st.conversion_purchases || 0), rev: Number(st.conversion_purchases_value || 0) / 1e6,
          atc: Number(st.conversion_add_cart || 0), ic: Number(st.conversion_start_checkout || 0)
        }, extra);
      };
      // الأرقام اليومية: Snapchat بيحدد مدى طلب اليوم الواحد — بنقسّمه على دفعات ٢٨ يوم
      const dailyRows = [];
      // الحساب نفسه بيرفض أي حقل غير spend («Only field 'spend' should be used when querying AdAccount stats») — فملخص المتجر
      // لـ Snapchat كان بيفشل دايماً ومن غير ما يقول (حساب حقيقي ١١ أكتوبر). دلوقتي: الحملات يوم بيوم، ونجمعها لكل يوم
      const FIELDS_SUM = ['spend', 'imp', 'clicks', 'pur', 'rev', 'atc', 'ic'];
      for (let s = ranges.daily.since; s <= ranges.daily.until; s = shiftDateKey(s, 28)) {
        const u = shiftDateKey(s, 27) < ranges.daily.until ? shiftDateKey(s, 27) : ranges.daily.until;
        const d = await getStats('granularity=DAY&breakdown=campaign' + span({ since: s, until: u }));
        const byDay = {};
        const addPoint = function (p) {
          if (!p || !p.start_time) return;
          const k = String(p.start_time).slice(0, 10), r = row(p.stats);
          const a = byDay[k] || (byDay[k] = row({}, { date: k }));
          FIELDS_SUM.forEach(function (f) { a[f] += r[f]; });
        };
        (d.timeseries_stats || []).forEach(function (e) {
          const ts = e.timeseries_stat || e;
          ((ts.breakdown_stats && ts.breakdown_stats.campaign) || []).forEach(function (b) { (b.timeseries || []).forEach(addPoint); });
          (ts.timeseries || []).forEach(addPoint);   // لو رجع بشكل الحساب (من غير تقسيم)
        });
        Object.keys(byDay).forEach(function (k) { dailyRows.push(byDay[k]); });   // الأيام اللي ليها أرقام بس — زي Meta
      }
      // أسماء الحملات وأهدافها (فشلها = الحملات بتظهر بأرقامها، وكلها بتتعامل كحملات مبيعات زي الأول)
      const names = {}, goals = {};
      try {
        const lr = await fetch(accountPath + '/campaigns?limit=1000', { headers: headers });
        const ld = await lr.json().catch(function () { return null; });
        ((ld && ld.campaigns) || []).forEach(function (c) {
          if (c && c.campaign) { names[c.campaign.id] = c.campaign.name || null; goals[c.campaign.id] = snapGoal(c.campaign); }
        });
      } catch (e) { /* مش ضروري */ }
      const dims = [];
      const campaignRows = [], countryRows = [];
      let campaignsOk = true, countriesOk = true;
      for (let i = 0; i < 3; i++) {
        const w = ranges.windows[i];
        try {
          const d = await getStats('granularity=TOTAL&breakdown=campaign' + span(w));
          (d.total_stats || []).forEach(function (e) {
            const ts = e.total_stat || e;
            ((ts.breakdown_stats && ts.breakdown_stats.campaign) || []).forEach(function (b) {
              if (b && b.id) campaignRows.push(row(b.stats, { w: i, key: b.id, name: names[b.id] || null, goal: goals[b.id] || null }));
            });
          });
        } catch (e) { campaignsOk = false; }
        try {
          const d = await getStats('granularity=TOTAL&report_dimension=country' + span(w));
          (d.total_stats || []).forEach(function (e) {
            const ts = e.total_stat || e;
            (ts.dimension_stats || []).forEach(function (x) {
              const code = x && (x.country || (x.dimension && x.dimension.country));
              if (code) countryRows.push(row(x.stats || x, { w: i, key: String(code).toUpperCase() }));
            });
          });
        } catch (e) { countriesOk = false; }
      }
      if (campaignsOk && campaignRows.length) dims.push({ id: 'campaign', segs: dxSegments(campaignRows, ranges.windows) });
      if (countriesOk && countryRows.length) dims.push({ id: 'country', segs: dxSegments(countryRows, ranges.windows) });
      res.status(200).json({ daily: dxDaily(dailyRows), dims: dims, account: acc ? { timezone: acc.timezone || null, currency: acc.currency || null } : null });
      return;
    }

    res.status(400).json({ error: 'قيمة action غير معروفة — استخدم accounts أو ads أو diagnosis.', code: 'BAD_REQUEST' });
  } catch (err) {
    // من غير نص الخطأ الداخلي في الرد (المرحلة ٣، أ٦ — OWASP ASVS: معالجة الأخطاء) — زي حارس الـ Worker
    res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم.', code: 'SERVER' });
  }
}
