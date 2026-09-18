// أدوات Google Ads مشتركة بين google-list-accounts و google-ads-fetch
// الاسم بيبدأ بـ "_" عشان Vercel ميحوّلوش لـ endpoint

export const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v24';

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
  let rows = [];
  (Array.isArray(data) ? data : [data]).forEach(function (chunk) {
    if (chunk && chunk.results) rows = rows.concat(chunk.results);
  });
  return rows;
}
