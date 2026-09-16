// ضع هذا الملف في مجلد /api داخل مشروع Vercel (بجانب pauseproof-live.html، في مجلد اسمه api)
// المسار النهائي بعد النشر: https://<مشروعك>.vercel.app/api/google-list-accounts
//
// قبل الاستخدام، ضيف متغيّر بيئة (Environment Variable) في إعدادات المشروع على Vercel:
//   GOOGLE_ADS_DEVELOPER_TOKEN = <توكن المطوّر بتاعك من Google Ads API Center>
// أبداً متحطش التوكن ده مباشرة في أي ملف — ده بالظبط السبب اللي احتجنا عشانه السيرفر ده من الأساس.
//
// listAccessibleCustomers بيرجّع الحسابات اللي عندك وصول مباشر ليها بس — ومنها حسابات Manager (MCC)
// اللي مينفعش تتسحب منها إعلانات. عشان كده بنفرد كل حساب لحسابات العملاء (غير Manager) اللي تحته،
// ونرجّع مع كل واحد الـ loginCustomerId الصح اللي لازم يتبعت في الهيدر.

import { GOOGLE_ADS_API, googleErrorMessage, googleHeaders, gaql } from './_google.js';
import { guardRequest } from './_cors.js';

export default async function handler(req, res) {
  if (!guardRequest(req, res)) return;

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    res.status(500).json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN غير مضبوط في إعدادات Vercel (Environment Variables).' });
    return;
  }

  const { accessToken } = req.body || {};
  if (!accessToken) {
    res.status(400).json({ error: 'accessToken مطلوب في جسم الطلب.' });
    return;
  }

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
        .catch(function (err) { return { rootId: rootId, error: err.message }; });
    }));

    const byId = {};
    const errors = [];
    perRoot.forEach(function (r) {
      if (r.error) { errors.push({ customerId: r.rootId, error: r.error }); return; }
      r.rows.forEach(function (row) {
        const cc = row.customerClient;
        if (!cc || cc.manager || cc.status !== 'ENABLED') return;
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
    if (!accounts.length && errors.length) {
      res.status(502).json({ error: errors[0].error, errors: errors });
      return;
    }
    res.status(200).json({ accounts: accounts, errors: errors });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
