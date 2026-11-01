// المسار: https://adscenter.online/api/digest-fetch (بيشتغل جوه cloudflare/worker.js) — للمُشغّل بس (supabase/functions/sync/runner.ts)
//
// الملخص التلقائي لكل المنصات (قرار صاحب المنتج ٣١ أكتوبر ٢٠٢٦: «واجعل الملخص لكل المنصات وليس ميتا فقط»، ووافق على حفظ صلاحية
// قراءة Snapchat وGoogle على الخادم): لما المستخدم يضيف حساب Snapchat لملخصه، الأداة بتبعت النسخة المقفولة من مفتاح التجديد
// (_seal.js — مربوطة بحساب دخوله) لدالة sync، فبتحفظها مشفّرة تاني بمفتاحها هي. المُشغّل مبيقدرش يفتحها: مفتاحها مشتق من سر
// التطبيق اللي هنا بس. فبيبعتها هنا:
//   { platform: 'snapchat', user, sealed, call: { action, ...نفس باراميترات api/snapchat-ads-fetch.js } }
// بنفتحها لصاحبها ده بس، ونجدد الجلسة، وننفّذ نفس طلب الأداة بالظبط، ونرجّع { status, data, sealed } — sealed = نسخة جديدة بتاريخ
// جديد (أو بمفتاح تجديد جديد لو Snapchat بعتت واحد). مفتاح الجلسة نفسه مبيطلعش من هنا.
// الإثبات إن الطلب من المُشغّل: هيدر x-runner-key (worker.js ← _login.js runnerKeyOk). من غير دخول للأداة (مفيش مستخدم فاتح)

import { text, badRequest, UUID } from './_input.js';
import { sealToken, unsealToken, SEALED_MAX } from './_seal.js';
import { tokenRequest } from './snapchat-token.js';
import snapchatAdsFetch from './snapchat-ads-fetch.js';

// اللي المُشغّل محتاجه بس: الإعلانات وأرقامها، وأرقام الملخص، وسجل التعديلات، والإنفاق اليومي
const ACTIONS = { ads: 1, diagnosis: 1, changes: 1, daily: 1 };

// دالة api تانية بنفس شكل Vercel (req/res) — الرد بيرجع هنا بدل ما يطلع
async function callHandler(handler, headers, body) {
  const out = { status: 200, body: null };
  const res = {
    statusCode: 200,
    status: function (code) { out.status = code; this.statusCode = code; return this; },
    setHeader: function () { return this; },
    getHeader: function () { return null; },
    json: function (obj) { out.body = obj; return this; },
    send: function (data) { out.body = data; return this; },
    end: function () { return this; }
  };
  await handler({ method: 'POST', headers: headers, body: body, query: {}, url: '/api/snapchat-ads-fetch', user: null }, res);
  return out;
}

export default async function handler(req, res) {
  const body = req.body || {};
  const user = typeof body.user === 'string' && UUID.test(body.user) ? body.user : null;
  const sealed = text(body.sealed, SEALED_MAX);
  const call = body.call && typeof body.call === 'object' && !Array.isArray(body.call) ? body.call : null;
  if (body.platform !== 'snapchat' || !user || !sealed || !call || !ACTIONS[call.action]) { badRequest(res, 'طلب المُشغّل غير صالح.'); return; }

  const clientId = process.env.SNAPCHAT_CLIENT_ID, secret = process.env.SNAPCHAT_CLIENT_SECRET;
  if (!clientId || !secret) { res.status(500).json({ error: 'config', code: 'CONFIG' }); return; }
  try {
    const refreshToken = await unsealToken('snapchat', secret, sealed, undefined, user);
    // النسخة مبقتش تنفع (اتعدّلت، أو لمستخدم تاني، أو عدّى عليها ٦٠ يوم من غير استخدام) = المستخدم يربط Snapchat تاني
    if (!refreshToken) { res.status(401).json({ error: 'sealed', code: 'AUTH' }); return; }
    const r = await tokenRequest({ grant_type: 'refresh_token', client_id: clientId, client_secret: secret, refresh_token: refreshToken });
    if (!r.response.ok || !r.data || !r.data.access_token) {
      // Snapchat رفضت مفتاح التجديد (الصلاحية اتشالت) = ربط من جديد. غير كده عطل مؤقت — المُشغّل بيحاول الساعة الجاية
      const lost = r.response.status === 400 || r.response.status === 401;
      res.status(lost ? 401 : 502).json({ error: lost ? 'refresh rejected' : 'refresh failed', code: lost ? 'AUTH' : 'UPSTREAM' });
      return;
    }
    const next = await sealToken('snapchat', secret, r.data.refresh_token || refreshToken, undefined, user);
    const inner = await callHandler(snapchatAdsFetch, { host: req.headers.host || '' }, Object.assign({}, call, { accessToken: r.data.access_token }));
    res.status(200).json({ status: inner.status, data: inner.body, sealed: next });
  } catch (err) {
    res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم.', code: 'SERVER' });
  }
}
