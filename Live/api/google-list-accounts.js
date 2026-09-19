// المسار النهائي بعد النشر: https://<مشروعك>/api/google-list-accounts
//
// GOOGLE_ADS_DEVELOPER_TOKEN اختياري: من ٩ سبتمبر ٢٠٢٦ Google بتحدد مستوى الصلاحية من مشروع Google Cloud
// اللي طلع منه مفتاح الدخول (Test / Explorer / Basic / Standard)، والـ developer token بيتجاهل.
//
// listAccessibleCustomers بيرجّع الحسابات اللي عندك وصول مباشر ليها بس — ومنها حسابات Manager (MCC)
// اللي مينفعش تتسحب منها إعلانات. عشان كده بنفرد كل حساب لحسابات العملاء (غير Manager) اللي تحته،
// ونرجّع مع كل واحد الـ loginCustomerId الصح اللي لازم يتبعت في الهيدر.
//
// الحسابات المقفولة أو اللي إعدادها ما خلصش (CUSTOMER_NOT_ENABLED، أو حالتها مش ENABLED) مش عطل —
// بترجع لوحدها في inactive عشان الأداة تقول للمستخدم بالظبط أنهي حساب ويعمل إيه

import { GOOGLE_ADS_API, googleErrorMessage, googleHeaders, gaql } from './_google.js';
import { guardRequest } from './_cors.js';
import { verifyGoogleToken } from './_verify.js';

const INACTIVE_CODES = { CUSTOMER_NOT_ENABLED: true };

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || null;

  const { accessToken } = req.body || {};
  if (!accessToken) {
    res.status(400).json({ error: 'accessToken مطلوب في جسم الطلب.' });
    return;
  }

  // التوكن لازم يكون صادر لتطبيقنا — من غير كده أي حد يستهلك حصة Developer Token بتاعنا
  const verified = await verifyGoogleToken(accessToken);
  // توكن منتهي = 401 (الواجهة بتعرض «ربط تاني»)، توكن مش لتطبيقنا = 403
  if (!verified.ok) { res.status(verified.auth ? 401 : 403).json({ error: verified.error, code: verified.auth ? 'AUTH' : 'FORBIDDEN' }); return; }

  try {
    const response = await fetch(GOOGLE_ADS_API + '/customers:listAccessibleCustomers', {
      method: 'GET',
      headers: googleHeaders(developerToken, accessToken)
    });
    const data = await response.json().catch(function () { return null; });
    if (!response.ok) {
      res.status(response.status).json({ error: googleErrorMessage(data, response.status) });
      return;
    }
    const rootIds = ((data && data.resourceNames) || []).map(function (rn) { return rn.replace('customers/', ''); });

    const query = `
      SELECT
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.manager,
        customer_client.status,
        customer_client.currency_code,
        customer_client.time_zone
      FROM customer_client
    `;
    const perRoot = await Promise.all(rootIds.map(function (rootId) {
      return gaql({ developerToken, accessToken, customerId: rootId, loginCustomerId: rootId }, query)
        .then(function (rows) { return { rootId: rootId, rows: rows }; })
        .catch(function (err) { return { rootId: rootId, error: err.message, code: err.code || null }; });
    }));

    const byId = {};
    const errors = [];
    const inactive = {};
    perRoot.forEach(function (r) {
      if (r.error) {
        if (INACTIVE_CODES[r.code]) inactive[r.rootId] = true;
        else errors.push({ customerId: r.rootId, error: r.error, code: r.code });
        return;
      }
      r.rows.forEach(function (row) {
        const cc = row.customerClient;
        if (!cc || cc.manager) return;
        if (cc.status !== 'ENABLED') { inactive[String(cc.id)] = true; return; }
        const id = String(cc.id);
        const direct = id === r.rootId;
        // لو الحساب متاح مباشرة وكمان من تحت Manager، الوصول المباشر أولى
        if (byId[id] && !direct) return;
        byId[id] = {
          id: id,
          name: cc.descriptiveName || id,
          loginCustomerId: r.rootId,
          currency: cc.currencyCode || null,
          timeZone: cc.timeZone || null
        };
      });
    });

    const accounts = Object.keys(byId).map(function (id) { return byId[id]; });
    // حساب ظهر شغّال من طريق تاني (مثلاً تحت Manager) ميتحسبش مقفول
    const inactiveIds = Object.keys(inactive).filter(function (id) { return !byId[id]; });
    if (!accounts.length && errors.length) {
      res.status(502).json({ error: errors[0].error, errors: errors, inactive: inactiveIds });
      return;
    }
    res.status(200).json({ accounts: accounts, errors: errors, inactive: inactiveIds });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
