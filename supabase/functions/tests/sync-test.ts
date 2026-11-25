// اختبارات دالة sync (مراجعة المرحلة ٢، ١٢ أكتوبر ٢٠٢٦ — ب٢: الخادم كان من غير أي اختبار).
// من غير شبكة ولا قاعدة بيانات: fetch بيتبدّل ببديل في كل اختبار محتاجه، ومفتاح التشفير مفتاح تجريبي عشوائي.
// بتتشغّل في التكامل المستمر (.github/workflows/tests.yml):
//   deno test --allow-env --no-check supabase/functions/tests/sync-test.ts
// مكان الملف حسب توصية Supabase («Testing your Edge Functions»): supabase/functions/tests/<اسم الدالة>-test.ts

import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1';
import { corsHeaders, esc, isAppAdmin, reply, str, stripHidden, unsubHeaders } from '../sync/lib.ts';
import { MAX_PER_PLATFORM, SNAP_ID, cleanEmail, daysText, hourText, handleDigest, linkSig, sameString, seal, sealedAad, unseal } from '../sync/digest.ts';
import { bearer, cleanCode, counterMissing, handleLogin, newCode, requireLogin, verifyJwt } from '../sync/auth.ts';
import { handleMetaLink } from '../sync/metalink.ts';
import {
  addDays, assemble, callTimeout, daysBetween, familyOf, freshUsage, keyWindow, markMap, monthWindow, needsAttention, readUsage, resolveNow, settingsChoice,
  summaryWindow, urgentReady, windowComplete, windowKey, statusPick, ongoingAll, editsSince, probe, accountsPhrase, connectionMail, expiryMail, urgentPass, loadEngine, urgentAlerts, summaryDue, monthlyDue, alertsCountAr, alertStatusHtml, linkAllowed, privateAddr, setResolverForTests, runAll
} from '../sync/runner.ts';
import { ACCT_MAX, MAX_KEYS, cleanAccountSettings, cleanUserSettings, cleanUserWrite, handleSettings, handleUserSettings, type UserWrite } from '../sync/settings.ts';
import { cleanDecisions, cleanOpen, decisionOk, handleEpisodes, sinceOf } from '../sync/episodes.ts';
import { handle } from '../sync/handler.ts';
import { activationMail, adminMail, handleJoin, joinReminders } from '../sync/join.ts';

// مفتاح تشفير تجريبي (٣٢ بايت) — بيتقري وقت أول استخدام، مش وقت الاستيراد
Deno.env.set('TOKEN_ENC_KEY', btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
Deno.env.set('META_APP_SECRET', 'test-app-secret');

const realFetch = globalThis.fetch;
type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
function stubFetch(route: Route) {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve().then(() => route(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init))) as typeof fetch;
}
function restoreFetch() { globalThis.fetch = realFetch; }
// DNS الحقيقي مقفول في كل الاختبارات (CI مفيهوش صلاحية شبكة، والمتصفح مفيهوش DNS) — اختبار DNS بيحط واحد مزيف ويرجّعه null (١١٩)
setResolverForTests(null);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ---------- lib.ts ----------
Deno.test('CORS: موقعنا بس هو اللي يقدر يكلّم الدالة من المتصفح', () => {
  assertEquals(corsHeaders('https://adscenter.online')['Access-Control-Allow-Origin'], 'https://adscenter.online');
  assertEquals(corsHeaders('https://evil.example')['Access-Control-Allow-Origin'], undefined);
  assertEquals(corsHeaders(null)['Access-Control-Allow-Origin'], undefined);
});
Deno.test('الردود مبتتخزّنش، والنصوص اللي جاية من برّه بتتأمّن قبل ما تدخل رسالة', () => {
  assertEquals(reply(200, { ok: true }, null).headers.get('cache-control'), 'no-store');
  assertEquals(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  // الخمسة اللي OWASP بيطلبها: الفاصلة العليا كمان، عشان سمة بعلامة واحدة متتكسرش
  assertEquals(esc("' onerror='x"), '&#39; onerror=&#39;x');
  assertEquals(esc('a&b'), 'a&amp;b');
});
// مراجعة ١ نوفمبر ٢٠٢٦: النص اللي بيتعرض لينا أو للعميل من غير محارف مخفية
// (رموز تحكم، واتجاه ومنها علامة الحرف العربي، وصفرية العرض، وفواصل السطور، وعلامة ترتيب البايتات)
Deno.test('المحارف المخفية بتتشال من أي نص جاي من برّه', () => {
  const marks = ['\u0000', '\u001f', '\u007f', '؜', '​', '‍', '‎', '‮', ' ', ' ', '⁩', '﻿'];
  for (const m of marks) {
    const hex = m.charCodeAt(0).toString(16);
    assertEquals(stripHidden('a' + m + 'b'), 'a b', 'فضل في النص: ' + hex);
    assertEquals((str('a' + m + 'b', 50) || '').indexOf(m), -1, 'فضل بعد القصّ: ' + hex);
  }
  // الدالة مش بتفتكر آخر موضع: نفس النتيجة لو اتنادت مرتين ورا بعض (علم g)
  assertEquals(stripHidden('a‎b'), stripHidden('a‎b'));
  // الحروف العادية والعربية متتلمسش
  assertEquals(str('أحمد — Ads', 50), 'أحمد — Ads');
  assertEquals(str('', 50), null);
  assertEquals(str(5 as unknown as string, 50), null);
});

// ---------- digest.ts ----------
Deno.test('البريد: بيتنضّف ويتحوّل لحروف صغيرة، والغلط بيترفض', () => {
  assertEquals(cleanEmail('  Name@Example.Co '), 'name@example.co');
  for (const bad of ['', 'name', 'a@b', 'a b@c.com', 'a@b.c', '<a@b.com>', 'a@b.com,c@d.com', 42]) assertEquals(cleanEmail(bad), null, String(bad));
});
Deno.test('مواعيد الملخص في الرسائل: الساعة والأيام بالعربي والإنجليزي', () => {
  assertEquals(hourText(0, 'ar'), '١٢:٠٠ صباحاً');
  assertEquals(hourText(13, 'en'), '1:00 PM');
  assertEquals(daysText([0, 3], 'ar'), 'يومي الأحد والأربعاء');
  assertEquals(daysText([0, 3, 5], 'ar'), 'أيام الأحد والأربعاء والجمعة');
  assertEquals(daysText([0, 3, 5], 'en'), 'Sunday, Wednesday and Friday');
});
Deno.test('إلغاء الاشتراك بنقرة (RFC 8058): الترويستان لرابط الإيقاف بتاعنا بس، والرابط بين <> زي ما هو', () => {
  const stop = 'https://adscenter.online/stop?u=11111111-2222-3333-4444-555555555555&s=abcdefghijklmnopqrstuvwxyz_-';
  assertEquals(unsubHeaders(stop), { 'List-Unsubscribe': '<' + stop + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
  // رابط تاني، أو حروف بتكسر الترويسة (<> أو فاصلة بتبدأ رابط تاني، أو سطر جديد بيبدأ ترويسة تانية): من غير ترويسات
  for (const bad of ['', 'http://adscenter.online/stop?u=1&s=2', 'https://evil.example/stop?u=1&s=2', 'https://adscenter.online.evil.example/stop?u=1',
    'https://adscenter.online/app', 'https://adscenter.online/stop?u=1&s=2>, <https://evil.example/x', 'https://adscenter.online/stop?u=1\r\nBcc: x@y.z']) {
    assertEquals(unsubHeaders(bad), undefined, bad);
  }
});
Deno.test('المقارنة الآمنة: نفس النتيجة من غير اختصار', () => {
  assert(sameString('abc', 'abc'));
  assert(!sameString('abc', 'abd'));
  assert(!sameString('abc', 'abcd'));
});
Deno.test('الروابط الموقّعة: ثابتة لنفس الرسالة، ومختلفة لكل غرض، وحروفها آمنة في الرابط', async () => {
  const a = await linkSig('ads-center/stop-link/v1:', 'stop:act_1');
  assertEquals(await linkSig('ads-center/stop-link/v1:', 'stop:act_1'), a);
  assert(a !== await linkSig('ads-center/join-invited/v1:', 'stop:act_1'), 'another purpose, another signature');
  assert(a !== await linkSig('ads-center/stop-link/v1:', 'stop:act_2'), 'another account, another signature');
  assertMatch(a, /^[A-Za-z0-9_-]{40,}$/);
});
Deno.test('التشفير: المفتاح المحفوظ بيرجع زي ما هو لنفس الحساب بس', async () => {
  const s = await seal('EAA-test-token', 'act_1');
  assertEquals(await unseal(s.ct, s.iv, 'act_1'), 'EAA-test-token');
  // نفس النص المشفّر لو اتنقل لصف حساب تاني مبيتفكّش
  await assertRejects(() => unseal(s.ct, s.iv, 'act_2'));
  const s2 = await seal('EAA-test-token', 'act_1');
  assert(s2.iv !== s.iv && s2.ct !== s.ct, 'a fresh IV every time');
});

// مراجعة ١ نوفمبر ٢٠٢٦ (ح٣): شكل المعرّف صارم — الشكل القديم كان بيقبل ٣٦ شرطة ورا بعض
Deno.test('شكل رقم الحساب: UUID بالظبط، مش أي ٣٦ حرف', () => {
  assertEquals(SNAP_ID.test('a1b2c3d4-e5f6-4a7b-8c9d-0123456789a0'), true);
  assertEquals(SNAP_ID.test('A1B2C3D4-E5F6-4A7B-8C9D-0123456789A0'), true, 'الحروف الكبيرة مقبولة');
  for (const bad of ['------------------------------------', 'a1b2c3d4e5f64 a7b8c9d0123456789a0',
    'a1b2c3d4-e5f6-4a7b-8c9d-0123456789a', 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789a0x', '']) {
    assertEquals(SNAP_ID.test(bad), false, 'لازم يترفض: ' + bad);
  }
});

// ---------- auth.ts ----------
Deno.test('رمز الدخول: الأرقام العربية والفارسية والمسافات مقبولة، وأي طول غير ٦ مرفوض', () => {
  assertEquals(cleanCode('١٢٣٤٥٦'), '123456');
  assertEquals(cleanCode('۱۲۳ ۴۵۶'), '123456');
  assertEquals(cleanCode(' 123 456 '), '123456');
  for (const bad of ['12345', '1234567', 'abcdef', '', null, undefined]) assertEquals(cleanCode(bad), null, String(bad));
});
// مراجعة ١ نوفمبر ٢٠٢٦ (ق٨): انحياز باقي القسمة — القيم من ٤٬٢٩٤٬٠٠٠٬٠٠٠ لفوق بتترمي ونسحب غيرها.
// من غير الإصلاح أول قيمة كانت هتطلع «000000»
Deno.test('رمز الدخول: ٦ أرقام، والقيم اللي فوق أكبر مضاعف للمليون بتترمي', () => {
  for (let i = 0; i < 50; i++) assertMatch(newCode(), /^\d{6}$/);
  const seq = [4294000000, 4294967295, 1234567];
  const own = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');   // غالباً undefined (الدالة على النموذج الأصلي)
  Object.defineProperty(crypto, 'getRandomValues', {
    configurable: true, writable: true,
    value: (a: Uint32Array) => { a[0] = seq.shift() as number; return a; }
  });
  try {
    assertEquals(newCode(), '234567');
    assertEquals(seq.length, 0, 'لازم القيمتين الأوليين يترموا');
  } finally {
    // الاختبارات اللي بعده (seal وغيره) محتاجة الدالة الأصلية — بترجع زي ما كانت بالظبط
    if (own) Object.defineProperty(crypto, 'getRandomValues', own);
    else delete (crypto as unknown as Record<string, unknown>).getRandomValues;
  }
});
Deno.test('مفتاح الدخول في الهيدر: Bearer بس', () => {
  assertEquals(bearer(new Request('https://x.test', { headers: { authorization: 'Bearer abc.def.ghi' } })), 'abc.def.ghi');
  assertEquals(bearer(new Request('https://x.test', { headers: { authorization: 'Basic abc' } })), null);
  assertEquals(bearer(new Request('https://x.test')), null);
});

const ISSUER = 'https://rhrrnxsgodiideqeollo.supabase.co/auth/v1';
const te = new TextEncoder();
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const part = (o: unknown) => b64u(te.encode(JSON.stringify(o)));
const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
const otherPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
async function jwt(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'ES256', kid: 'k1', typ: 'JWT' }, key = keyPair.privateKey) {
  const head = part(header) + '.' + part(payload);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(head)));
  return head + '.' + b64u(sig);
}
const now = () => Math.floor(Date.now() / 1000);
const good = () => ({ iss: ISSUER, aud: 'authenticated', exp: now() + 3600, sub: 'user-1', session_id: 'session-1', email: 'a@b.co', amr: [{ method: 'password' }] });

Deno.test('مفتاح الدخول: بيتقبل بس لو توقيعه ومُصدِره وجمهوره وصلاحيته سليمين', async () => {
  let jwksCalls = 0;
  stubFetch((url) => {
    if (url === ISSUER + '/.well-known/jwks.json') { jwksCalls++; return json({ keys: [{ ...publicJwk, kid: 'k1' }] }); }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const p = await verifyJwt(await jwt(good()));
    assertEquals(p && p.sub, 'user-1');

    const t = await jwt(good());
    const [h, , s] = t.split('.');
    assertEquals(await verifyJwt(h + '.' + part({ ...good(), sub: 'someone-else' }) + '.' + s), null, 'payload changed after signing');
    assertEquals(await verifyJwt(await jwt(good(), undefined, otherPair.privateKey)), null, 'signed with another key');
    assertEquals(await verifyJwt(await jwt(good(), { alg: 'none', kid: 'k1' })), null, 'alg none');
    assertEquals(await verifyJwt(await jwt(good(), { alg: 'HS256', kid: 'k1' })), null, 'alg HS256');
    assertEquals(await verifyJwt(await jwt({ ...good(), exp: now() - 5 })), null, 'expired');
    assertEquals(await verifyJwt(await jwt({ ...good(), iss: 'https://evil.example/auth/v1' })), null, 'another issuer');
    assertEquals(await verifyJwt(await jwt({ ...good(), aud: 'anon' })), null, 'not a signed-in user');
    const noSession: Record<string, unknown> = good(); delete noSession.session_id;
    assertEquals(await verifyJwt(await jwt(noSession)), null, 'no session id');
    assertEquals(await verifyJwt('a.b'), null, 'two parts');
    assertEquals(await verifyJwt('x'.repeat(5000)), null, 'too long');
    assertEquals(await verifyJwt(null), null, 'no token');

    // مفتاح برقم مش معروف: بيسأل Supabase مرة تانية (المفتاح ممكن يكون اتغيّر) وبعدين بيرفض
    const before = jwksCalls;
    assertEquals(await verifyJwt(await jwt(good(), { alg: 'ES256', kid: 'unknown' })), null, 'unknown kid');
    assertEquals(jwksCalls, before + 1, 'refetched the keys once');
    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦: رقم مفتاح تاني مش معروف خلال دقيقة = مفيش جلب جديد (كان كل طلب مزوّر بيجيب القائمة)
    assertEquals(await verifyJwt(await jwt(good(), { alg: 'ES256', kid: 'unknown-2' })), null, 'another unknown kid');
    assertEquals(jwksCalls, before + 1, 'not fetched again within a minute');
    assertEquals(((await verifyJwt(await jwt(good()))) || {}).sub, 'user-1', 'the real key still works');
  } finally { restoreFetch(); }
});
// التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٦): بوابة كل العمليات بعد الدخول (requireLogin — handler.ts) مكانش ليها اختبار: مفتاح موقّع سليم «و» جلسة
// لسه شغالة في قاعدة البيانات (الخروج من جهاز تاني أو تغيير كلمة المرور بيقفلها). الجلسة والمستخدم من المفتاح الموقّع مش من الطلب،
// و«true» بالظبط بس، وقاعدة بيانات واقعة = مفيش دخول (مقفولة وقت الشك)، ومفتاح مرفوض مبيوصلش لقاعدة البيانات أصلاً
Deno.test('بوابة الدخول: مفتاح موقّع وجلسة شغالة، والجلسة من المفتاح، و«true» بالظبط، وقاعدة بيانات واقعة = مفيش دخول', async () => {
  let ok: unknown = true, asked: any[] = [];
  stubFetch((url, init) => {
    if (url === ISSUER + '/.well-known/jwks.json') return json({ keys: [{ ...publicJwk, kid: 'k1' }] });
    if (url.indexOf('/rest/v1/rpc/session_ok') > -1) {
      asked.push(JSON.parse(String(init && init.body)));
      return ok === 'down' ? json({ message: 'down' }, 500) : new Response(JSON.stringify(ok), { status: 200 });
    }
    throw new Error('unexpected fetch ' + url);
  });
  const req = async (payload: Record<string, unknown> | null) => new Request('https://x.test', { method: 'POST',
    headers: payload ? { authorization: 'Bearer ' + (await jwt(payload)) } : {}, body: JSON.stringify({ session_id: 'forged', sub: 'forged' }) });
  try {
    assertEquals(await requireLogin(await req({ ...good(), email: 'A@B.Co' })), { id: 'user-1', email: 'a@b.co' });
    assertEquals(asked, [{ p_session: 'session-1', p_user: 'user-1' }], 'the session and user come from the signed key, not the request body');
    asked = [];
    assertEquals(await requireLogin(await req(null)), null, 'no key');
    assertEquals(await requireLogin(await req({ ...good(), exp: now() - 5 })), null, 'an expired key');
    assertEquals(asked.length, 0, 'a refused key never reaches the database');
    for (const v of [false, 'true', 1, { ok: true }, null]) {
      ok = v;
      assertEquals(await requireLogin(await req(good())), null, 'session_ok ' + JSON.stringify(v) + ' is not a yes');
    }
    ok = 'down';
    assertEquals(await requireLogin(await req(good())), null, 'the database down: no login (closed when unsure)');
  } finally { restoreFetch(); }
});
// ---------- نقطة الدخول (handler.ts) — التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٦) ----------
// المعالج كان جوه Deno.serve في index.ts فمكانش بيتختبر خالص. التوجيه والفحوص اللي قبل أي عملية: الطرق، وCORS للموقع بس، وحد حجم الجسم،
// والعمليات العامة بس من غير دخول (النبض والإيقاف والانضمام والدخول)، والمُشغّل بمفتاحه، وكل الباقي دخول مكتمل الأول (٤٠١) قبل ما
// يتسأل Meta عن أي حاجة، وبعد الدخول فحص المدخلات، والخطأ الداخلي ٥٠٢ من غير أي تفاصيل
Deno.test('نقطة الدخول: الطرق وCORS وحد الحجم، والعامة بس من غير دخول، والمُشغّل بمفتاحه، والخطأ من غير تفاصيل', async () => {
  const SITE_O = 'https://adscenter.online', TOK = 'EAAB' + 'x'.repeat(40), asked: string[] = [];
  let sessionOk = false, beatFails = false;
  stubFetch((url) => {
    asked.push(url);
    if (url === ISSUER + '/.well-known/jwks.json') return json({ keys: [{ ...publicJwk, kid: 'k1' }] });
    if (url.indexOf('/rest/v1/rpc/beat') > -1) return beatFails ? json({ message: 'db said secret-XYZ' }, 500) : new Response('', { status: 200 });
    if (url.indexOf('/rest/v1/rpc/runner_key_check') > -1) return json(false);
    if (url.indexOf('/rest/v1/rpc/session_ok') > -1) return json(sessionOk);
    if (url.indexOf('graph.facebook.com') > -1) return json({ error: { code: 190, message: 'invalid' } }, 400);
    return json({ message: 'unexpected' }, 500);
  });
  // طلب بسيط بنفس الشكل اللي المعالج بيقراه: هيدر origin ممنوع في Request جوه المتصفح (الاختبارات المحلية) فبيتشال بصمت، وHeaders لوحده مسموح
  const fake = (method: string, headers: Record<string, string>, raw = '') => ({ method, headers: new Headers(headers), text: () => Promise.resolve(raw) }) as unknown as Request;
  const post = async (body: unknown, headers: Record<string, string> = {}, raw?: string) => {
    const r = await handle(fake('POST', { origin: SITE_O, ...headers }, raw !== undefined ? raw : JSON.stringify(body)));
    return { status: r.status, body: await r.json().catch(() => null), cors: r.headers.get('access-control-allow-origin') };
  };
  try {
    // الطرق وCORS
    const opt = await handle(fake('OPTIONS', { origin: SITE_O }));
    assertEquals([opt.status, opt.headers.get('access-control-allow-origin')], [204, SITE_O]);
    const evil = await handle(fake('OPTIONS', { origin: 'https://evil.example' }));
    assertEquals(evil.headers.get('access-control-allow-origin'), null, 'another site gets no CORS');
    assertEquals((await handle(fake('GET', { origin: SITE_O }))).status, 405);
    // الجسم: JSON بس، و١٦ كيلو — إلا حفظ الإعدادات لحد ٢٥٦
    assertEquals((await post(null, {}, '{bad')).status, 400);
    assertEquals((await post(null, {}, JSON.stringify({ action: 'ping', pad: 'x'.repeat(17 * 1024) }))).status, 413, 'over 16 KB');
    assertEquals((await post(null, {}, JSON.stringify({ action: 'usettings.set', pad: 'x'.repeat(100 * 1024) }))).status, 401, 'settings may be bigger (then the login check)');
    assertEquals((await post(null, {}, JSON.stringify({ action: 'usettings.set', pad: 'x'.repeat(300 * 1024) }))).status, 413, 'but not over 256 KB');
    // العامة من غير دخول، والمُشغّل بمفتاحه بس
    const ping = await post({ action: 'ping' });
    assertEquals([ping.status, ping.cors], [200, SITE_O]);
    assertEquals((await post({ action: 'run' }, { 'x-runner-key': 'guess' })).status, 403, 'the runner only with its key');
    // كل الباقي: دخول مكتمل الأول — حتى لو الطلب فيه مفتاح Meta، مفيش سؤال لـ Meta قبل الدخول
    for (const action of ['seen', 'list', 'save', 'selfcheck', 'testmail', 'digest.preview', 'digest.previewSummary', 'digest.status', 'meta.seal', 'meta.renew',
      'usettings.get', 'usettings.set', 'settings.get', 'episodes.sync', 'episodes.decide', 'nonsense', '']) {
      asked.length = 0;
      const r = await post({ action, token: TOK, accountId: 'act_1', viewKey: 'meta:act_1' });
      assertEquals([r.status, r.body], [401, { error: 'login', code: 'LOGIN' }], JSON.stringify(action));
      assert(asked.every((u) => u.indexOf('graph.facebook.com') < 0), action + ': nothing asked of Meta before the login check');
    }
    // بعد الدخول: مفتاح Meta بشكل غلط قبل أي حاجة، وعملية مش معروفة، والحساب والعرض بالشكل الصحيح بس، ورفض Meta = مفيش كتابة
    sessionOk = true;
    const auth = { authorization: 'Bearer ' + (await jwt(good())) };
    assertEquals((await post({ action: 'nonsense' }, auth)).body, { error: 'token' }, 'a malformed Meta key first');
    assertEquals((await post({ action: 'nonsense', token: TOK }, auth)).body, { error: 'action' });
    assertEquals((await post({ action: 'seen', token: TOK, accountId: 'act_x' }, auth)).body, { error: 'account' });
    assertEquals((await post({ action: 'list', token: TOK, viewKey: 'google:1' }, auth)).body, { error: 'view' }, 'only Meta views are kept on the server');
    asked.length = 0;
    assertEquals((await post({ action: 'seen', token: TOK, accountId: 'act_1' }, auth)).body, { error: 'not verified' });
    assert(!asked.some((u) => u.indexOf('touch_account') > -1), 'Meta said no: nothing written');
    // الخطأ الداخلي: ٥٠٢ من غير أي تفاصيل (ولا رسالة قاعدة البيانات)
    beatFails = true;
    const up = await post({ action: 'ping' });
    assertEquals([up.status, up.body], [502, { error: 'upstream' }]);
  } finally { restoreFetch(); }
});
// إجابة «هل كان التشخيص صحيحاً؟» (save — cleanEntry): أي حقل غريب بيترفض أو بيتشال قبل قاعدة البيانات، والمستخدم من الدخول مش من الطلب.
// و(١١٧) الملاحظة كانت بتتحفظ بالمحارف المخفية (علامات الاتجاه والصفرية العرض) خلافاً لكل النصوص التانية — دلوقتي بتتشال، والسطور بتفضل
Deno.test('إجابة التشخيص: الحقول الغريبة بتترفض أو بتتشال، والمستخدم من الدخول، والملاحظة من غير محارف مخفية وسطورها باقية', async () => {
  const TOK = 'EAAB' + 'x'.repeat(40), saved: any[] = [];
  stubFetch((url, init) => {
    if (url === ISSUER + '/.well-known/jwks.json') return json({ keys: [{ ...publicJwk, kid: 'k1' }] });
    if (url.indexOf('/rest/v1/rpc/session_ok') > -1) return json(true);
    if (url.indexOf('graph.facebook.com') > -1) return json({ id: 'act_1', name: 'A', currency: 'SAR', timezone_name: 'Asia/Riyadh' });
    if (url.indexOf('/rest/v1/feedback') > -1) { saved.push(JSON.parse(String(init && init.body))); return new Response(null, { status: 201 }); }
    return json({ message: 'unexpected' }, 500);
  });
  const auth = { authorization: 'Bearer ' + (await jwt(good())) };
  const save = async (entry: unknown, info: unknown = {}) => {
    const r = await handle(({ method: 'POST', headers: new Headers(auth), text: () => Promise.resolve(JSON.stringify({ action: 'save', token: TOK, viewKey: 'meta:act_1', entry, info })) }) as unknown as Request);
    return [r.status, await r.json()];
  };
  const ok = { block: 'why|cpa', since: '2026-11-01', until: '2026-11-07', verdict: 'no', reasons: ['price', 'evil', 'stock'], note: 'السعر\u202e اتغيّر\r\nوالمخزون\u200b خلص', at: '2099-01-01T00:00:00Z', user_id: 'forged' };
  try {
    assertEquals(await save(ok, { kind: 'why', title: 'عنوان\u2066', head: 'cpa', lang: 'ar' }), [200, { ok: true }]);
    const row = saved[0];
    assertEquals([row.user_id, row.view_key, row.block, row.verdict, row.reasons, row.block_kind, row.head_type, row.lang], ['user-1', 'meta:act_1', 'why|cpa', 'no', ['stock', 'price'], 'why', 'cpa', 'ar'],
      'the user from the login; unknown reasons dropped, the rest in the known order');
    assertEquals(row.note, 'السعر  اتغيّر\nوالمخزون  خلص', 'hidden characters out, lines kept');
    assertEquals(row.block_title, 'عنوان ');
    assert(Date.parse(row.answered_at) <= Date.now(), 'an answer time in the future becomes the time it arrived');
    // كل حقل غلط = ٤٠٠ ومفيش كتابة
    for (const bad of [null, { ...ok, block: '' }, { ...ok, block: 'a\u0001b' }, { ...ok, block: 'x'.repeat(201) }, { ...ok, since: '2026-02-30' }, { ...ok, until: '2026-10-31' },
      { ...ok, since: '1/11/2026' }, { ...ok, verdict: 'maybe' }]) {
      assertEquals(await save(bad), [400, { error: 'entry' }], JSON.stringify(bad && { block: (bad as any).block, since: (bad as any).since, until: (bad as any).until, verdict: (bad as any).verdict }));
    }
    assertEquals(saved.length, 1, 'nothing written from a bad answer');
    // معلومات الكتلة الغريبة بتتشال من غير ما ترفض الإجابة
    assertEquals(await save(ok, { kind: 'evil', head: 'a b', lang: 'fr' }), [200, { ok: true }]);
    assertEquals([saved[1].block_kind, saved[1].head_type, saved[1].lang, saved[1].block_title], [null, null, null, null]);
  } finally { restoreFetch(); }
});
// الفحص الذاتي والرسالة التجريبية (لمدير التطبيق بس): الرد بيقول السر موجود وشكله سليم من غير أي جزء منه، وأسماء المتغيرات من غير قيمها،
// والرسالة التجريبية لعنوان الدعم الثابت بس (مبتاخدش مستلم من الطلب — مش أداة إرسال لأي حد)
Deno.test('الفحص الذاتي والرسالة التجريبية: للمدير بس، من غير أي قيمة سر في الرد، والمستلم ثابت', async () => {
  const TOK = 'EAAB' + 'x'.repeat(40), mails: any[] = [], hadResend = Deno.env.get('RESEND_API_KEY');
  Deno.env.set('RESEND_API_KEY', 're_SECRET_resend_value_123');
  let admin = true;
  stubFetch((url, init) => {
    if (url === ISSUER + '/.well-known/jwks.json') return json({ keys: [{ ...publicJwk, kid: 'k1' }] });
    if (url.indexOf('/rest/v1/rpc/session_ok') > -1) return json(true);
    if (url.indexOf('/roles?') > -1) return json({ data: [{ user: '111', role: 'administrators' }] });
    if (url.indexOf('/me?') > -1) return json({ id: admin ? '111' : '222' });
    if (url.indexOf('api.resend.com/domains') > -1) return json({ data: [{ name: 'adscenter.online', status: 'verified', region: 'eu-west-1' }] });
    if (url.indexOf('api.resend.com/emails') > -1) { mails.push(JSON.parse(String(init && init.body))); return json({ id: 'm1' }); }
    return json({ message: 'unexpected' }, 500);
  });
  const auth = { authorization: 'Bearer ' + (await jwt(good())) };
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const r = await handle(({ method: 'POST', headers: new Headers(auth), text: () => Promise.resolve(JSON.stringify({ action, token: TOK, ...extra })) }) as unknown as Request);
    return [r.status, await r.json()];
  };
  try {
    const [st, out] = await call('selfcheck');
    assertEquals([st, out.ok, out.metaSecretValid, out.tokenKey.set, out.tokenKey.ok, out.metaSecret.set, out.resend.set, out.resend.domains[0].status], [200, true, true, true, true, true, true, 'verified']);
    assert(out.custom.indexOf('META_APP_SECRET') > -1 && out.custom.indexOf('RESEND_API_KEY') > -1, 'variable names are listed');
    const text = JSON.stringify(out);
    for (const secret of [Deno.env.get('TOKEN_ENC_KEY') as string, Deno.env.get('META_APP_SECRET') as string, 're_SECRET_resend_value_123']) {
      assert(text.indexOf(secret) < 0 && text.indexOf(secret.slice(0, 8)) < 0, 'no secret value, not even its start, in the reply');
    }
    // الرسالة التجريبية: لعنوان الدعم بس، حتى لو الطلب فيه مستلم
    assertEquals((await call('testmail', { to: 'someone@evil.example', email: 'someone@evil.example' }))[0], 200);
    assertEquals(mails.map((m) => m.to), [['support@adscenter.online']]);
    // غير المدير: ٤٠٣ ومفيش رسالة
    admin = false;
    assertEquals((await call('selfcheck'))[0], 403);
    assertEquals([(await call('testmail'))[0], mails.length], [403, 1]);
  } finally {
    restoreFetch();
    if (hadResend === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', hadResend);
  }
});
// التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٦): «نسيت كلمة المرور» على الخادم (forgotMail) مكانش ليه أي اختبار — والرد واحد في كل الحالات (التدقيق
// ١١ نوفمبر، ٢: فرق الزمن كان بيقول مين مسجّل). بريد مش مسموح له مبيوصلوش حاجة، ورابط واحد كل دقيقتين و٥ في اليوم، وأول مرة الحساب
// بيتعمل، والرابط على موقعنا بالرمز اللي شكله سليم بس (رمز غريب عمره ما يدخل رابط)
Deno.test('نسيت كلمة المرور: رد واحد في كل الحالات، والرابط للمسموح له بس، ودقيقتين بين الرسائل و٥ في اليوم، وأول مرة الحساب بيتعمل', async () => {
  const st = { access: true, userId: 'u1' as string | null, log: [] as any[], made: [] as any[], links: 0, hashed: 'abcDEF_123-xyz', mails: [] as any[], logged: [] as any[] };
  Deno.env.set('RESEND_API_KEY', 'test-resend-key');
  stubFetch((url, init) => {
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    if (url.indexOf('api.resend.com') > -1) { st.mails.push(body); return json({ id: 'm' + st.mails.length }); }
    if (url.indexOf('/rest/v1/app_access') > -1) return json(st.access ? [{ role: 'pilot' }] : []);
    if (url.indexOf('/rest/v1/auth_mail_log') > -1) {
      if (init && init.method === 'POST') { st.logged.push(body); return new Response(null, { status: 201 }); }
      return json(st.log);
    }
    if (url.indexOf('/rest/v1/rpc/auth_user_id') > -1) return json(st.userId);
    if (url.indexOf('/auth/v1/admin/users') > -1) { st.made.push(body); return json({ id: 'new' }); }
    if (url.indexOf('/auth/v1/admin/generate_link') > -1) { st.links++; return json({ properties: { hashed_token: st.hashed } }); }
    return json({ message: 'unexpected ' + url }, 500);
  });
  const forgot = async (email: string, lang = 'ar') => {
    const r = await handleLogin('login.forgot', { email, lang }, new Request('https://x.test'), null);
    return [r.status, await r.json()];
  };
  try {
    // بريد مش مسموح له: «تم» زي أي حد، ومفيش رابط ولا حساب
    st.access = false;
    assertEquals(await forgot('who@x.example'), [200, { ok: true }]);
    assertEquals([st.mails.length, st.links, st.made.length], [0, 0, 0], 'not allowed: nothing sent, nothing made');
    // مسموح له، أول مرة: الحساب بيتعمل (بريد مأكَّد — هو اللي هيستقبل الرابط) والرابط على موقعنا
    st.access = true; st.userId = null;
    assertEquals(await forgot('Sara@X.example', 'en'), [200, { ok: true }]);
    assertEquals(st.made, [{ email: 'sara@x.example', email_confirm: true }]);
    assertEquals([st.mails.length, st.mails[0].to, st.mails[0].subject], [1, ['sara@x.example'], 'Set your Ads Center password']);
    assert(st.mails[0].html.indexOf('href="https://adscenter.online/login?reset=abcDEF_123-xyz&amp;lang=en"') > -1, 'the link on our site, escaped in the button');
    assert(st.mails[0].text.indexOf('https://adscenter.online/login?reset=abcDEF_123-xyz&lang=en') > -1, 'and in the plain text');
    assertEquals(st.logged, [{ email: 'sara@x.example', kind: 'password' }]);
    // الحساب موجود: مفيش حساب جديد، والرسالة بالعربي
    st.userId = 'u1'; st.made = []; st.mails = [];
    await forgot('sara@x.example');
    assertEquals([st.made.length, st.mails.length, st.mails[0].subject], [0, 1, 'إنشاء كلمة مرور الدخول إلى Ads Center']);
    // آخر رابط من أقل من دقيقتين، أو ٥ في آخر ٢٤ ساعة: مفيش رابط جديد — والرد «تم» برضه
    st.mails = [];
    st.log = [{ sent_at: new Date(Date.now() - 60000).toISOString() }];
    assertEquals(await forgot('sara@x.example'), [200, { ok: true }]);
    st.log = Array.from({ length: 5 }, (_, i) => ({ sent_at: new Date(Date.now() - (i + 1) * 3600000).toISOString() }));
    assertEquals(await forgot('sara@x.example'), [200, { ok: true }]);
    assertEquals(st.mails.length, 0, 'within two minutes, or the fifth today: no new link');
    st.log = [{ sent_at: new Date(Date.now() - 3 * 60000).toISOString() }];
    await forgot('sara@x.example');
    assertEquals(st.mails.length, 1, 'after two minutes: a new link');
    // رمز الرابط بشكل غريب: مفيش رسالة، والرد «تم»
    st.mails = []; st.log = []; st.hashed = 'x"><script>';
    assertEquals(await forgot('sara@x.example'), [200, { ok: true }]);
    assertEquals(st.mails.length, 0, 'an odd token never goes into a link');
    // بريد بشكل غلط: ٤٠٠ قبل أي بحث
    assertEquals((await forgot('nope'))[0], 400);
  } finally { restoreDigestEnv(); }
});

// التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (NIST SP 800-63B §5.2.2): عدّاد المحاولات كان بيتقري وبعدين يتكتب، فطلبات في نفس اللحظة تعدّي الحد،
// ومفيش حد لكل مستخدم عبر جلساته. دلوقتي الخصم في قاعدة البيانات قبل المقارنة (login_try)
Deno.test('رمز الدخول: المحاولة بتتخصم في قاعدة البيانات قبل المقارنة، وحد اليوم بيقفل، وقاعدة بيانات من غير الدالة بتكمّل بالعدّ القديم', async () => {
  const hash = await linkSig('ads-center/login-code/v1:', 'session-1:123456');
  let tryReply: unknown = 3, tryStatus = 200, saved: any[] = [], tries = 0;
  stubFetch((url, init) => {
    if (url === ISSUER + '/.well-known/jwks.json') return json({ keys: [{ ...publicJwk, kid: 'k1' }] });
    if (url.indexOf('/rest/v1/app_access') > -1) return json([{ role: 'pilot' }]);
    if (url.indexOf('/rest/v1/login_sessions') > -1) {
      if (init && init.method === 'POST') { saved.push(JSON.parse(String(init.body))); return new Response(null, { status: 201 }); }
      return json([{ session_id: 'session-1', user_id: 'user-1', code_hash: hash, code_expires_at: new Date(Date.now() + 60000).toISOString(),
        attempts: 2, sends: 1, verified_at: null }]);
    }
    if (url.indexOf('/rest/v1/rpc/login_try') > -1) { tries++; return tryStatus === 200 ? json(tryReply) : json({ code: 'PGRST202' }, tryStatus); }
    throw new Error('unexpected fetch ' + url);
  });
  const call = async (code: string) => {
    const req = new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer ' + (await jwt(good())) } });
    const r = await handleLogin('login.verify', { code }, req, null);
    return { status: r.status, body: await r.json() };
  };
  try {
    // رمز غلط: المحاولة اتخصمت الأول (التالتة من خمسة)، والباقي من العدّاد اللي رجع من قاعدة البيانات — مش من القراءة اللي قبلها
    assertEquals(await call('000000'), { status: 400, body: { error: 'code', left: 2 } });
    assertEquals([tries, saved.length], [1, 0], 'counted in the database, no read-then-write');
    // الرمز الصح: الجلسة بتتأكد
    const ok = await call('123456');
    assertEquals([ok.status, ok.body.verified, saved.length, !!saved[0].verified_at], [200, true, 1, true]);
    // محاولات الرمز خلصت (الدالة مرجّعتش رقم)، وحد اليوم للمستخدم (-1): مفيش تأكيد حتى بالرمز الصح
    tryReply = null;
    assertEquals(await call('123456'), { status: 429, body: { error: 'tries' } });
    tryReply = -1;
    assertEquals(await call('123456'), { status: 429, body: { error: 'locked' } });
    assertEquals(saved.length, 1, 'nothing verified past the limits');
    // قاعدة بيانات لسه من غير الدالة (٤٠٤ — الترحيل ماتطبّقش): العدّ القديم بيكمّل والدخول مبيقفش
    tryStatus = 404; saved = [];
    assertEquals(await call('000000'), { status: 400, body: { error: 'code', left: 2 } });
    assertEquals(saved.map((x) => x.attempts), [3], 'the old counter');
    assertEquals([counterMissing(new Error('db 404 {}')), counterMissing(new Error('db 500 boom'))], [true, false]);
  } finally { restoreFetch(); }
});

// ---------- metalink.ts ----------
Deno.test('ربط Meta المحفوظ على الجهاز: بيرجع لنفس حساب الدخول بس، وطول ما Meta قابلاه', async () => {
  let me: 'ok' | 'revoked' | 'down' = 'ok';
  stubFetch((url) => {
    if (url.indexOf('/oauth/access_token') > -1) return json({ access_token: 'LONGTOKEN_abcdefghijklmnopqrstuvwxyz', expires_in: 60 * 86400 });
    if (url.indexOf('/me?') > -1) {
      if (me === 'down') throw new TypeError('network down');
      return me === 'ok' ? json({ id: '42' }) : json({ error: { code: 190, message: 'expired' } }, 400);
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const sealed = await handleMetaLink('meta.seal', { token: 'SHORTTOKEN_abcdefghijklmnop' }, 'user-a', null);
    assertEquals(sealed.status, 200);
    const j = await sealed.json();
    assertEquals(j.access_token, 'LONGTOKEN_abcdefghijklmnopqrstuvwxyz');
    assertMatch(j.sealed, /^m1\./);

    const renew = (sealedText: string, user: string) => handleMetaLink('meta.renew', { sealed: sealedText }, user, null);
    const ok = await renew(j.sealed, 'user-a');
    assertEquals(ok.status, 200);
    assertEquals((await ok.json()).access_token, 'LONGTOKEN_abcdefghijklmnopqrstuvwxyz');

    assertEquals((await renew(j.sealed, 'user-b')).status, 410, 'another sign-in account cannot open it');
    const parts = j.sealed.split('.');
    const flipped = parts[2].charAt(5) === 'A' ? 'B' : 'A';
    assertEquals((await renew(parts[0] + '.' + parts[1] + '.' + parts[2].slice(0, 5) + flipped + parts[2].slice(6), 'user-a')).status, 410, 'tampered');
    assertEquals((await renew('garbage', 'user-a')).status, 410, 'not a sealed link');

    me = 'revoked';
    assertEquals((await renew(j.sealed, 'user-a')).status, 410, 'Meta rejected the token');
    me = 'down';
    assertEquals((await renew(j.sealed, 'user-a')).status, 502, 'Meta unreachable is not the same as rejected');
  } finally { restoreFetch(); }
});

// ---------- runner.ts ----------
Deno.test('حدود Meta: مستوى الوصول وأعلى استهلاك من ترويسات الرد (من غير أي بيانات حساب)', () => {
  const u = freshUsage();
  readUsage(new Headers({ 'x-ad-account-usage': JSON.stringify({ acc_id_util_pct: 42, reset_time_duration: 120, ads_api_access_tier: 'development_access' }) }), u);
  readUsage(new Headers({ 'x-business-use-case-usage': JSON.stringify({ '123': [{ type: 'ads_insights', call_count: 7, total_cputime: 55, total_time: 3, estimated_time_to_regain_access: 0 }] }) }), u);
  readUsage(new Headers({ 'x-ad-account-usage': 'not json' }), u);
  readUsage(new Headers(), u);
  assertEquals(u, { tier: 'development_access', accPct: 42, bucPct: 55, appPct: 0, regainMin: 0, calls: 4 });
  // الاسم اللي في الصفحة الرسمية، والحجب
  readUsage(new Headers({ 'x-business-use-case': JSON.stringify({ '1': [{ call_count: 100, estimated_time_to_regain_access: 5 }] }) }), u);
  assertEquals([u.bucPct, u.regainMin, u.calls], [100, 5, 5]);
  // حد التطبيق كله (٣١ أكتوبر — المُشغّل بيوقف حسابات Meta في التشغيل لما يقرب منه): أعلى نسبة من الثلاثة
  readUsage(new Headers({ 'x-app-usage': JSON.stringify({ call_count: 12, total_cputime: 80, total_time: 30 }) }), u);
  assertEquals(u.appPct, 80);
});
// الملخص بحسابات كتير (٣١ أكتوبر ٢٠٢٦): التخطيط من غير المحرك، ومفاتيح الفترات، وإمتى العاجل يتبعت، وشكل الرسالة المختصر
Deno.test('التواريخ من غير المحرك ومفاتيح فترات الملخص', () => {
  assertEquals([addDays('2026-10-31', 1), addDays('2026-03-01', -1), addDays('2024-03-01', -1)], ['2026-11-01', '2026-02-28', '2024-02-29']);
  assertEquals([daysBetween('2026-10-25', '2026-11-04'), daysBetween('2026-11-04', '2026-10-25')], [10, -10]);
  // الأربعاء بعد ملخص الأحد = الأحد–الثلاثاء، وأول ملخص (أو بعد انقطاع طويل) = من آخر يوم ملخص في الجدول
  assertEquals(summaryWindow([0, 3], '2026-10-24', '2026-10-28', 3), { since: '2026-10-25', until: '2026-10-27' });
  assertEquals(summaryWindow([0, 3], null, '2026-10-28', 3), { since: '2026-10-25', until: '2026-10-27' });
  assertEquals(summaryWindow([0, 3], '2026-10-27', '2026-10-28', 3), null, 'already covered');
  const w = { since: '2026-11-01', until: '2026-11-03' };
  assertEquals([windowKey(w), keyWindow(windowKey(w)), keyWindow('bad'), keyWindow(null)], ['2026-11-01..2026-11-03', w, null, null]);
  assertEquals([monthWindow('2026-02'), monthWindow('2024-02'), monthWindow('2026-13x')],
    [{ since: '2026-02-01', until: '2026-02-28', month: '2026-02' }, { since: '2024-02-01', until: '2024-02-29', month: '2024-02' }, null]);
});
// ر٥ (مراجعة ١ نوفمبر): ميعاد الملخص بتوقيت المستخدم، وحساب بتوقيت متأخر يومه الأخير لسه مخلصش — قسمه بيستنى
Deno.test('قسم الملخص بيستنى لحد ما آخر يوم في الفترة يكمل بتوقيت الحساب نفسه', () => {
  const today = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ahead = 'Pacific/Kiritimati', behind = 'Pacific/Pago_Pago';   // +14 و-11: الفرق ٢٥ ساعة
  assert(!windowComplete({ until: today(ahead) }, behind), 'a day that has not ended there yet');
  assert(!windowComplete({ until: today(behind) }, behind), 'today is never complete');
  assert(windowComplete({ until: addDays(today(behind), -1) }, ahead), 'yesterday there is over everywhere ahead');
});
Deno.test('العاجل بيستنى باقي حسابات المستخدم (محجوز أو عليه فحص) بحد أقصى ربع ساعة', () => {
  const now = Date.parse('2026-10-31T12:00:00Z'), ago = (min: number) => new Date(now - min * 60000).toISOString();
  const done: { checked_at: string | null; claimed_until?: string | null }[] = [{ checked_at: ago(5) }, { checked_at: ago(10), claimed_until: ago(1) }];
  assert(urgentReady(done, now - 60000, true, now), 'the hour\'s checks are done');
  assert(!urgentReady(done.concat([{ checked_at: ago(55) }]), now - 60000, true, now), 'an account still due this hour');
  assert(urgentReady(done.concat([{ checked_at: ago(55) }]), now - 60000, false, now), 'at night no check is coming');
  assert(!urgentReady(done.concat([{ checked_at: ago(1), claimed_until: new Date(now + 60000).toISOString() }]), now - 60000, true, now), 'one being checked now');
  assert(urgentReady(done.concat([{ checked_at: null }]), now - 16 * 60000, true, now), 'at most a quarter of an hour');
});
Deno.test('رسالة الملخص بحسابات كتير: التفاصيل للحسابات اللي محتاجة انتباه بس', () => {
  assertEquals([needsAttention({ sum: { composed: { tone: 'bad' } } }), needsAttention({ sum: { composed: { tone: 'mixed' } } }),
    needsAttention({ sum: { composed: { tone: 'good' } } }), needsAttention({ sum: { composed: { tone: 'neutral' } } })], [true, true, false, false]);
});

// مراجعة المرحلة ٢ (١٧ أكتوبر — Google SRE، فصل ٢٢): كل طلب Meta في المُشغّل له مهلة، ومفيش طلب بيتبعت بعد نهاية التشغيل
Deno.test('مهلة طلبات Meta في المُشغّل: ٤٠ ثانية، أو اللي فاضل للتشغيل، ومفيش طلب بعد النهاية', () => {
  const now = 1_000_000;
  assertEquals(callTimeout(0, now), 40000, 'previews: no run deadline, the per-call timeout only');
  assertEquals(callTimeout(now + 100000, now), 40000, 'plenty of time left');
  assertEquals(callTimeout(now + 4000, now), 4000, 'only what is left of the run');
  let threw = '';
  try { callTimeout(now, now); } catch (e) { threw = String((e as Error).message); }
  assertEquals(threw, 'run deadline', 'no call after the run deadline');
});


// ---------- دورة حياة التنبيه العاجل (المراجعة الثانية للمرحلة ٥) ----------
Deno.test('بصمة المشكلة بالعيلة: أنواع أداء الإعلان كلها بصمة واحدة، وإنفاق الحساب واحدة، والباقي بنوعه', () => {
  for (const k of ['waste', 'waste-week', 'loss', 'cost-max', 'cpr', 'fatigue', 'waste-early', 'drop', 'spike', 'waste-new']) assertEquals(familyOf(k), 'perf', k);
  assertEquals([familyOf('acct-zero'), familyOf('acct-drop')], ['acct-spend', 'acct-spend']);
  for (const k of ['top-stopped', 'stopped', 'tracking-off', 'link-broken', 'big-edit', 'connection', 'expiry', 'spend-cap-near']) assertEquals(familyOf(k), k, k);
});
Deno.test('البصمات القديمة بنوعها («loss») بتتقري تحت مفتاح عيلتها — المفتوح يكسب، وبين المفتوحين الأقدم', () => {
  const row = (kind: string, first: string, resolved: string | null) => ({ kind, object_id: '7', first_at: first, last_sent_at: first, last_seen_at: first, times_sent: 1, resolved_at: resolved });
  const m = markMap([row('waste', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'), row('loss', '2026-10-05T00:00:00Z', null), row('cpr', '2026-10-06T00:00:00Z', null)]);
  assertEquals(Object.keys(m), ['perf|7']);
  assertEquals(m['perf|7'].kind, 'loss');
  // وبيتحدّث بنفس صفه القديم (kind زي ما هو) — مفيش بريد «جديد» عن مشكلة اتبعتت قبل التغيير
  assertEquals(markMap([row('connection', '2026-10-01T00:00:00Z', null)])['connection|7'].kind, 'connection');
});
Deno.test('«حُلّت» بس لما المشكلة تختفي فعلاً: «مهم» = لسه قائمة، ومصدر فشل = منعرفش، وغياب ٢٤ ساعة = حُلّت', () => {
  const now = Date.parse('2026-10-24T12:00:00Z'), ok = { site: false, edits: false, links: false };
  const old = { kind: 'perf', last_code: 'waste', last_seen_at: '2026-10-23T06:00:00Z' };       // ٣٠ ساعة
  const recent = { kind: 'perf', last_code: 'waste', last_seen_at: '2026-10-24T06:00:00Z' };    // ٦ ساعات
  assertEquals(resolveNow(old, false, ok, now), 'resolve');
  assertEquals(resolveNow(recent, false, ok, now), 'keep');
  // نزلت «مهم» (حد «عاجل» اتحرك): لسه قائمة — كانت «حُلّت» بعد ٢٤ ساعة ثم «عاجل» جديد لما ترجع
  assertEquals(resolveNow(old, true, ok, now), 'seen');
  // طلب الموقع فشل في الفحص ده: «التتبّع متوقف» مبيتقفلش — والروابط لوحدها
  const track = { kind: 'tracking-off', last_code: 'tracking-off', last_seen_at: '2026-10-23T06:00:00Z' };
  assertEquals(resolveNow(track, false, { site: true, edits: false, links: false }, now), 'keep');
  assertEquals(resolveNow(track, false, { site: false, edits: false, links: true }, now), 'resolve');
  assertEquals(resolveNow({ kind: 'link-broken', last_seen_at: '2026-10-23T06:00:00Z' }, false, { site: false, edits: false, links: true }, now), 'keep');
});
// التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٦): قرار العاجل (urgentPass) مكانش ليه أي اختبار — وهو اللي بينفّذ الوعد اللي العميل شايفه في
// الرسالة: «لن تصلك رسالة أخرى عن هذا التنبيه وحده إلا تذكيراً واحداً إذا استمر يومين». الجديد بيتبعت (والمكرر في نفس التشغيل مرة)،
// والمستمر بعد يومين تذكير واحد بنصه الحالي، وبعدها «لسه قائم» بس، واللي اتقفل «حُلّت» ورجع جديد، واللي اختفى بيتقفل بقاعدة resolveNow،
// وتنبيهات النظام (الربط) مبتتقفلش هنا
Deno.test('قرار العاجل: الجديد مرة، وتذكير واحد بعد يومين، وبعدها «قائم» بس، واللي اختفى بيتقفل بقاعدة resolveNow', () => {
  const H = 3600000, now = Date.now(), ago = (h: number) => new Date(now - h * H).toISOString();
  const fam = familyOf('cpr'), famT = familyOf('tracking-off');
  const mark = (kind: string, obj: string, o: Record<string, unknown> = {}) =>
    ({ kind, object_id: obj, first_at: ago(100), last_sent_at: ago(10), last_seen_at: ago(1), times_sent: 1, resolved_at: null as string | null, last_code: 'cpr', ...o });
  const al = (obj: string, title = 'T-' + obj) => ({ code: 'cpr', adId: obj, title, adName: 'N-' + obj });
  const marks: Record<string, any> = {
    [fam + '|Y']: mark(fam, 'Y', { last_sent_at: ago(49) }),                     // اتبعت مرة من ٤٩ ساعة: تذكير
    [fam + '|Y2']: mark(fam, 'Y2', { last_sent_at: ago(47) }),                   // من ٤٧ ساعة: لسه بدري — قائم
    [fam + '|Z']: mark(fam, 'Z', { times_sent: 2, last_sent_at: ago(200) }),     // اتبعت مرتين: قائم بس مهما طال
    [fam + '|W']: mark(fam, 'W', { resolved_at: ago(30) }),                      // اتقفلت «حُلّت» ورجعت: جديد
    [fam + '|V']: mark(fam, 'V'),                                                // مش عاجل دلوقتي بس «مهم»: لسه ظاهرة
    [fam + '|U']: mark(fam, 'U', { last_seen_at: ago(25) }),                     // اختفت ٢٥ ساعة: حُلّت
    [fam + '|U2']: mark(fam, 'U2', { last_seen_at: ago(23) }),                   // ٢٣ ساعة: لسه
    [famT + '|S']: mark(famT, 'S', { last_code: 'tracking-off', last_seen_at: ago(30) }), // طلب الموقع فشل: منعرفش
    ['connection|act_1']: mark('connection', 'act_1', { last_seen_at: ago(500), last_code: 'connection' })  // تنبيه نظام: مش هنا
  };
  const res: any = { platform: 'meta', account: 'act_1', name: 'A', section: null };
  const keep: any[] = [], sent: any[] = [];
  urgentPass(res, { urgent: [al('X'), al('X', 'dup'), al('Y', 'worse now'), al('Y2'), al('Z'), al('W')], alive: { [fam + '|V']: true },
    failed: { site: true, edits: false, links: false } }, marks, keep, sent);
  assertEquals(res.section.fresh.map((a: any) => a.adId), ['X', 'W'], 'new, and back after «resolved»; the duplicate once');
  assertEquals(res.section.remind.map((r: any) => [r.a.adId, r.a.title]), [['Y', 'worse now']], 'one reminder, with the alert as it reads now');
  assertEquals(res.ongoing.map((o: any) => o.name), ['N-Y2', 'N-Z'], 'the rest: still ongoing');
  assertEquals(res.section.ongoing, res.ongoing);
  assertEquals(sent.map((m) => [m.object_id, m.times_sent, m.first_at === m.last_sent_at]), [['X', 1, true], ['Y', 2, false], ['W', 1, true]],
    'a fresh mark for the new; the reminder counts as the second (and last) send');
  assertEquals(keep.map((m) => [m.object_id, !!m.resolved_at]), [['Y2', false], ['Z', false], ['V', false], ['U', true]],
    'seen again (ongoing and «important»), resolved after 24h gone; not after 23h, not with a failed source, not a system alert');
  // مفيش جديد ولا تذكير: مفيش قسم (مفيش رسالة عاجلة)، والقائم بيتسجّل بس
  const res2: any = { platform: 'meta', account: 'act_1', name: 'A', section: null };
  urgentPass(res2, { urgent: [al('Z')], alive: {}, failed: { site: false, edits: false, links: false } }, { [fam + '|Z']: marks[fam + '|Z'] }, [], []);
  assertEquals([res2.section, res2.ongoing.map((o: any) => o.name)], [null, ['N-Z']]);
  // تذكير لوحده (من غير جديد): رسالة عاجلة برضه
  const res3: any = { platform: 'meta', account: 'act_1', name: 'A', section: null };
  urgentPass(res3, { urgent: [al('Y')], alive: {}, failed: { site: false, edits: false, links: false } }, { [fam + '|Y']: marks[fam + '|Y'] }, [], []);
  assertEquals([res3.section && res3.section.fresh.length, res3.section && res3.section.remind.length], [0, 1], 'a reminder alone is a message');
  // القائم واللي لسه «مهم» بيتحدّث آخر ظهورهم دلوقتي — من غيره بيتقفلوا «حُلّت» بعد ٢٤ ساعة وهم لسه ظاهرين
  const fresh = (m: any) => Date.parse(m.last_seen_at) >= now;
  assertEquals(keep.filter((m) => !m.resolved_at).map((m) => [m.object_id, fresh(m)]), [['Y2', true], ['Z', true], ['V', true]]);
});
// التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٦): بوابة العمليات الإدارية (isAppAdmin — معاينة الملخص والفحص الذاتي والرسالة التجريبية) مكانش ليها
// اختبار: مدير تطبيق Meta بس (administrators) — مش المطوّر ولا مستخدم تاني ولا مفتاح من غير صاحب — والمفتاح مبيروحش غير Graph. ومن غير سر
// التطبيق، أو لو قايمة الأدوار فشلت = null (منعرفش)، والمستدعي في handler.ts بيرفض null بـ 503 زي false بـ 403: مقفولة وقت الشك
Deno.test('بوابة المدير: مدير تطبيق Meta بس، والمفتاح لـ Graph بس، ومن غير سر أو لو القايمة فشلت = منعرفش', async () => {
  const real = globalThis.fetch, hadSecret = Deno.env.get('META_APP_SECRET'), asked: string[] = [];
  let roles: any = { data: [{ user: '111', role: 'administrators' }, { user: '222', role: 'developers' }, { user: 333, role: 'administrators' }] };
  let me: any = { id: '111' };
  globalThis.fetch = ((url: string) => {
    const u = String(url);
    asked.push(u);
    const body = u.indexOf('/roles?') > -1 ? roles : (u.indexOf('/me?') > -1 ? me : null);
    return Promise.resolve(new Response(JSON.stringify(body), { status: body === 'fail' ? 500 : 200 }));
  }) as typeof fetch;
  try {
    Deno.env.delete('META_APP_SECRET');
    assertEquals([await isAppAdmin('TOKEN_A'), asked.length], [null, 0], 'no app secret: we cannot know, and nothing is asked');
    Deno.env.set('META_APP_SECRET', 'sec');
    assertEquals(await isAppAdmin('TOKEN_A'), true, 'an administrator');
    assert(asked.length > 0 && asked.every((u) => u.indexOf('https://graph.facebook.com/') === 0), 'only Graph (hosts — the key is never printed): ' + asked.map((u) => u.split('/')[2]).join(' '));
    me = { id: '222' };
    assertEquals(await isAppAdmin('TOKEN_A'), false, 'a developer is not an admin');
    me = { id: '333' };
    assertEquals(await isAppAdmin('TOKEN_A'), true, 'ids compared as text (Meta may send a number)');
    me = { id: '999' };
    assertEquals(await isAppAdmin('TOKEN_A'), false, 'another person');
    me = { error: { code: 190 } };
    assertEquals(await isAppAdmin('TOKEN_A'), false, 'a token without a person');
    me = { id: '111' }; roles = 'fail';
    assertEquals(await isAppAdmin('TOKEN_A'), null, 'the roles list failed: we cannot know');
    roles = { data: 'x' };
    assertEquals(await isAppAdmin('TOKEN_A'), null, 'a malformed roles list: we cannot know');
  } finally {
    globalThis.fetch = real;
    if (hadSecret === undefined) Deno.env.delete('META_APP_SECRET'); else Deno.env.set('META_APP_SECRET', hadSecret);
  }
});
// ---------- طلب الانضمام على الخادم (join.ts) — التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٦) ----------
// النموذج عام (أي حد يبعته) والتحقق في المتصفح بيتعدّى بسهولة، فالخادم هو الحاجز — ومكانش ليه أي اختبار: التنظيف (ورابط فيسبوك بيتفتح
// من إشعار صاحب الأداة: أي دومين تاني مرفوض)، وفخ البرامج، والموافقة، وحد الساعة، والطلب المكرر، وحصة البريد؛ ورابط الدعوة الموقّع
const JOIN_ID = '1a2b3c4d-2222-3333-4444-555555555555';   // فيه حروف: الرقم بحروف كبيرة لازم يترفض
function fakeJoinDb(opts: { budget?: boolean; recent?: number; mailFails?: boolean; race?: string } = {}) {
  const store = { reqs: [] as any[], mails: [] as any[], access: [] as any[], budget: [] as string[] };
  Deno.env.set('RESEND_API_KEY', 'test-resend-key');
  stubFetch((url, init) => {
    const method = (init && init.method) || 'GET', body = init && init.body ? JSON.parse(String(init.body)) : null;
    if (url.indexOf('api.resend.com') > -1) {
      if (opts.mailFails) return json({ message: 'down' }, 500);
      store.mails.push(body);
      return json({ id: 'mail-' + store.mails.length });
    }
    if (url.indexOf('/rest/v1/rpc/mail_budget_take') > -1) { store.budget.push(body.p_kind); return json(opts.budget !== false); }
    if (url.indexOf('/rest/v1/app_access') > -1) { store.access.push(body); return new Response(null, { status: 201 }); }
    if (url.indexOf('/rest/v1/pilot_requests') > -1) {
      const p = new URLSearchParams(url.split('?')[1] || '');
      if (method === 'GET') {
        if (p.get('updated_at')) return json(Array.from({ length: opts.recent || 0 }, (_, i) => ({ id: 'r' + i })));
        if (p.get('status') === 'eq.new' && p.get('reminded_at') === 'is.null') {
          const range = p.getAll('created_at'), lte = range.find((x) => x.indexOf('lte.') === 0), gte = range.find((x) => x.indexOf('gte.') === 0);
          return json(store.reqs.filter((r) => r.status === 'new' && !r.reminded_at && (!lte || r.created_at <= lte.slice(4)) && (!gte || r.created_at >= gte.slice(4)))
            .sort((a, b) => (a.created_at < b.created_at ? -1 : 1) * (String(p.get('order')).indexOf('.desc') > -1 ? -1 : 1)).slice(0, Number(p.get('limit') || 1000)));
        }
        return json(store.reqs.filter((r) => p.get('email') === 'eq.' + r.email || p.get('id') === 'eq.' + r.id).slice(0, 1));
      }
      if (method === 'POST') {
        const row = { id: JOIN_ID, submissions: 1, status: 'new', created_at: new Date().toISOString(), activated_at: null, ...body };
        store.reqs.push(row);
        return json([row], 201);
      }
      if (method === 'PATCH') {
        const r = store.reqs.find((x) => p.get('id') === 'eq.' + x.id);
        // الحجز: «لسه من غير تذكير» شرط في نفس التحديث — race = تشغيل تاني حجزه في نفس اللحظة
        if (p.get('reminded_at') === 'is.null') {
          if (!r || r.reminded_at || opts.race === r.id) return json([]);
          Object.assign(r, body);
          return json([r]);
        }
        if (r) Object.assign(r, body);
        return new Response(null, { status: 204 });
      }
    }
    return json({ error: 'unexpected ' + method + ' ' + url }, 500);
  });
  return store;
}
Deno.test('طلب الانضمام: الخادم هو الحاجز — التنظيف، ورابط فيسبوك على facebook.com بس، وفخ البرامج، والموافقة، والمكرر، وحد الساعة، وحصة البريد', async () => {
  const good = { role: 'media_buyer', name: '  سارة   ك  ', business: 'متجر', store: 'shop.example/a', country: 'السعودية', platforms: ['meta', 'evil', 'snapchat'],
    fb: '@sara.k', email: 'Sara@X.example', whatsapp: '+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧', consent: true, ms: 9000, lang: 'en' };
  const send = async (b: Record<string, unknown>) => { const r = await handleJoin('join', b, null); return [r.status, await r.json()]; };
  try {
    // فخ البرامج: الحقل المخفي أو أسرع من ثانيتين ونص — «تم» من غير حفظ ولا بريد
    let s = fakeJoinDb();
    assertEquals(await send({ ...good, hp: 'x' }), [200, { ok: true }]);
    assertEquals(await send({ ...good, ms: 1200 }), [200, { ok: true }]);
    assertEquals([s.reqs.length, s.mails.length], [0, 0], 'a bot gets «ok» and nothing is kept');
    // كل حقل غلط بيترفض باسمه — والحاجة الأهم: رابط فيسبوك لأي دومين تاني (بيتفتح من إشعار صاحب الأداة)
    const bad: [Record<string, unknown>, string][] = [
      [{ role: 'admin' }, 'role'], [{ role: '__proto__' }, 'role'], [{ name: ' ' }, 'name'], [{ store: 'javascript:alert(1)' }, 'store'], [{ store: 'localhost' }, 'store'],
      [{ platforms: ['evil'] }, 'platforms'], [{ fb: 'https://facebook.com.evil.example/sara.k' }, 'fb'], [{ fb: 'https://www.facebook.com@evil.example/sara.k' }, 'fb'], [{ fb: 'https://evil.example/facebook.com/sara.k' }, 'fb'],
      [{ fb: 'evilfacebook.com/sara.k' }, 'fb'], [{ fb: 'evil.com/sara.k' }, 'fb'], [{ fb: "https://www.facebook.com/x'onmouseover=1" }, 'fb'], [{ fb: 'https://www.facebook.com/a(b)' }, 'fb'],
      [{ fb: 'https://www.facebook.com/profile.php?id=12' }, 'fb'], [{ email: 'x' }, 'email'], [{ snapEmail: 'no' }, 'snapEmail'],
      [{ whatsapp: '12' }, 'whatsapp'], [{ whatsapp: 'call me' }, 'whatsapp'], [{ consent: 'yes' }, 'consent']];
    for (const [patch, field] of bad) assertEquals(await send({ ...good, ...patch }), [400, { error: 'field', field }], JSON.stringify(patch));
    assertEquals(s.reqs.length, 0, 'nothing kept from a bad form');
    // السليم: متنظّف ومتحفوظ، وإشعار واحد لصاحب الأداة
    assertEquals(await send(good), [200, { ok: true }]);
    const r = s.reqs[0];
    assertEquals([r.email, r.name, r.store_url, r.fb_profile, r.platforms, r.snap_email, r.whatsapp, r.lang, r.consent_version, r.role],
      ['sara@x.example', 'سارة ك', 'https://shop.example/a', 'https://www.facebook.com/sara.k', ['meta', 'snapchat'], 'sara@x.example', '+966 50 123 4567', 'en', '2026-10-26', 'media_buyer']);
    assertEquals(s.mails.map((m) => m.to), [['support@adscenter.online']], 'one notice to the owner');
    // نفس البريد تاني على طول: الطلب بيتحدّث (٢) من غير إشعار جديد (١٠ دقايق)
    assertEquals(await send({ ...good, name: 'سارة' }), [200, { ok: true }]);
    assertEquals([s.reqs.length, s.reqs[0].submissions, s.reqs[0].name, s.mails.length], [1, 2, 'سارة', 1]);
    // «<script>» في رابط فيسبوك: بيتحفظ مترمّز على facebook.com (محلّل الروابط بيرمّز «<» و«>» في المسار) — مفيش «<» يوصل للإشعار
    assertEquals(await send({ ...good, fb: 'https://www.facebook.com/<script>' }), [200, { ok: true }]);
    assertEquals(s.reqs[0].fb_profile, 'https://www.facebook.com/%3Cscript%3E');
    restoreDigestEnv();
    // أكتر من ٣٠ في الساعة: «مشغول» ومفيش حفظ
    s = fakeJoinDb({ recent: 31 });
    assertEquals([await send(good), s.reqs.length], [[429, { error: 'busy' }], 0]);
    restoreDigestEnv();
    // حصة بريد اليوم خلصت: الطلب بيتحفظ والعميل بياخد «تم»، من غير إشعار (رموز الدخول والعاجل أولى بالحصة)
    s = fakeJoinDb({ budget: false });
    assertEquals([await send(good), s.reqs.length, s.mails.length, s.budget], [[200, { ok: true }], 1, 0, ['join', 'join-capped']]);
  } finally { restoreDigestEnv(); }
});
Deno.test('رابط الدعوة: بالتوقيع بس، والعرض من غير الحقول الداخلية، والتفعيل يسمح بالدخول قبل الرسالة', async () => {
  const sig = await linkSig('ads-center/join-invited/v1:', 'join:' + JOIN_ID);
  const call = async (action: string, body: Record<string, unknown>) => { const r = await handleJoin(action, body, null); return [r.status, await r.json()]; };
  try {
    const s = fakeJoinDb();
    s.reqs.push({ id: JOIN_ID, email: 'Sara@X.example', role: 'agency', name: 'سارة', business: 'B', store_url: 'https://shop.example/', country: 'C', platforms: ['meta'],
      fb_profile: null, google_email: null, snap_email: null, whatsapp: null, lang: 'ar', status: 'new', submissions: 1, activated_at: null,
      created_at: '2026-11-20T09:00:00Z', updated_at: '2026-11-20T09:00:00Z', consent_at: '2026-11-20T09:00:00Z' });
    // توقيع غلط، أو رقم بحروف كبيرة، أو توقيع غرض تاني (رابط الإيقاف) = رفض
    assertEquals(await call('join.peek', { id: JOIN_ID, sig: sig.slice(0, -1) + (sig.slice(-1) === 'A' ? 'B' : 'A') }), [403, { error: 'link' }]);
    assertEquals(await call('join.peek', { id: JOIN_ID.toUpperCase(), sig }), [403, { error: 'link' }]);
    assertEquals(await call('join.peek', { id: JOIN_ID, sig: await linkSig('ads-center/stop-link/v1:', 'join:' + JOIN_ID) }), [403, { error: 'link' }]);
    assertEquals(await call('join.peek', { id: '99999999-2222-3333-4444-555555555555', sig: await linkSig('ads-center/join-invited/v1:', 'join:99999999-2222-3333-4444-555555555555') }),
      [404, { error: 'gone' }], 'a signed link to a deleted request');
    const [st, peek] = await call('join.peek', { id: JOIN_ID, sig });
    assertEquals([st, peek.request.role, peek.request.email, 'consent_at' in peek.request, 'id' in peek.request], [200, 'وكالة تسويق', 'Sara@X.example', false, false],
      'the role by name; no internal fields');
    assertEquals([s.access.length, s.mails.length], [0, 0], 'looking sends nothing');
    // التفعيل: الدخول مسموح (بريد صغير) قبل الرسالة، ورسالة للعميل نفسه، والطلب «مفعّل»
    const [st2, act] = await call('join.activate', { id: JOIN_ID, sig });
    assertEquals([st2, act.ok, act.request.status], [200, true, 'activated']);
    assertEquals(s.access, [{ email: 'sara@x.example', role: 'pilot' }]);
    assertEquals([s.mails.length, s.mails[0].to, s.reqs[0].status, !!s.reqs[0].activated_at], [1, ['Sara@X.example'], 'activated', true]);
    assertEquals(await call('join.other', { id: JOIN_ID, sig }), [400, { error: 'action' }]);
    restoreDigestEnv();
    // الرسالة فشلت: 502 — والدخول اتسمح فعلاً (إعادة المحاولة بتعيد الرسالة بس)، والطلب لسه مش «مفعّل»
    const s2 = fakeJoinDb({ mailFails: true });
    s2.reqs.push({ ...s.reqs[0], status: 'new', activated_at: null });
    assertEquals(await call('join.activate', { id: JOIN_ID, sig }), [502, { error: 'mail' }]);
    assertEquals([s2.access.length, s2.reqs[0].status], [1, 'new']);
  } finally { restoreDigestEnv(); }
});
// تذكير الطلبات المتأخرة (المُشغّل كل ١٠ دقايق): الوعد في صفحة الطلب «التفعيل خلال ٢٤ ساعة» — بعد ١٨ ساعة ولحد أسبوع، مرة واحدة بحجز قبل
// الإرسال (تشغيلين ورا بعض ميبعتوش مرتين)، وفك الحجز لو الرسالة فشلت، والوقف عند سقف اليوم، والساعات بالعربي في العنوان
Deno.test('تذكير طلبات الانضمام: بعد ١٨ ساعة لحد أسبوع، مرة واحدة بحجز قبل الإرسال، وفك الحجز لو الرسالة فشلت، والساعات بالعربي', async () => {
  const H = 3600000, at = (h: number) => new Date(Date.now() - h * H).toISOString();
  const req = (id: string, h: number, o: Record<string, unknown> = {}) => ({ id, email: id + '@x.example', role: 'agency', name: 'N' + id, business: 'B',
    store_url: 'https://s.example/', country: 'C', platforms: ['meta'], fb_profile: null, google_email: null, snap_email: null, whatsapp: null, lang: 'ar',
    status: 'new', submissions: 1, activated_at: null, created_at: at(h), updated_at: at(h), reminded_at: null as string | null, ...o });
  try {
    let s = fakeJoinDb();
    s.reqs.push(req('a', 19), req('b', 22), req('c', 30), req('d', 17), req('e', 8 * 24), req('f', 20, { status: 'activated' }), req('g', 20, { reminded_at: at(1) }));
    assertEquals(await joinReminders(), 3, 'a, b and c — not before 18 h, not after a week, not activated, not reminded already');
    assertEquals(s.mails.map((m) => m.subject.split(' — ')[0]), ['تذكير: تجاوز موعد الـ٢٤ ساعة لتفعيل Nc', 'تذكير: باقٍ ساعتان على موعد تفعيل Nb',
      'تذكير: باقٍ ٥ ساعات على موعد تفعيل Na'], 'oldest first; Arabic hours');
    assertEquals(s.mails.map((m) => m.to), [['support@adscenter.online'], ['support@adscenter.online'], ['support@adscenter.online']]);
    assertEquals(await joinReminders(), 0, 'a second run sends nothing (claimed)');
    restoreDigestEnv();
    // تشغيل تاني حجزه في نفس اللحظة: مبيتبعتش تاني
    s = fakeJoinDb({ race: 'a' });
    s.reqs.push(req('a', 19));
    assertEquals([await joinReminders(), s.mails.length], [0, 0]);
    restoreDigestEnv();
    // الرسالة فشلت: الحجز بيتفك فالتشغيل الجاي يحاول تاني
    s = fakeJoinDb({ mailFails: true });
    s.reqs.push(req('a', 19));
    assertEquals([await joinReminders(), s.reqs[0].reminded_at], [0, null]);
    restoreDigestEnv();
    // سقف بريد اليوم: وقف من غير حجز (الطلب يتاخد بكرة)
    s = fakeJoinDb({ budget: false });
    s.reqs.push(req('a', 19));
    assertEquals([await joinReminders(), s.reqs[0].reminded_at, s.mails.length], [0, null, 0]);
  } finally { restoreDigestEnv(); }
});

// ---------- إعدادات التنبيهات لكل حساب إعلاني (مراجعة الإعدادات ٢٤ أكتوبر) ----------
Deno.test('إعدادات الحساب: المفاتيح المعروفة بس جوه حدودها، والعائد المستهدف وحده، والتكلفة المقبولة أرقام موجبة', () => {
  assertEquals(cleanAccountSettings({ cprWarnMultiple: 2, minSpendShare: 0.9, evil: 1, roasTarget: 5,
    maxCost: { lead: 30, message: -1, 'bad key!': 3 }, campaignMaxCost: { '123': 12 } }),
    { cprWarnMultiple: 2, roasTarget: 5, maxCost: { lead: 30 }, campaignMaxCost: { '123': 12 } });
  assertEquals(cleanAccountSettings({ roasTarget: 5 }), { roasTarget: 5 }, 'the target alone is the whole goal now');
  assertEquals(cleanAccountSettings({ roasTarget: 2, roasBreakEven: 4 }), { roasTarget: 2 }, 'a stored loss limit is dropped (8 Nov 2026)');
  assertEquals(cleanAccountSettings([1]), null);
});
Deno.test('سجل الحساب القديم: قراءة بس (للنقل لإعدادات المستخدم)، ومن غير إثبات الوصول للحساب في منصته مفيش قراءة', async () => {
  let metaOk = true, snapOk = true, writes = 0;
  stubFetch((url, init) => {
    if (url.indexOf('graph.facebook.com') > -1) return metaOk ? json({ id: 'act_123', name: 'X' }) : json({ error: { code: 100 } }, 400);
    if (url.indexOf('adsapi.snapchat.com') > -1) return snapOk ? json({ adaccounts: [{ adaccount: { id: 'aaaa-1111' } }] }) : json({ request_status: 'ERROR' }, 403);
    if (url.indexOf('/rest/v1/account_settings') > -1) {
      if (init && init.method && init.method !== 'GET') { writes++; return new Response(null, { status: 204 }); }
      return json([{ settings: { roasTarget: 5, cprWarnMultiple: 2 }, updated_at: '2026-10-24T00:00:00Z' }]);
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const T = 'TOKEN_abcdefghijklmnopqrstuvwxyz';
    const get = await handleSettings('settings.get', { platform: 'meta', accountId: 'act_123', platformToken: T }, null);
    assertEquals(get.status, 200);
    assertEquals((await get.json()).settings, { roasTarget: 5, cprWarnMultiple: 2 });
    assertEquals(writes, 0, 'reading writes nothing');
    const set = await handleSettings('settings.set', { platform: 'meta', accountId: 'act_123', platformToken: T, settings: { roasTarget: 1 } }, null);
    assertEquals([set.status, writes], [400, 0], 'saving to the account record is gone');
    metaOk = false;
    assertEquals((await handleSettings('settings.get', { platform: 'meta', accountId: 'act_123', platformToken: T }, null)).status, 403, 'no access on Meta');
    snapOk = false;
    assertEquals((await handleSettings('settings.get', { platform: 'snapchat', accountId: 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789a0', platformToken: T }, null)).status, 403);
    // رقم حساب Snapchat معرّف UUID بالظبط زي digest.ts (التدقيق الشامل ١١ نوفمبر ٢٠٢٦: كان هنا شكل متساهل)
    assertEquals((await handleSettings('settings.get', { platform: 'snapchat', accountId: 'aaaa-1111', platformToken: T }, null)).status, 400);
    assertEquals((await handleSettings('settings.get', { platform: 'google', accountId: '1', platformToken: T }, null)).status, 400);
    assertEquals((await handleSettings('settings.get', { platform: 'meta', accountId: '123', platformToken: T }, null)).status, 400);
  } finally { restoreFetch(); }
});
// إعدادات التنبيهات لكل مستخدم (قرار صاحب المنتج ٢٦ أكتوبر ٢٠٢٦): «كل الحسابات» ومجموعة لكل منصة اتخصّصت
Deno.test('إعدادات المستخدم: «كل الحسابات» دايماً، والمنصات والحسابات المعروفة بس، وعملة حد النوع معاه بس', () => {
  assertEquals(cleanUserSettings({ all: { roasTarget: 5, maxCost: { lead: 30 }, maxCostCur: 'SAR', evil: 1 },
    plat: { snapchat: { roasTarget: 2 }, myspace: { roasTarget: 9 }, tiktok: [1] }, asked: true, other: 1 }),
    { all: { roasTarget: 5, maxCost: { lead: 30 }, maxCostCur: 'SAR' }, plat: { snapchat: { roasTarget: 2 } }, asked: true });
  // إعدادات الحساب الإعلاني نفسه (٨ نوفمبر ٢٠٢٦): «منصة:رقم الحساب» بس، والباقي بيتشال
  assertEquals(cleanUserSettings({ all: {}, acct: { 'meta:act_1': { roasTarget: 3 }, 'snapchat:aaaa-1111': { roasTarget: 4, evil: 1 },
    'myspace:1': { roasTarget: 9 }, 'meta:act bad!': { roasTarget: 9 }, 'meta:act_2': [1], 'meta:act_3': {} } }),
    { all: {}, acct: { 'meta:act_1': { roasTarget: 3 }, 'snapchat:aaaa-1111': { roasTarget: 4 }, 'meta:act_3': {} } },
    'known keys and real sets only — and an empty set means the account starts fresh instead of inheriting');
  assertEquals(cleanUserSettings({ all: {}, acct: { 'myspace:1': {} } }), { all: {} }, 'nothing usable: no acct key at all');
  assertEquals(cleanUserSettings({ all: {}, acct: [1] }), { all: {} }, 'a bad acct map is dropped, the record is kept');
  assertEquals(cleanUserSettings({}), { all: {} }, 'empty = start values for all accounts');
  assertEquals(cleanUserSettings({ all: { maxCostCur: 'SAR' } }), { all: {} }, 'a currency without a limit is dropped');
  assertEquals(cleanUserSettings({ all: { maxCost: { lead: 30 }, maxCostCur: 'sar1' } }), { all: { maxCost: { lead: 30 } } }, 'a bad currency code is dropped');
  assertEquals(cleanUserSettings({ asked: 'yes' }), { all: {} }, 'asked is true or nothing');
  assertEquals(cleanUserSettings([1]), null);
  assertEquals(cleanUserSettings({ all: [1] }), null, 'a bad all-accounts set is refused, not emptied');
  assertEquals(cleanUserSettings({ plat: 'x' }), null);
});
Deno.test('إعدادات المستخدم: سجل صاحب الدخول بس — القراءة مقصورة على رقمه، وآخر استخدام مرة في اليوم', async () => {
  const U = '11111111-2222-3333-4444-555555555555';
  const calls: { method: string; url: string; body: any }[] = [];
  let usedAt = '2025-01-01T00:00:00Z';
  stubFetch((url, init) => {
    if (url.indexOf('/rest/v1/user_settings') > -1) {
      const method = (init && init.method) || 'GET';
      calls.push({ method, url, body: init && init.body ? JSON.parse(String(init.body)) : null });
      if (method === 'GET') return json([{ settings: { all: { roasTarget: 5 } }, updated_at: '2026-10-26T00:00:00Z', used_at: usedAt }]);
      return new Response(null, { status: 204 });
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const get = await handleUserSettings('usettings.get', {}, U, null);
    assertEquals((await get.json()).settings, { all: { roasTarget: 5 } });
    assert(calls.every((c) => c.url.indexOf('user_id=eq.' + U) > -1), 'only this user record');
    assertEquals(calls.filter((c) => c.method === 'PATCH').length, 1, 'old last-use: touched (12-month retention)');
    calls.length = 0;
    usedAt = new Date().toISOString();
    await handleUserSettings('usettings.get', { userId: 'someone-else' }, U, null);
    assertEquals(calls.map((c) => c.method), ['GET'], 'used today: no extra write');
    assert(calls[0].url.indexOf('someone-else') < 0, 'a user id in the request is ignored');
    assertEquals((await handleUserSettings('usettings.get', {}, 'not-a-user', null)).status, 401);
    assertEquals((await handleUserSettings('usettings.drop', {}, U, null)).status, 400);
  } finally { restoreFetch(); }
});
// مراجعة ٣١ أكتوبر («دقق جيداً»): الحفظ بالسجل كله من نسخة الجهاز كان بيمسح تعديل جهاز تاني — دلوقتي المجموعات اللي اتغيّرت بس،
// والدمج في قاعدة البيانات وهو مقفول (user_settings_apply — اتجرّبت على Postgres نفسه)
Deno.test('حفظ إعدادات المستخدم: المجموعات اللي اتغيّرت بس متنضّفة، وسجل كل حساب إعلاني، وnull = مسح، وأي جزء غلط = رفض الطلب كله', () => {
  assertEquals(cleanUserWrite({ changes: { all: { roasTarget: 4, evil: 1 }, snapchat: null }, asked: true }),
    { base: null, changes: { all: { roasTarget: 4 }, snapchat: null }, goals: null, asked: true });
  assertEquals(cleanUserWrite({ goals: { roasTarget: 5, cprWarnMultiple: 3 }, asked: true }),
    { base: null, changes: {}, goals: { roasTarget: 5 }, asked: true }, 'goals = the target only');
  assertEquals(cleanUserWrite({ base: { all: { roasTarget: 5 }, plat: { snapchat: { roasTarget: 2 } } } }),
    { base: { all: { roasTarget: 5 }, plat: { snapchat: { roasTarget: 2 } } }, changes: {}, goals: null, asked: false }, 'base alone = «create if missing»');
  // إعدادات الحساب الإعلاني نفسه (٨ نوفمبر ٢٠٢٦): مجموعة كاملة مكان القديمة، وnull = مسح سجل الحساب
  assertEquals(cleanUserWrite({ changes: { acct: { 'meta:act_1': { roasTarget: 3, evil: 1 }, 'snapchat:aaaa-1111': null } } }),
    { base: null, changes: { acct: { 'meta:act_1': { roasTarget: 3 }, 'snapchat:aaaa-1111': null } }, goals: null, asked: false });
  assertEquals(cleanUserWrite({ changes: { acct: { 'myspace:1': { roasTarget: 3 } } } }), null, 'unknown platform in the account key');
  assertEquals(cleanUserWrite({ changes: { acct: { 'meta:act 1': { roasTarget: 3 } } } }), null, 'a bad account id');
  assertEquals(cleanUserWrite({ changes: { acct: { 'meta:act_1': [1] } } }), null, 'a bad set refuses the whole request');
  assertEquals(cleanUserWrite({ changes: { acct: {} } }), null, 'an empty account map saves nothing');
  assertEquals(cleanUserWrite({ changes: { acct: [1] } }), null);
  const many: Record<string, unknown> = {};
  for (let i = 0; i <= ACCT_MAX; i++) many['meta:act_' + i] = { roasTarget: 3 };
  assertEquals(cleanUserWrite({ changes: { acct: many } }), 'too many', 'over the account cap: refused, not cut silently');
  assertEquals(cleanUserWrite({ asked: true }), { base: null, changes: {}, goals: null, asked: true });
  assertEquals(cleanUserWrite({ changes: { all: null } }), null, 'all accounts cannot be removed');
  assertEquals(cleanUserWrite({ changes: { myspace: {} } }), null, 'unknown platform');
  assertEquals(cleanUserWrite({ changes: { meta: [1] } }), null, 'a bad set refuses the whole request');
  assertEquals(cleanUserWrite({ changes: [] }), null);
  assertEquals(cleanUserWrite({ goals: { cprWarnMultiple: 3 } }), null, 'goals without a target');
  assertEquals(cleanUserWrite({ goals: { roasTarget: 0 } }), null, 'a target out of range');
  assertEquals(cleanUserWrite({ base: [1] }), null);
  assertEquals(cleanUserWrite({}), null, 'nothing to save');
  assertEquals(cleanUserWrite({ asked: 'yes' }), null);
  const big: Record<string, number> = {};
  for (let i = 0; i <= MAX_KEYS; i++) big['c' + i] = 1;
  assertEquals(cleanUserWrite({ changes: { all: { campaignMaxCost: big } } }), 'too many', 'over the cap: refused, not cut silently');
  assertEquals(cleanUserWrite({ base: { all: {}, plat: { meta: { maxCost: big } } } }), 'too many');
  delete big.c0;
  const ok2000 = cleanUserWrite({ changes: { all: { campaignMaxCost: big } } }) as UserWrite;
  assertEquals(Object.keys((ok2000.changes.all as any).campaignMaxCost).length, MAX_KEYS, 'exactly the cap: all kept');
});
Deno.test('حفظ إعدادات المستخدم: دالة الدمج المقفولة لصاحب الدخول بس، والرد = السجل كله — والصفحة القديمة بالسجل كله مبتمسحش تخصيص مش فيه', async () => {
  const U = '11111111-2222-3333-4444-555555555555';
  const rpcs: any[] = [];
  stubFetch((url, init) => {
    if (url.indexOf('/rest/v1/rpc/user_settings_apply') > -1) {
      const args = JSON.parse(String(init && init.body));
      rpcs.push(args);
      return json({ all: { roasTarget: 4 }, acct: { 'meta:act_1': { roasTarget: 9 } }, asked: true });
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const set = await handleUserSettings('usettings.set', { changes: { acct: { 'meta:act_1': { roasTarget: 9, evil: 9 } } }, asked: true, userId: 'someone-else' }, U, null);
    assertEquals(set.status, 200);
    assertEquals(rpcs[0], { p_user: U, p_base: null, p_changes: { acct: { 'meta:act_1': { roasTarget: 9 } } }, p_goals: null, p_asked: true }, 'cleaned, and only for this user');
    assertEquals((await set.json()).settings, { all: { roasTarget: 4 }, acct: { 'meta:act_1': { roasTarget: 9 } }, asked: true }, 'the whole merged record back');
    // صفحة اتفتحت قبل ٣١ أكتوبر (السجل كله): بيتحوّل لتعديل «كل الحسابات» والمنصات اللي فيه — من غير إلغاء تخصيص مش فيه
    await handleUserSettings('usettings.set', { settings: { all: { roasTarget: 6 }, plat: { snapchat: { roasTarget: 2 }, myspace: {} }, asked: true } }, U, null);
    assertEquals(rpcs[1].p_changes, { all: { roasTarget: 6 }, snapchat: { roasTarget: 2 } });
    assertEquals(rpcs[1].p_asked, true);
    assert(!('meta' in rpcs[1].p_changes), 'Meta (customized from another device) is not removed');
    const before = rpcs.length;
    const big: Record<string, number> = {};
    for (let i = 0; i <= MAX_KEYS; i++) big['c' + i] = 1;
    const tooMany = await handleUserSettings('usettings.set', { changes: { all: { campaignMaxCost: big } } }, U, null);
    assertEquals([tooMany.status, (await tooMany.json()).error, rpcs.length], [400, 'too many', before], 'refused with a clear reason, nothing saved');
    assertEquals((await handleUserSettings('usettings.set', { changes: { all: null } }, U, null)).status, 400);
    assertEquals((await handleUserSettings('usettings.set', {}, U, null)).status, 400);
    assertEquals(rpcs.length, before, 'bad requests save nothing');
    assertEquals((await handleUserSettings('usettings.set', { asked: true }, 'not-a-user', null)).status, 401);
  } finally { restoreFetch(); }
});
// سجل مشكلات التنبيه (لوحة «قيمة الأداة» — قرار صاحب المنتج ٢٥ أكتوبر ٢٠٢٦): رقم الإعلان والنوع والأوقات بس، من غير أي أرقام
Deno.test('سجل المشكلات: إعلان ونوع معروفين من غير تكرار، والقرار وقت ونوع مع بعض أو ولا واحد', () => {
  assertEquals(cleanOpen([{ ad: '123', kind: 'waste' }, { ad: '123', kind: 'waste' }, { ad: '123', kind: 'loss' }], 'meta'),
    [{ ad: '123', kind: 'waste' }, { ad: '123', kind: 'loss' }]);
  assertEquals(cleanOpen([{ ad: 'abc', kind: 'waste' }], 'meta'), null, 'a Meta ad id is digits');
  assertEquals(cleanOpen([{ ad: 'aaaa-1111', kind: 'waste' }], 'snapchat'), [{ ad: 'aaaa-1111', kind: 'waste' }]);
  assertEquals(cleanOpen([{ ad: '1', kind: 'spend', spend: 50 }], 'meta'), null, 'unknown kind');
  assertEquals(cleanOpen({}, 'meta'), null);
  assertEquals(cleanOpen([], 'meta'), [], 'no problems now = every open one ends');
  assertEquals(cleanDecisions([{ id: 5, handledAt: '2026-10-25T10:00:00Z', action: 'pause' }, { id: 6 }]),
    [{ id: 5, handledAt: '2026-10-25T10:00:00.000Z', action: 'pause' }, { id: 6, handledAt: null, action: null }]);
  assertEquals(cleanDecisions([{ id: 5, handledAt: '2026-10-25T10:00:00Z' }]), null, 'a time without an action kind');
  assertEquals(cleanDecisions([{ id: 5, handledAt: '2026-10-25T10:00:00Z', action: 'delete' }]), null);
  assertEquals(cleanDecisions([{ id: -1 }]), null);
  assertEquals(cleanDecisions([]), null);
});
// اللوحة بتتبع فترة البيانات (قرار صاحب المنتج ٢٥ أكتوبر): أول يوم الفترة ناقص يوم، ومش أقدم من مدة الحفظ
Deno.test('سجل المشكلات: من أول يوم في الفترة المختارة (بيوم زيادة لفرق التوقيت)، ولحد مدة الحفظ بس', () => {
  const now = Date.parse('2026-10-25T12:00:00Z'), day = 86400000;
  assertEquals(sinceOf('2026-10-18', now), '2026-10-17T00:00:00.000Z');
  assertEquals(sinceOf('2026-01-01', now), new Date(now - 91 * day).toISOString(), 'not older than the retention');
  assertEquals(sinceOf('evil', now), new Date(now - 45 * day).toISOString(), 'no period: the last 45 days');
  assertEquals(sinceOf(undefined, now), new Date(now - 45 * day).toISOString());
});
Deno.test('سجل المشكلات: التعديل يتحسب جوه الـ ٢٤ ساعة بعد التنبيه بس، و«متعالجتش» بعد ما تخلص', () => {
  const first = '2026-10-25T10:00:00Z', at = Date.parse(first);
  assert(decisionOk(first, { handledAt: '2026-10-25T18:00:00Z' }, at + 3600000), 'an edit 8 hours later');
  assert(!decisionOk(first, { handledAt: '2026-10-25T09:00:00Z' }, at + 3600000), 'an edit before the alert is not after it');
  assert(!decisionOk(first, { handledAt: '2026-10-26T11:00:00Z' }, at + 30 * 3600000), 'more than 24 hours later');
  assert(!decisionOk(first, { handledAt: null }, at + 20 * 3600000), 'not handled: only once the 24 hours are over');
  assert(decisionOk(first, { handledAt: null }, at + 25 * 3600000));
});
Deno.test('سجل المشكلات: الجديد بيتسجّل، والقديم اللي اختفى بيخلص، والقرار مرة واحدة — ومن غير إثبات الوصول مفيش حاجة', async () => {
  let metaOk = true;
  const calls: { method: string; url: string; body: any }[] = [];
  const first = new Date(Date.now() - 30 * 3600000).toISOString();
  stubFetch((url, init) => {
    if (url.indexOf('graph.facebook.com') > -1) return metaOk ? json({ id: 'act_123', name: 'X' }) : json({ error: { code: 100 } }, 400);
    if (url.indexOf('/rest/v1/alert_episodes') > -1) {
      const method = (init && init.method) || 'GET';
      calls.push({ method, url, body: init && init.body ? JSON.parse(String(init.body)) : null });
      if (method === 'GET' && url.indexOf('ended_at=is.null') > -1) return json([{ id: 1, ad_id: '11', kind: 'waste' }, { id: 2, ad_id: '22', kind: 'waste' }]);
      if (method === 'GET' && url.indexOf('decided_at=is.null') > -1) return json([{ id: 1, first_at: first }, { id: 2, first_at: first }]);
      if (method === 'GET') return json([{ id: 1, ad_id: '11', kind: 'waste', first_at: first, ended_at: null, decided_at: null, handled_at: null, action: null }]);
      return new Response(null, { status: method === 'POST' ? 201 : 204 });
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const T = 'TOKEN_abcdefghijklmnopqrstuvwxyz', who = { platform: 'meta', accountId: 'act_123', platformToken: T };
    const U = '11111111-2222-3333-4444-555555555555';
    const res = await handleEpisodes('episodes.sync', { ...who, open: [{ ad: '11', kind: 'waste' }, { ad: '33', kind: 'loss' }] }, U, null);
    assertEquals(res.status, 200);
    const patches = calls.filter((c) => c.method === 'PATCH'), posts = calls.filter((c) => c.method === 'POST');
    assert(patches.some((c) => /id=in\.\(1\)/.test(c.url) && c.body.last_seen_at), 'still open: seen again');
    assert(patches.some((c) => /id=in\.\(2\)/.test(c.url) && c.body.ended_at), 'gone: ended');
    assertEquals(posts.map((c) => c.body), [[{ user_id: U, platform: 'meta', account_id: 'act_123', ad_id: '33', kind: 'loss' }]], 'only the new one is added, for this user');
    assert(calls.every((c) => c.method === 'POST' || c.url.indexOf('user_id=eq.' + U) > -1), 'every read and update is limited to this user');
    const body = await res.json();
    assertEquals(Object.keys(body.episodes[0]).sort(), ['action', 'ad', 'decided', 'endedAt', 'firstAt', 'handledAt', 'id', 'kind']);
    calls.length = 0;
    await handleEpisodes('episodes.sync', { ...who, open: null }, U, null);
    assertEquals(calls.map((c) => c.method), ['GET'], 'read only: nothing recorded');
    calls.length = 0;
    const handledAt = new Date(Date.parse(first) + 2 * 3600000).toISOString();
    const dec = await handleEpisodes('episodes.decide', { ...who, decisions: [{ id: 1, handledAt, action: 'budget' }, { id: 2 }] }, U, null);
    assertEquals((await dec.json()).saved, 2);
    const p = calls.filter((c) => c.method === 'PATCH');
    assert(p.some((c) => /id=eq\.1&decided_at=is\.null/.test(c.url) && c.body.action === 'budget' && c.body.handled_at === handledAt), 'handled');
    assert(p.some((c) => /id=in\.\(2\)/.test(c.url) && c.body.decided_at && !('handled_at' in c.body)), 'not handled (30 hours later)');
    calls.length = 0;
    metaOk = false;
    assertEquals((await handleEpisodes('episodes.sync', { ...who, open: [] }, U, null)).status, 403);
    assertEquals(calls.length, 0, 'no access: nothing read or written');
    assertEquals((await handleEpisodes('episodes.sync', { platform: 'google', accountId: '1', platformToken: T, open: [] }, U, null)).status, 400);
    assertEquals((await handleEpisodes('episodes.sync', { ...who, open: [] }, '', null)).status, 401, 'no user: refused');
  } finally { restoreFetch(); }
});
// البريد بسجل الحساب بس: من غيره حكم الربح بيستنى زي الأداة (النسخة القديمة اللي كانت مع الملخص كانت ×٣/×١ غلط — اتشاف حياً)
Deno.test('البريد بيقرا سجل الحساب بس — من غيره أو من غير مستهدف فيه حكم الربح بيستنى زي الأداة', () => {
  assertEquals(settingsChoice(null), { target: null, sens: null });
  const acs = { roasTarget: 5, maxCost: { lead: 30 } };
  assertEquals(settingsChoice(acs), { target: { roas: 5 }, sens: acs });
  assertEquals(settingsChoice({ cprWarnMultiple: 2 }).target, null, 'a record without goals: profit waits');
});
// الملخص التلقائي لكل مستخدم (قرار صاحب المنتج ٣١ أكتوبر ٢٠٢٦: «اجعلها لكل مستخدم ملخص خاص به»): ملخصه هو بس، بحساباته (حتى ٥)،
// ورابط إيقافه لكل مستخدم، والروابط القديمة لكل حساب لسه شغالة. قاعدة بيانات وهمية بنفس فلاتر PostgREST اللي الدالة بتستخدمها
function restoreDigestEnv() { Deno.env.delete('RESEND_API_KEY'); restoreFetch(); }
function fakeDigestDb() {
  const store = {
    digests: [] as any[], accounts: [] as any[], tokens: [] as any[], sealed: [] as any[], marks: 0, logs: [] as any[], mails: [] as any[], outboxCleared: [] as any[],
    names: { act_1: 'Store one', act_2: 'Store two' } as Record<string, string>, legacyOwner: {} as Record<string, string>
  };
  const q = (url: string) => new URLSearchParams(url.split('?')[1] || '');
  Deno.env.set('RESEND_API_KEY', 'test-resend-key');   // رسائل التأكيد بتروح لـ api.resend.com الوهمي تحت (بيتشال في restoreDigestEnv)
  const eqv = (p: URLSearchParams, k: string) => { const v = p.get(k); return v && v.indexOf('eq.') === 0 ? decodeURIComponent(v.slice(3)) : null; };
  stubFetch((url, init) => {
    const method = (init && init.method) || 'GET', body = init && init.body ? JSON.parse(String(init.body)) : null;
    if (url.indexOf('graph.facebook.com') > -1) {
      if (url.indexOf('/oauth/access_token') > -1) return json({ access_token: 'LONG_lived_token_abcdefghijklmnop', expires_in: 5184000 });
      if (url.indexOf('/me?') > -1) return json({ id: '777' });
      const m = url.match(/\/(act_\d+)\?/);
      return m ? json({ id: m[1], name: store.names[m[1]] || m[1], currency: 'SAR', timezone_name: 'Asia/Riyadh' }) : json({ error: { code: 100 } }, 400);
    }
    if (url.indexOf('api.resend.com') > -1) { store.mails.push(body); return json({ id: 'mail-' + store.mails.length }); }
    const p = q(url), u = eqv(p, 'user_id');
    if (url.indexOf('/rest/v1/rpc/vault_user_put') > -1) {
      store.tokens = store.tokens.filter((t) => !(t.user === body.p_user && t.account === body.p_account)).concat([{ user: body.p_user, account: body.p_account, expires_at: body.p_expires }]);
      return new Response('', { status: 200 });
    }
    if (url.indexOf('/rest/v1/rpc/vault_user_delete') > -1) {
      store.tokens = store.tokens.filter((t) => !(t.user === body.p_user && (body.p_account == null || t.account === body.p_account)));
      return new Response('', { status: 200 });
    }
    if (url.indexOf('/rest/v1/rpc/vault_user_status') > -1) {
      return json(store.tokens.filter((t) => t.user === body.p_user).map((t) => ({ account_id: t.account, expires_at: t.expires_at, updated_at: null, last_error: null })));
    }
    if (url.indexOf('/rest/v1/rpc/vault_user_get') > -1) return json([]);
    // tz_ok: قاعدة البيانات عارفة المنطقة دي؟ (AET اسم قديم Intl بيقبله وPostgreSQL لأ)
    if (url.indexOf('/rest/v1/rpc/tz_ok') > -1) return json(body.p_tz !== 'AET');
    // نسخ Snapchat المقفولة (vault_sealed_*): بنحفظ اللي اتبعت (المشفّر) عشان الاختبار يتأكد إنه مش النسخة نفسها
    if (url.indexOf('/rest/v1/rpc/vault_sealed_put') > -1) {
      store.sealed = store.sealed.filter((t) => !(t.user === body.p_user && t.platform === body.p_platform && t.account === body.p_account))
        .concat([{ user: body.p_user, platform: body.p_platform, account: body.p_account, cipher: body.p_cipher, iv: body.p_iv, expires_at: body.p_expires }]);
      return new Response('', { status: 200 });
    }
    if (url.indexOf('/rest/v1/rpc/vault_sealed_delete') > -1) {
      store.sealed = store.sealed.filter((t) => !(t.user === body.p_user && (body.p_platform == null || t.platform === body.p_platform) &&
        (body.p_account == null || t.account === body.p_account)));
      return new Response('', { status: 200 });
    }
    if (url.indexOf('/rest/v1/rpc/vault_sealed_status') > -1) {
      return json(store.sealed.filter((t) => t.user === body.p_user).map((t) => ({ platform: t.platform, account_id: t.account, expires_at: t.expires_at, updated_at: null, last_error: null })));
    }
    if (url.indexOf('/rest/v1/user_digests') > -1) {
      if (method === 'GET') return json(store.digests.filter((d) => d.user_id === u));
      if (method === 'POST') { store.digests = store.digests.filter((d) => d.user_id !== body.user_id).concat([body]); return new Response(null, { status: 201 }); }
      if (method === 'PATCH') { store.digests.forEach((d) => { if (d.user_id === u) Object.assign(d, body); }); return new Response(null, { status: 204 }); }
      if (method === 'DELETE') {
        store.digests = store.digests.filter((d) => d.user_id !== u);
        store.accounts = store.accounts.filter((a) => a.user_id !== u);   // on delete cascade
        return new Response(null, { status: 204 });
      }
    }
    if (url.indexOf('/rest/v1/user_digest_accounts') > -1) {
      const plat = eqv(p, 'platform'), acc = eqv(p, 'account_id');
      if (method === 'GET') return json(store.accounts.filter((a) => a.user_id === u));
      if (method === 'POST') {
        const had = store.accounts.find((a) => a.user_id === body.user_id && a.platform === body.platform && a.account_id === body.account_id);
        if (!had) store.accounts.push(body);
        else if (String((init!.headers as Record<string, string>).prefer).indexOf('merge-duplicates') > -1) Object.assign(had, body);
        return new Response(null, { status: 201 });
      }
      if (method === 'DELETE') {
        store.accounts = store.accounts.filter((a) => !(a.user_id === u && a.platform === plat && a.account_id === acc));
        return new Response(null, { status: 204 });
      }
    }
    if (url.indexOf('/rest/v1/user_alert_marks') > -1) { store.marks++; return new Response(null, { status: 204 }); }
    // نتايج الحساب المستنية الإرسال (runner.ts digest_outbox) بتتمسح مع خروجه من الملخص
    if (url.indexOf('/rest/v1/digest_outbox') > -1 && method === 'DELETE') { store.outboxCleared.push(eqv(p, 'account_id')); return new Response(null, { status: 204 }); }
    if (url.indexOf('/rest/v1/send_log') > -1) { store.logs.push(body); return new Response(null, { status: 201 }); }
    if (url.indexOf('/rest/v1/ad_accounts') > -1) { const a = eqv(p, 'account_id') as string; return json(store.names[a] ? [{ name: store.names[a] }] : []); }
    if (url.indexOf('/rest/v1/digest_settings') > -1) { const a = eqv(p, 'account_id') as string; return json(store.legacyOwner[a] ? [{ user_id: store.legacyOwner[a] }] : []); }
    throw new Error('unexpected fetch ' + method + ' ' + url);
  });
  return store;
}
Deno.test('الملخص لكل مستخدم: التفعيل بحساب Meta المفتوح، والإضافة لحد ٥، والإزالة، وكل مستخدم شايف ملخصه هو بس', async () => {
  const A = '11111111-2222-3333-4444-555555555555', B = '99999999-8888-7777-6666-555555555555';
  const T = 'TOKEN_abcdefghijklmnopqrstuvwxyz';
  const store = fakeDigestDb();
  const call = async (action: string, body: Record<string, unknown>, user: string | null) => {
    const r = await handleDigest(action, body, null, user);
    return { status: r.status, body: await r.json() };
  };
  try {
    assertEquals((await call('digest.get', {}, A)).body, { settings: null, accounts: [], current: null });
    assertEquals((await call('digest.get', {}, null)).status, 401, 'login required');
    assertEquals((await call('digest.enable', { token: T, accountId: 'act_1', email: 'a@store.com', lang: 'ar' }, A)).status, 400, 'no consent');
    const en = await call('digest.enable', { token: T, accountId: 'act_1', email: 'A@Store.com', days: [0, 3], hour: 8, lang: 'ar', consent: true }, A);
    assertEquals(en.status, 200);
    assertEquals([en.body.settings.email, en.body.settings.hour, en.body.accounts.map((a: any) => a.accountId)], ['a@store.com', 8, ['act_1']]);
    assertEquals(store.tokens.map((t) => [t.user, t.account]), [[A, 'act_1']], 'the long-lived access is stored for this user and account');
    const confirm = store.mails[store.mails.length - 1];
    assert(confirm && String(confirm.html).indexOf('/stop?u=' + A + '&') > -1, 'the stop link is for this user');
    // إلغاء الاشتراك بنقرة (٦٩): الترويستان برابط الإيقاف نفسه اللي في آخر الرسالة
    const confirmStop = String(confirm.text).split('\n').pop() as string;
    assertEquals(confirmStop.indexOf('https://adscenter.online/stop?u=' + A + '&s='), 0);
    assertEquals(confirm.headers, { 'List-Unsubscribe': '<' + confirmStop + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    assert(String(confirm.html).indexOf('Store one') > -1, 'names the account');
    // مستخدم تاني: ملخصه هو بس (فاضي)، ومبيقدرش يشيل حساب من ملخص الأول
    assertEquals((await call('digest.get', {}, B)).body.settings, null);
    await call('digest.remove', { platform: 'meta', accountId: 'act_1' }, B);
    assertEquals(store.accounts.filter((a) => a.user_id === A).length, 1, 'user B cannot touch user A\'s summary');
    // إضافة حساب تاني، والحساب المفتوح جوه الملخص بيرجع حالته
    const add = await call('digest.add', { token: T, accountId: 'act_2' }, A);
    assertEquals(add.body.accounts.map((a: any) => [a.accountId, a.name]), [['act_1', 'Store one'], ['act_2', 'Store two']]);
    const got = await call('digest.get', { accountId: 'act_2' }, A);
    assertEquals([got.body.current.accountId, got.body.current.included], ['act_2', true]);
    // الحد لكل منصة (٣١ أكتوبر: Meta ٢٠ وSnapchat ١٠): Meta مليانة ← حساب Meta زيادة مرفوض، وحساب Snapchat لسه ينفع
    assertEquals(MAX_PER_PLATFORM, { meta: 20, snapchat: 10 });
    for (let i = 3; i <= MAX_PER_PLATFORM.meta; i++) store.accounts.push({ user_id: A, platform: 'meta', account_id: 'act_' + i });
    assertEquals((await call('digest.add', { token: T, accountId: 'act_99' }, A)).body.error, 'too many');
    const snap = await call('digest.add', { platform: 'snapchat', accountId: 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789a0', sealed: 'v2.' + 'A'.repeat(16) + '.' + 'B'.repeat(40) }, A);
    assertEquals(snap.status, 200, 'another platform has its own limit');
    store.accounts = store.accounts.filter((a) => !(a.user_id === A && (a.platform === 'snapchat' || Number(a.account_id.slice(4)) >= 3)));
    store.sealed = [];
    // التجديد: حساب مش في الملخص = enabled false مع إن المستخدم عنده ملخص
    store.names.act_5 = 'Five';
    assertEquals((await call('digest.refresh', { token: T, accountId: 'act_5' }, A)).body, { ok: true, enabled: false, hasDigest: true });
    assertEquals((await call('digest.refresh', { token: T, accountId: 'act_1' }, A)).body.enabled, true);
    // الإزالة: الحساب وصلاحيته بس، وآخر حساب = الملخص كله بيقف
    const rm = await call('digest.remove', { platform: 'meta', accountId: 'act_2' }, A);
    assertEquals([rm.body.stopped, rm.body.accounts.map((a: any) => a.accountId)], [false, ['act_1']]);
    assert(!store.tokens.some((t) => t.account === 'act_2'), 'its access is deleted');
    const last = await call('digest.remove', { platform: 'meta', accountId: 'act_1' }, A);
    assertEquals([last.body.stopped, store.digests.length, store.tokens.length], [true, 0, 0], 'last account: the summary stops and nothing is kept');
  } finally { restoreDigestEnv(); }
});
Deno.test('رابط الإيقاف: الجديد لكل مستخدم بيوقف ملخصه، والقديم لكل حساب بيشيل الحساب ده من ملخص صاحبه، والتوقيع الغلط مرفوض', async () => {
  const A = '11111111-2222-3333-4444-555555555555';
  const T = 'TOKEN_abcdefghijklmnopqrstuvwxyz';
  const store = fakeDigestDb();
  try {
    await handleDigest('digest.enable', { token: T, accountId: 'act_1', email: 'a@store.com', lang: 'ar', consent: true }, null, A);
    await handleDigest('digest.add', { token: T, accountId: 'act_2' }, null, A);
    const sig = await linkSig('ads-center/stop-link/v1:', 'stop-user:' + A);
    assertEquals((await handleDigest('stop', { u: A, sig: sig.slice(0, -2) + 'xx' }, null)).status, 403, 'bad signature');
    // الرابط القديم (لكل حساب) في رسالة اتبعتت قبل التحديث
    store.legacyOwner.act_2 = A;
    const old = await linkSig('ads-center/stop-link/v1:', 'stop:act_2');
    const r1 = await handleDigest('stop', { account: 'act_2', sig: old }, null);
    assertEquals([r1.status, (await r1.json()).wasEnabled, store.accounts.map((a) => a.account_id)], [200, true, ['act_1']], 'the old link removes only that account');
    const r2 = await handleDigest('stop', { u: A, sig }, null);
    assertEquals([r2.status, (await r2.json()).wasEnabled, store.digests.length, store.tokens.length], [200, true, 0, 0], 'the new link stops the whole summary');
    assertEquals((await handleDigest('stop', { u: A, sig }, null)).status, 200, 'clicking twice is fine');
    const stopLogs = () => store.logs.filter((l) => l.type === 'disabled' && l.status === 'skipped').map((l) => l.error);
    assertEquals(stopLogs(), ['stop link (old)', 'stop link'], 'the log says which link');
    // زرار «إلغاء الاشتراك» في برنامج البريد (Live/cloudflare/worker.js oneClickStop — ٦٩): نفس الإيقاف بنفس التوقيع، والسجل بيقول الطريق
    await handleDigest('digest.enable', { token: T, accountId: 'act_1', email: 'a@store.com', lang: 'ar', consent: true }, null, A);
    assertEquals((await handleDigest('stop', { u: A, sig: sig.slice(0, -2) + 'xx', via: 'one-click' }, null)).status, 403, 'the same signature check');
    const r3 = await handleDigest('stop', { u: A, sig, via: 'one-click' }, null);
    assertEquals([r3.status, (await r3.json()).wasEnabled, store.digests.length], [200, true, 0]);
    assertEquals(stopLogs(), ['stop link (old)', 'stop link', 'stop link (one-click)']);
  } finally { restoreDigestEnv(); }
});
Deno.test('«فصل» Meta: حسابات Meta بتخرج من ملخص المستخدم وصلاحياتها بتتمسح', async () => {
  const A = '11111111-2222-3333-4444-555555555555';
  const T = 'TOKEN_abcdefghijklmnopqrstuvwxyz';
  const store = fakeDigestDb();
  try {
    await handleDigest('digest.enable', { token: T, accountId: 'act_1', email: 'a@store.com', lang: 'ar', consent: true }, null, A);
    const r = await handleDigest('digest.disconnect', {}, null, A);
    assertEquals([(await r.json()).removed, store.accounts.length, store.tokens.length, store.digests.length], [1, 0, 0, 0]);
  } finally { restoreDigestEnv(); }
});
// التدقيق الشامل ١١ نوفمبر ٢٠٢٦: منطقة زمنية Intl بيقبلها وقاعدة البيانات مبتعرفهاش كانت بتوقّع طابور البريد لكل المستخدمين
Deno.test('الملخص: منطقة زمنية قاعدة البيانات مبتعرفهاش متتحفظش — بيتحط الافتراضي', async () => {
  const A = '11111111-2222-3333-4444-555555555555';
  const SNAP = 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789a0', SEALED = 'v2.' + 'A'.repeat(16) + '.' + 'B'.repeat(40);
  const store = fakeDigestDb();
  try {
    const r = await handleDigest('digest.enable', { platform: 'snapchat', accountId: SNAP, sealed: SEALED, name: 'S', timezone: 'AET', email: 'a@store.com', consent: true }, null, A);
    assertEquals(r.status, 200);
    assertEquals(store.digests[0].timezone, 'Asia/Riyadh');
  } finally { restoreDigestEnv(); }
});
// التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (OWASP ASVS 2.5.5): صاحب الحساب يعرف لما وجهة رسائله تتغيّر
Deno.test('الملخص: تغيير البريد بيبلّغ العنوان القديم الأول، وبعده تأكيد للعنوان الجديد', async () => {
  const A = '11111111-2222-3333-4444-555555555555', T = 'TOKEN_abcdefghijklmnopqrstuvwxyz';
  const store = fakeDigestDb();
  try {
    assertEquals((await handleDigest('digest.enable', { token: T, accountId: 'act_1', email: 'old@store.com', lang: 'ar', consent: true }, null, A)).status, 200);
    const before = store.mails.length;
    assertEquals((await handleDigest('digest.update', { email: 'new@store.com' }, null, A)).status, 200);
    const sent = store.mails.slice(before);
    assertEquals(sent.map((m: any) => m.to[0]), ['old@store.com', 'new@store.com']);
    assertEquals(sent[0].subject, 'تم تغيير بريد الملخص التلقائي');
    assert(String(sent[0].html).indexOf('new@store.com') < 0, 'the new address is not disclosed to the old one');
    // إلغاء الاشتراك بنقرة (٦٩): العنوان القديم خرج من الملخص فمفيش ترويسة إلغاء، وتأكيد الجديد فيه رابط إيقاف فبياخدها
    assertEquals([sent[0].headers, typeof sent[1].headers], [undefined, 'object'], 'one-click headers only where a stop link is');
    // نفس البريد تاني = مفيش رسائل
    const again = store.mails.length;
    assertEquals((await handleDigest('digest.update', { email: 'new@store.com' }, null, A)).status, 200);
    assertEquals(store.mails.length, again);
  } finally { restoreDigestEnv(); }
});
// المرحلة ٢ (٣١ أكتوبر ٢٠٢٦ — «واجعل الملخص لكل المنصات»): حساب Snapchat بنسخته المقفولة من الأداة، مشفّرة تاني عندنا
Deno.test('الملخص بحساب Snapchat: التفعيل والإضافة بالنسخة المقفولة (مشفّرة تاني)، والتجديد، والإزالة، و«فصل» Snapchat بس', async () => {
  const A = '11111111-2222-3333-4444-555555555555';
  const T = 'TOKEN_abcdefghijklmnopqrstuvwxyz';
  const SNAP = 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789a0', SNAP2 = '0f0e0d0c-0b0a-4908-8706-050403020100';
  const SEALED = 'v2.' + 'A'.repeat(16) + '.' + 'B'.repeat(40);
  const open = { platform: 'snapchat', accountId: SNAP, sealed: SEALED, name: 'Snap store\u0007', timezone: 'Asia/Dubai' };
  const store = fakeDigestDb();
  const call = async (action: string, body: Record<string, unknown>) => {
    const r = await handleDigest(action, body, null, A);
    return { status: r.status, body: await r.json() };
  };
  try {
    // شكل غلط: منصة مش مدعومة، ورقم حساب مش بتاع Snapchat، ونسخة مش بشكل _seal.js
    assertEquals((await call('digest.enable', { ...open, platform: 'google', email: 'a@store.com', consent: true })).status, 400);
    assertEquals((await call('digest.enable', { ...open, accountId: 'act_1', email: 'a@store.com', consent: true })).status, 400);
    assertEquals((await call('digest.enable', { ...open, sealed: 'not-sealed', email: 'a@store.com', consent: true })).status, 400);
    const en = await call('digest.enable', { ...open, email: 'a@store.com', consent: true, lang: 'ar' });
    assertEquals(en.status, 200);
    assertEquals([en.body.settings.timezone, en.body.accounts.map((a: any) => [a.platform, a.accountId, a.name])], ['Asia/Dubai', [['snapchat', SNAP, 'Snap store']]],
      'the account time zone, and the name without control characters');
    assertEquals(store.sealed.length, 1);
    assert(store.sealed[0].cipher.indexOf(SEALED) < 0 && store.sealed[0].cipher.indexOf('AAAAAAAA') < 0, 'stored encrypted again, not as sent');
    const days = (Date.parse(store.sealed[0].expires_at) - Date.now()) / 86400000;
    assert(days > 59.9 && days <= 60, 'kept 60 days from now');
    assert(String(store.mails[store.mails.length - 1].html).indexOf('Snap store') > -1, 'the confirmation names the account');
    // حساب Meta في نفس الملخص، وحساب Snapchat تاني
    assertEquals((await call('digest.add', { token: T, accountId: 'act_1' })).status, 200);
    const add = await call('digest.add', { ...open, accountId: SNAP2, name: 'Second snap' });
    assertEquals(add.body.accounts.map((a: any) => a.platform + ':' + a.name), ['snapchat:Snap store', 'meta:Store one', 'snapchat:Second snap']);
    const got = await call('digest.get', { platform: 'snapchat', accountId: SNAP2 });
    assertEquals([got.body.current.platform, got.body.current.included, got.body.current.tokenWorks], ['snapchat', true, true]);
    // التجديد: نسخة جديدة + ٦٠ يوم من دلوقتي + الاسم بيتحدّث. حساب مش في الملخص = enabled false
    store.sealed[0].expires_at = new Date(Date.now() + 86400000).toISOString();
    const rf = await call('digest.refresh', { ...open, name: 'Snap store new' });
    assertEquals(rf.body.enabled, true);
    assert(Date.parse(store.sealed.find((t) => t.account === SNAP).expires_at) - Date.now() > 59 * 86400000, 'renewed');
    assertEquals(store.accounts.find((a) => a.account_id === SNAP).name, 'Snap store new');
    assertEquals((await call('digest.refresh', { ...open, accountId: '22222222-3333-4444-5555-666666666666' })).body, { ok: true, enabled: false, hasDigest: true });
    // الإزالة: الحساب ونسخته بس
    const rm = await call('digest.remove', { platform: 'snapchat', accountId: SNAP2 });
    assertEquals([rm.body.stopped, store.sealed.map((t) => t.account)], [false, [SNAP]]);
    // «فصل» Snapchat: حسابات Snapchat ونسخها بتخرج، وMeta بتفضل
    const dc = await call('digest.disconnect', { platform: 'snapchat' });
    assertEquals([dc.body.removed, dc.body.stopped, store.sealed.length, store.accounts.map((a) => a.platform)], [1, false, 0, ['meta']]);
    // الإيقاف بيمسح كل حاجة
    await call('digest.add', { ...open });
    await call('digest.disable', {});
    assertEquals([store.digests.length, store.sealed.length, store.tokens.length], [0, 0, 0]);
  } finally { restoreDigestEnv(); }
});

// ---------- الإرسال من الطابور (runner.ts assemble — ٣١ أكتوبر ٢٠٢٦، مراجعة ١ نوفمبر) ----------
// المحرك الحقيقي بيتحمّل من GitHub في المُشغّل — هنا أقل الأسماء اللي رسائل البريد بتستخدمها
function fakeEngine(): () => void {
  const G = globalThis as any, had = { I18N: G.I18N, ar: G.ar, fmtRange: G.fmtRange, DX: G.DX };
  G.I18N = { setLang() {}, t: (k: string) => k, months: () => ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] };
  G.ar = (n: number) => String(n);
  G.fmtRange = (a: string, b: string) => a + ' – ' + b;
  G.DX = { toText: (c: any, name: string) => name + ': ' + c.title };
  return () => { Object.assign(G, had); };
}
type QRow = Record<string, any>;
// قاعدة بيانات وهمية بنفس فلاتر PostgREST اللي الإرسال بيستخدمها: نتايج الطابور، وحسابات الملخص، وحجز الإرسال (sending_until)
function fakeQueueDb(st: { outbox: QRow[]; accounts: QRow[]; digest: QRow }) {
  const out = { mails: [] as any[], marks: [] as any[], logs: [] as any[] };
  Deno.env.set('RESEND_API_KEY', 'test-resend-key');
  const q = (url: string) => new URLSearchParams(url.split('?')[1] || '');
  const eqv = (p: URLSearchParams, k: string) => { const v = p.get(k); return v && v.indexOf('eq.') === 0 ? decodeURIComponent(v.slice(3)) : null; };
  stubFetch((url, init) => {
    const method = (init && init.method) || 'GET', body = init && init.body ? JSON.parse(String(init.body)) : null;
    if (url.indexOf('api.resend.com') > -1) { out.mails.push(body); return json({ id: 'mail-' + out.mails.length }); }
    const p = q(url);
    if (url.indexOf('/rest/v1/digest_outbox') > -1) {
      const kind = eqv(p, 'kind'), period = eqv(p, 'period'), user = eqv(p, 'user_id');
      const pv = p.get('period'), notPeriod = pv && pv.indexOf('neq.') === 0 ? decodeURIComponent(pv.slice(4)) : null;
      const match = (r: QRow) => (!kind || r.kind === kind) && (period == null || r.period === period) && (notPeriod == null || r.period !== notPeriod) &&
        (!user || r.user_id === user);
      if (method === 'GET') return json(st.outbox.filter(match));
      if (method === 'DELETE') { const gone = st.outbox.filter(match); st.outbox = st.outbox.filter((r) => !match(r)); return json(gone); }
    }
    if (url.indexOf('/rest/v1/user_digest_accounts') > -1) {
      if (method === 'GET') return json(st.accounts.filter((a) => a.user_id === eqv(p, 'user_id')));
      if (method === 'PATCH') {
        const need = eqv(p, 'need_summary');
        st.accounts.forEach((a) => { if (a.user_id === eqv(p, 'user_id') && (need == null || a.need_summary === need)) Object.assign(a, body); });
        return new Response(null, { status: 204 });
      }
    }
    if (url.indexOf('/rest/v1/user_digests') > -1 && method === 'PATCH') {
      const pend = eqv(p, 'summary_pending');
      if (pend != null) {   // حجز الإرسال: نفس الفترة، ومفيش تشغيل تاني بيبعتها دلوقتي
        const free = !st.digest.sending_until || Date.parse(st.digest.sending_until) < Date.now();
        if (st.digest.summary_pending !== pend || !free) return json([]);
        Object.assign(st.digest, body);
        return json([st.digest]);
      }
      Object.assign(st.digest, body);
      return new Response(null, { status: 204 });
    }
    if (url.indexOf('/rest/v1/user_alert_marks') > -1) { out.marks.push(...body); return new Response(null, { status: 201 }); }
    if (url.indexOf('/rest/v1/send_log') > -1) { out.logs.push(body); return new Response(null, { status: 201 }); }
    if (url.indexOf('/rest/v1/ad_accounts') > -1) return json(eqv(p, 'account_id') === 'act_2' ? [{ name: 'Meta two' }] : []);
    throw new Error('unexpected fetch ' + method + ' ' + url);
  });
  return out;
}
const QA = '11111111-2222-3333-4444-555555555555', QKEY = '2026-10-28..2026-10-31';
const qUser = (extra: QRow = {}): any => ({ user_id: QA, email: 'a@store.com', lang: 'ar', timezone: 'Asia/Riyadh', summary_days: [0, 3], summary_hour: 9,
  last_summary_until: '2026-10-27', last_monthly: '2026-10', summary_pending: null, summary_pending_at: null, monthly_pending: null, monthly_pending_at: null, ...extra });
const qAcct = (platform: string, id: string, extra: QRow = {}): QRow => ({ user_id: QA, platform, account_id: id, name: platform === 'meta' ? null : 'Snap ' + id,
  checked_at: new Date(Date.now() - 5 * 60000).toISOString(), claimed_until: null, need_summary: null, need_monthly: null, ...extra });
const qUrgent = (platform: string, id: string, name: string): QRow => ({ user_id: QA, platform, account_id: id, kind: 'urgent', period: '', created_at: new Date().toISOString(),
  payload: { platform, account: id, name, fresh: [{ title: 'TITLE-' + name, detail: 'd', advice: 'a', code: 'loss' }], remind: [] },
  marks: [{ kind: 'perf', object_id: 'ad-' + id, first_at: 'x', last_sent_at: 'x', last_seen_at: 'x', times_sent: 1, resolved_at: null, last_code: 'loss' }] });
const qSum = (platform: string, id: string, name: string, tone: string): QRow => ({ user_id: QA, platform, account_id: id, kind: 'summary', period: QKEY,
  created_at: new Date().toISOString(),
  payload: { platform, account: id, name, sum: { composed: { period: 'PERIOD-' + name, title: 'TITLE-' + name, tone, kpis: [], blocks: [], notes: [] }, actions: null }, alerts: null } });
const noEngine = () => Promise.resolve();

Deno.test('الطابور — العاجل: رسالة واحدة بحسابات المستخدم، والبصمات بعد الإرسال بس، ومبيتبعتش وحساب لسه بيتفحص', async () => {
  const restoreEngine = fakeEngine();
  try {
    // حساب لسه محجوز (بيتفحص دلوقتي): العاجل بيستناه
    const st = { outbox: [qUrgent('meta', 'act_1', 'Meta one'), qUrgent('snapchat', 'S1', 'Snap S1')],
      accounts: [qAcct('meta', 'act_1'), qAcct('snapchat', 'S1'), qAcct('snapchat', 'S2', { claimed_until: new Date(Date.now() + 60000).toISOString() })], digest: {} };
    let out = fakeQueueDb(st);
    assertEquals(await assemble([qUser()], noEngine, { stop: {}, us: {} }), { 'urgent-waiting': 1 });
    assertEquals([out.mails.length, st.outbox.length], [0, 2], 'nothing sent, nothing lost');
    restoreFetch();
    // الفحص خلص: رسالة واحدة فيها الحسابين، والبصمات المستنية اتحفظت بمنصة كل حساب، والطابور فضي
    st.accounts[2].claimed_until = null;
    out = fakeQueueDb(st);
    assertEquals(await assemble([qUser()], noEngine, { stop: {}, us: {} }), { 'urgent-sent': 1 });
    assertEquals(out.mails.length, 1);
    const m = out.mails[0];
    assertEquals(m.subject, 'عاجل: أمران يحتاجان إلى إجراء — في حسابين');
    // الصياغة اللي وافق عليها صاحب المنتج ١٣ نوفمبر ٢٠٢٦ (القديمة كانت بتنفي وبعدين توعد بتذكير)
    assert(String(m.text).indexOf('لن تصلك رسالة أخرى عن هذا التنبيه وحده إلا تذكيراً واحداً إذا استمر يومين') > -1, 'the approved wording');
    // إلغاء الاشتراك بنقرة (٦٩): الترويستان برابط الإيقاف نفسه اللي في آخر الرسالة
    const stopLine = String(m.text).split('\n').pop() as string;
    assertEquals(stopLine.indexOf('https://adscenter.online/stop?u=' + QA + '&s='), 0);
    assertEquals(m.headers, { 'List-Unsubscribe': '<' + stopLine + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    assert(String(m.html).indexOf('TITLE-Meta one') > -1 && String(m.html).indexOf('TITLE-Snap S1') > -1, 'both accounts in one email');
    assert(String(m.html).indexOf('snapchat=S1') > -1 && String(m.html).indexOf('meta=act_1') > -1, 'each account links to its own page');
    // التدقيق الشامل ١١ نوفمبر ٢٠٢٦: النسخة النصية كانت بتقول «Ads Center» من غير أي عنوان
    assert(String(m.text).indexOf('Ads Center (https://adscenter.online/app?meta=act_1&view=alerts)') > -1, 'the plain-text part carries the tool link: ' + String(m.text).slice(0, 600));
    assertEquals(out.marks.map((r: any) => r.platform + ':' + r.account_id), ['meta:act_1', 'snapchat:S1']);
    assertEquals(st.outbox.length, 0);
    restoreFetch();
    // تشغيل تاني بعدها: مفيش حاجة تتبعت تاني
    out = fakeQueueDb(st);
    assertEquals(await assemble([qUser()], noEngine, { stop: {}, us: {} }), {});
    assertEquals(out.mails.length, 0);
  } finally { restoreFetch(); restoreEngine(); Deno.env.delete('RESEND_API_KEY'); }
});

// مراجعة ٨ نوفمبر ٢٠٢٦ (صاحب المنتج: «ليست كل التنبيهات العاجلة تصل للايميل»): أي رسالة عاجلة بتقول كل العاجل اللي لسه قائم في كل
// الحسابات (زي صفحة التنبيهات)، والقائم لوحده (ctx) مبيبعتش رسالة ولا بيستنى الإرسال، والقديم منه (فحص وقف) متقريش
Deno.test('الطابور — العاجل: الرسالة بتقول العاجل القائم في باقي الحسابات، والسياق لوحده مبيبعتش، والقديم منه متقريش', async () => {
  const restoreEngine = fakeEngine();
  try {
    const ctx = (platform: string, id: string, name: string, minsAgo: number, items: any[]): QRow => ({ user_id: QA, platform, account_id: id, kind: 'urgent', period: 'ctx',
      created_at: new Date(Date.now() - minsAgo * 60000).toISOString(), payload: { platform, account: id, name, fresh: [], remind: [], ongoing: items } });
    const item = (title: string, name: string, first: string) => ({ title, name, first_at: first });
    // سياق بس (مفيش جديد في أي حساب): مفيش رسالة، ومفيش «مستني إرسال»، والصف بيفضل
    const st = { outbox: [ctx('snapchat', 'S1', 'Snap S1', 10, [item('OLD-WASTE', 'Ad w', '2026-10-31T16:10:16Z')])],
      accounts: [qAcct('meta', 'act_1'), qAcct('snapchat', 'S1')], digest: {} };
    let out = fakeQueueDb(st);
    assertEquals(await assemble([qUser()], noEngine, { stop: {}, us: {} }), {}, 'context alone is not a message');
    assertEquals([out.mails.length, st.outbox.length], [0, 1], 'nothing sent, the context row stays');
    restoreFetch();
    // جديد في Meta، وفي Meta نفسها قائم قديم، وفي Snapchat قائم (سياق حديث) وسياق تاني قديم من حساب وقف فحصه
    const fresh = qUrgent('meta', 'act_1', 'Meta one');
    fresh.payload.ongoing = [item('OLD-COST', 'Ad c', '2026-11-03T04:00:46Z')];
    st.outbox.push(fresh, ctx('snapchat', 'S2', 'Snap S2', 200, [item('STALE', 'Ad s', '2026-11-01T04:00:00Z')]));
    out = fakeQueueDb(st);
    assertEquals(await assemble([qUser()], noEngine, { stop: {}, us: {} }), { 'urgent-sent': 1 });
    const html = String(out.mails[0].html);
    assertEquals(out.mails[0].subject, 'عاجل: TITLE-Meta one — Meta one', 'the subject is about the new alert only');
    assert(html.indexOf('TITLE-Meta one') > -1, 'the new alert in full');
    assert(html.indexOf('وتنبيهات عاجلة أخرى ما زالت قائمة منذ فترة:') > -1, 'a still-ongoing section');
    assert(html.indexOf('OLD-COST') > -1 && html.indexOf('OLD-WASTE') > -1, 'ongoing alerts of this account and of the other account');
    assert(html.indexOf('Snap S1') > -1, 'the other account is named');
    assert(html.indexOf('STALE') < 0, 'a context older than 2 hours is not read (its account stopped being checked)');
    assert(html.indexOf('OLD-COST') < html.indexOf('OLD-WASTE'), 'accounts in their order: the one with the new alert first');
    assertEquals(st.outbox.filter((r) => r.period === 'ctx').length, 0, 'context rows go with the message (privacy policy: deleted once sent; the next check rewrites them)');
    assertEquals(st.outbox.filter((r) => r.period === '').length, 0, 'the message rows are gone');
    restoreFetch();
    // حساب فيه ١٣ عاجل قائم: أول ١٠ (الأقدم) وسطر بعدد الباقي
    const lots = qUrgent('meta', 'act_1', 'Meta one');
    lots.payload.ongoing = Array.from({ length: 13 }, (_, i) => item('LOT-' + String(i).padStart(2, '0'), 'Ad', '2026-11-' + String(1 + i).padStart(2, '0') + 'T00:00:00Z'));
    st.outbox = [lots];
    out = fakeQueueDb(st);
    assertEquals(await assemble([qUser()], noEngine, { stop: {}, us: {} }), { 'urgent-sent': 1 });
    const h2 = String(out.mails[0].html);
    assert(h2.indexOf('LOT-00') > -1 && h2.indexOf('LOT-09') > -1 && h2.indexOf('LOT-10') < 0, 'the 10 oldest');
    assert(h2.indexOf('و3 تنبيهات أخرى') > -1, 'and the count of the rest: ' + h2.slice(h2.indexOf('LOT-09'), h2.indexOf('LOT-09') + 400));
    // (١١٨) الباقي ١ و٢ بالكلمة والمعدود الصح — كانت «و1 تنبيه آخر» و«و2 تنبيهات أخرى»
    for (const [n, want] of [[11, 'وتنبيه آخر — كلها في Ads Center.'], [12, 'وتنبيهان آخران — كلها في Ads Center.']] as [number, string][]) {
      lots.payload.ongoing = Array.from({ length: n }, (_, i) => item('LOT-' + String(i).padStart(2, '0'), 'Ad', '2026-11-' + String(1 + i).padStart(2, '0') + 'T00:00:00Z'));
      st.outbox = [lots];
      out = fakeQueueDb(st);
      assertEquals(await assemble([qUser()], noEngine, { stop: {}, us: {} }), { 'urgent-sent': 1 });
      const hn = String(out.mails[0].html);
      assert(hn.indexOf(want) > -1, n + ' ongoing: «' + want + '» in ' + hn.slice(hn.indexOf('LOT-09'), hn.indexOf('LOT-09') + 300));
    }
  } finally { restoreFetch(); restoreEngine(); Deno.env.delete('RESEND_API_KEY'); }
});
// صياغة صاحب المنتج ١٣ نوفمبر ٢٠٢٦: عنوان التذكير (بعد يومين) وتاريخ أول إبلاغ في المربع، وبعده القائم («أخرى» — مجموعة منفصلة) — باللغتين
Deno.test('الطابور — التذكير: «تذكير — ما زال قائماً بعد يومين من إبلاغك به» بتاريخ أول إبلاغ، وبعده «وتنبيهات عاجلة أخرى ما زالت قائمة منذ فترة» (باللغتين)', async () => {
  const restoreEngine = fakeEngine();
  try {
    const want = {
      ar: { subject: 'تذكير: «REMIND-T» ما زال قائماً — Meta one', remind: 'تذكير — ما زال قائماً بعد يومين من إبلاغك به:', first: 'أبلغناك به أول مرة يوم 10 نوفمبر.',
        still: 'وتنبيهات عاجلة أخرى ما زالت قائمة منذ فترة:' },
      en: { subject: 'Reminder: REMIND-T is still ongoing — Meta one', remind: 'Reminder — still ongoing two days after we alerted you:', first: 'We first alerted you on ',
        still: 'Other urgent alerts that have been ongoing for a while:' }
    };
    for (const lang of ['ar', 'en'] as const) {
      const rem = qUrgent('meta', 'act_1', 'Meta one');
      rem.payload.fresh = [];
      rem.payload.remind = [{ a: { title: 'REMIND-T', detail: 'd', advice: 'a', code: 'loss' },
        m: { kind: 'perf', object_id: 'ad-act_1', first_at: '2026-11-10T09:00:00Z', last_sent_at: '2026-11-10T09:00:00Z', last_seen_at: 'x', times_sent: 1, resolved_at: null, last_code: 'loss' } }];
      rem.payload.ongoing = [{ title: 'OLD-COST', name: 'Ad c', first_at: '2026-11-03T04:00:46Z' }];
      const out = fakeQueueDb({ outbox: [rem], accounts: [qAcct('meta', 'act_1')], digest: {} });
      assertEquals(await assemble([qUser({ lang })], noEngine, { stop: {}, us: {} }), { 'urgent-reminded': 1 }, lang);
      const w = want[lang], m = out.mails[0], html = String(m.html);
      assertEquals(m.subject, w.subject);
      // بالترتيب، وكل واحد بعد اللي قبله (عنوان التنبيه نفسه موجود كمان في رأس الرسالة فوق)
      let pos = -1;
      for (const x of [w.remind, 'REMIND-T', w.first, w.still, 'OLD-COST']) {
        const i = html.indexOf(x, pos + 1);
        assert(i > pos, lang + ': missing or out of order: ' + x);
        pos = i;
      }
      restoreFetch();
    }
  } finally { restoreFetch(); restoreEngine(); Deno.env.delete('RESEND_API_KEY'); }
});
Deno.test('الملخص: كل تنبيه عاجل لسه قائم بيظهر (الأقدم أول)، والقطع على اللي حُلّ بس — بعدده', () => {
  const mk = (id: string, first: string, resolved: string | null) => ({ kind: 'perf', object_id: id, first_at: first, last_sent_at: first, last_seen_at: first,
    times_sent: 2, resolved_at: resolved, last_code: 'loss' });
  // حساب Snapchat حقيقي ٨ نوفمبر: ١١ بصمة، ٨ قائمة و٣ اتحلّت، و٦ منهم بنفس اللحظة عند حد القطع
  const T = '2026-10-31T16:10:16.107Z';
  const list = [mk('o1', '2026-11-08T04:52:18Z', null), mk('o2', '2026-11-06T04:00:19Z', null), mk('o3', '2026-11-06T04:00:19Z', null),
    mk('o4', '2026-11-02T04:00:16Z', null), mk('o5', '2026-11-02T04:00:16Z', null), mk('o6', T, null), mk('o7', T, null), mk('o8', T, null),
    mk('r1', T, '2026-11-05T14:24:18Z'), mk('r2', T, '2026-11-04T09:12:18Z'), mk('r3', T, '2026-11-04T08:20:19Z')];
  for (const order of [list, list.slice().reverse()]) {
    const p = statusPick(order);
    assertEquals(p.pick.filter((m) => !m.resolved_at).length, 8, 'every ongoing alert, whatever the input order');
    assertEquals([p.pick.length, p.more], [8, 3], 'the resolved ones are the ones cut, and counted');
    assertEquals(p.pick.map((m) => m.object_id).slice(0, 3), ['o6', 'o7', 'o8'], 'the longest-standing first');
  }
  // مكان باقي: أحدث اللي اتحلّ يكمّل
  const few = statusPick([mk('o1', T, null), mk('r1', T, '2026-11-05T14:24:18Z'), mk('r2', T, '2026-11-04T09:12:18Z')]);
  assertEquals([few.pick.map((m) => m.object_id), few.more], [['o1', 'r1', 'r2'], 0]);
  // أكتر من ٨ قائمين: كلهم يظهروا (مفيش قطع على القائم أبداً)
  const many = Array.from({ length: 11 }, (_, i) => mk('o' + i, '2026-11-0' + (1 + (i % 7)) + 'T00:00:00Z', null));
  assertEquals(statusPick(many).pick.length, 11);
  // ترتيب القائم في رسالة العاجل: الحساب بحسابه، والأقدم أول
  const sec = (name: string, items: any[]) => ({ platform: 'meta', account: name, name, fresh: [], remind: [], ongoing: items });
  const all = ongoingAll([sec('A', [{ title: 'n', name: '', first_at: '2026-11-07' }, { title: 'o', name: '', first_at: '2026-11-01' }])], [sec('B', [{ title: 'b', name: '', first_at: '2026-11-03' }]), sec('C', [])]);
  assertEquals(all.map((s) => s.name + ':' + s.items.map((x) => x.title).join('')), ['A:on', 'B:b'], 'oldest first, empty accounts left out');
});
Deno.test('الطابور — الملخص: بيستنى أقسام كل الحسابات، وبيتبعت مرة واحدة، وبعد ٣ ساعات بالموجود وأسماء اللي متقريتش', async () => {
  const restoreEngine = fakeEngine();
  try {
    const at = new Date(Date.now() - 10 * 60000).toISOString();
    const st = { outbox: [qSum('snapchat', 'S1', 'Snap S1', 'good')],
      accounts: [qAcct('meta', 'act_2', { need_summary: QKEY }), qAcct('snapchat', 'S1')],
      digest: { summary_pending: QKEY, summary_pending_at: at, sending_until: null } as QRow };
    let out = fakeQueueDb(st);
    assertEquals(await assemble([qUser({ summary_pending: QKEY, summary_pending_at: at })], noEngine, { stop: {}, us: {} }), { 'summary-waiting': 1 });
    assertEquals(out.mails.length, 0, 'waits for the Meta section');
    restoreFetch();
    // تشغيل تاني بيبعتها دلوقتي (sending_until): التشغيل ده مبيبعتش نفس الملخص
    const late = new Date(Date.now() - 4 * 3600000).toISOString();
    st.digest.summary_pending_at = late;
    st.digest.sending_until = new Date(Date.now() + 60000).toISOString();
    out = fakeQueueDb(st);
    assertEquals(await assemble([qUser({ summary_pending: QKEY, summary_pending_at: late })], noEngine, { stop: {}, us: {} }), {});
    assertEquals(out.mails.length, 0, 'never twice');
    restoreFetch();
    // بعد ٣ ساعات: بالموجود، وحساب Meta اللي متقريش باسمه
    st.digest.sending_until = null;
    out = fakeQueueDb(st);
    assertEquals(await assemble([qUser({ summary_pending: QKEY, summary_pending_at: late })], noEngine, { stop: {}, us: {} }), { summary: 1 });
    assertEquals(out.mails.length, 1);
    assert(String(out.mails[0].html).indexOf('PERIOD-Snap S1') > -1, 'the Snapchat section');
    assert(String(out.mails[0].html).indexOf('Meta two') > -1, 'the unread Meta account is named, not silently dropped');
    assertEquals([st.digest.summary_pending, st.digest.last_summary_until, st.digest.sending_until, st.outbox.length, st.accounts[0].need_summary],
      [null, '2026-10-31', null, 0, null], 'closed: next window starts after it, contents deleted');
  } finally { restoreFetch(); restoreEngine(); Deno.env.delete('RESEND_API_KEY'); }
});

// التدقيق الشامل ١١ نوفمبر ٢٠٢٦: الفترة كانت بتتسجّل «اتبعتت» بعد ٣ ساعات من غير أي رسالة لو ولا حساب اتقرا (عطل مؤقت، أو أول تشغيل
// بعد انقطاع أطول من ٣ ساعات)، فأيامها مبتظهرش في أي ملخص بعد كده
Deno.test('الطابور — الملخص: من غير أي قسم مقروء بيستنى ومبيتقفلش بصمت، وبعد ٢٤ ساعة بيتقفل من غير ما يتسجّل إنه اتبعت', async () => {
  const restoreEngine = fakeEngine();
  try {
    const late = new Date(Date.now() - 4 * 3600000).toISOString();
    const st = { outbox: [] as QRow[], accounts: [qAcct('meta', 'act_2', { need_summary: QKEY })],
      digest: { summary_pending: QKEY, summary_pending_at: late, sending_until: null, last_summary_until: '2026-10-27' } as QRow };
    let out = fakeQueueDb(st);
    assertEquals(await assemble([qUser({ summary_pending: QKEY, summary_pending_at: late })], noEngine, { stop: {}, us: {} }), { 'summary-waiting': 1 });
    assertEquals([out.mails.length, st.digest.summary_pending, st.digest.last_summary_until, st.accounts[0].need_summary], [0, QKEY, '2026-10-27', QKEY],
      'after 3 hours with nothing read: still waiting, nothing closed');
    restoreFetch();
    // حساب وصوله ضاع (قسم «لم نستطع قراءة أرقامه») مش قسم مقروء: لسه بيستنى الحساب التاني
    st.outbox = [{ user_id: QA, platform: 'snapchat', account_id: 'S9', kind: 'summary', period: QKEY, created_at: late, payload: { missing: true, name: 'Lost' } }];
    out = fakeQueueDb(st);
    assertEquals(await assemble([qUser({ summary_pending: QKEY, summary_pending_at: late })], noEngine, { stop: {}, us: {} }), { 'summary-waiting': 1 });
    assertEquals(out.mails.length, 0);
    restoreFetch();
    // بعد ٢٤ ساعة: الفترة بتتقفل من غير رسالة ومن غير ما آخر ملخص يتحرّك — الملخص الجاي بيغطي أيامها
    const dead = new Date(Date.now() - 25 * 3600000).toISOString();
    st.outbox = [];
    st.digest.summary_pending_at = dead;
    out = fakeQueueDb(st);
    assertEquals(await assemble([qUser({ summary_pending: QKEY, summary_pending_at: dead })], noEngine, { stop: {}, us: {} }), { 'summary-dropped': 1 });
    assertEquals([out.mails.length, st.digest.summary_pending, st.digest.last_summary_until, st.digest.sending_until, st.accounts[0].need_summary],
      [0, null, '2026-10-27', null, null], 'closed without marking the days as sent');
  } finally { restoreFetch(); restoreEngine(); Deno.env.delete('RESEND_API_KEY'); }
});
// التدقيق الشامل ١١ نوفمبر ٢٠٢٦: «تعديل كبير» كان بيضيع لو فحص الساعة فشل مؤقتاً — الفحص الجاي كان بيبدأ من وقت الفحص الفاشل
Deno.test('سجل التعديلات بيتقري من آخر قراءة ناجحة ليه، مش من آخر فحص', () => {
  const now = Date.parse('2026-11-11T12:00:00Z'), iso = (h: number) => new Date(now - h * 3600000).toISOString();
  // فحص من ساعة فشل (checked_at اتحرّك)، وآخر قراءة ناجحة للسجل من ساعتين: التعديلات من ساعتين
  assertEquals(editsSince({ edits_at: iso(2), checked_at: iso(1) }, now), now - 2 * 3600000);
  // من غير علامة (حساب من قبل التحديث): آخر فحص زي الأول
  assertEquals(editsSince({ edits_at: null, checked_at: iso(1) }, now), now - 3600000);
  assertEquals(editsSince({ checked_at: iso(1) }, now), now - 3600000);
  // أول فحص خالص: آخر ساعتين
  assertEquals(editsSince({ edits_at: null, checked_at: null }, now), now - 2 * 3600000);
  // انقطاع طويل: ٢٤ ساعة لورا بالكتير
  assertEquals(editsSince({ edits_at: iso(72), checked_at: iso(1) }, now), now - 24 * 3600000);
});
// التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (OWASP SSRF Prevention Cheat Sheet): التحويل كان بيتتبع تلقائياً من غير مراجعة العنوان الجديد
Deno.test('فحص الروابط: التحويلات بتتتبع قفزة قفزة، والتحويل لعنوان IP أو اسم داخلي مبيتفتحش', async () => {
  const seen: string[] = [];
  stubFetch((url, init) => {
    seen.push(url);
    assertEquals((init as RequestInit).redirect, 'manual');
    if (url === 'https://shop.example/a') return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
    if (url === 'https://shop.example/b') return new Response(null, { status: 301, headers: { location: '/gone' } });
    if (url === 'https://shop.example/gone') return new Response('x', { status: 404 });
    if (url === 'https://shop.example/c') return new Response(null, { status: 302, headers: { location: 'https://localhost/admin' } });
    if (url === 'https://shop.example/loop') return new Response(null, { status: 302, headers: { location: 'https://shop.example/loop' } });
    return new Response('ok', { status: 200 });
  });
  try {
    assertEquals(await probe('https://shop.example/a'), { status: 302, blocked: true }, 'a redirect to an IP address is not followed');
    assertEquals(seen.filter((u) => u.indexOf('169.254') > -1).length, 0);
    assertEquals(await probe('https://shop.example/b'), { status: 404, blocked: false }, 'a relative redirect is followed to its end');
    assertEquals(await probe('https://shop.example/c'), { status: 302, blocked: true }, 'nor to an internal name');
    assertEquals(seen.filter((u) => u.indexOf('localhost') > -1).length, 0);
    assertEquals(await probe('https://shop.example/ok'), { status: 200, blocked: false });
    const before = seen.length;
    assertEquals(await probe('https://shop.example/loop'), { status: 0, blocked: false }, 'an endless redirect = no answer');
    assert(seen.length - before === 21, 'as many hops as fetch itself followed (20), then it gives up: ' + (seen.length - before));
  } finally { restoreFetch(); }
});
// التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٩): الاسم كان بيتفحص بالنص بس — «localhost.» (النقطة في الآخر) و«foo.internal.» كانوا بيعدّوا، والأسماء اللي
// بتتحلّ لعنوان داخلي («127.0.0.1.nip.io» و«localtest.me») كمان. دلوقتي النقطة بتتشال قبل الفحص، والعنوان بيتصنّف بسجلات IANA (RFC 6890)
Deno.test('فحص الروابط: النقطة في آخر الاسم، وتصنيف العناوين بسجلات IANA — الخاص والمحجوز وIPv4 جوه IPv6 والصيغ الغلط', () => {
  const ok = (s: string) => linkAllowed(new URL(s));
  assertEquals(['http://localhost./', 'http://LOCALHOST./x', 'http://foo.internal./', 'http://%6c%6f%63%61%6c%68%6f%73%74./', 'http://shop.local../'].map(ok),
    [false, false, false, false, false], 'a trailing dot');
  assertEquals(['https://shop.example/a', 'https://shop.example./a'].map(ok), [true, true], 'a normal shop, with or without the trailing dot');
  const inside = [
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '100.127.255.255', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.0.2.1',
    '192.168.1.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '::', '::1', '::7f00:1', '1::', '1:2:3:4:5:6:7::', 'fc00::1', 'fd00:ec2::254', 'FE80::1', 'febf::1', 'fec0::1', 'ff02::1', '100::1', '5f00::1',
    '2001:db8::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:2::1', '3fff::1', '3fff:fff::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:10.0.0.1', '::ffff:0:7f00:1',
    '64:ff9b::7f00:1', '64:ff9b::169.254.169.254', '64:ff9b:1::1', '2002:7f00:1::1', '2002:a00:1::',
    // ترتيب البايتات في الـ IPv4 المتشال: عناوين مش متماثلة (10.1.1.1 بالمقلوب 1.10.1.1 عام، و192.0.2.1 بالمقلوب 192.0.1.2 عام)
    '::ffff:10.1.1.1', '::ffff:a01:101', '::ffff:192.0.2.1', '::ffff:c000:201', '64:ff9b::a01:101', '64:ff9b::c000:201', '2002:a01:101::', '2002:c000:201::',
    'fe80::1%eth0', '1.2.3.256', '1.2.3', 'not-an-ip', '', ':::', '1::2::3', '2001:4860:4860:0:0:0:0:8888::', '2001:4860:4860:0:0:0:0:8888::::',
    '1:2:3:4:5:6:7:8:9', '::ffff:1.2.3.256', '2001:4860:4860::88888'];
  assertEquals(inside.filter((ip) => !privateAddr(ip)), [], 'not public');
  const outside = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '100.63.255.255', '100.128.0.1', '172.15.255.255', '172.32.0.1', '192.0.1.1', '192.0.3.1',
    '192.169.0.1', '198.17.255.255', '198.20.0.1', '198.51.101.1', '203.0.114.1', '223.255.255.255', '2606:4700::1111', '2A03:2880:F12F:83:FACE:B00C::25DE',
    '2001:4860:4860::8888', '2001:4860:4860:0:0:0:0:8888', '2000::1', '2001:3::1', '2001:2:1::1', '3fff:1000::1', '::ffff:8.8.8.8', '::ffff:808:808',
    '64:ff9b::808:808', '64:ff9b::8.8.8.8', '2002:808:808::1'];
  assertEquals(outside.filter(privateAddr), [], 'public');
});
// (١١٩) DNS قبل كل طلب وكل تحويل (OWASP SSRF)، ولو DNS مش متاح بنكمّل بالاسم زي الأول (عطل DNS ميبقاش «كل الروابط معطّلة» في البريد)
// ونكتبه في السجل مرة، وDNS المعلّق بيتقفل بمهلة الفحص نفسها
Deno.test('فحص الروابط: DNS قبل كل طلب وكل تحويل، وDNS مش متاح = بالاسم زي الأول ومرة في السجل، وDNS المعلّق بيتقفل بالمهلة', async () => {
  const notFound = () => Object.assign(new Error('no records'), { name: 'NotFound' });
  const DNS: Record<string, string[]> = { 'shop.example': ['93.184.216.34', '2606:4700::1111'], '127.0.0.1.nip.io': ['127.0.0.1'], 'localtest.me': ['127.0.0.1', '::1'],
    'evil.example': ['10.0.0.5'], 'v6only.example': ['fd00::1'], 'mapped.example': ['93.184.216.34', '::ffff:169.254.169.254'] };
  const asked: string[] = [], fetched: string[] = [], errs: string[] = [];
  const realError = console.error, realTimeout = AbortSignal.timeout;
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); };
  setResolverForTests((h, type) => {
    asked.push(h + '/' + type);
    const a = (DNS[h] || []).filter((x) => (type === 'A') === (x.indexOf(':') < 0));
    return a.length ? Promise.resolve(a) : Promise.reject(notFound());
  });
  stubFetch((url) => {
    fetched.push(url);
    if (url === 'https://shop.example/hop') return new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } });
    return new Response('ok', { status: 200 });
  });
  try {
    for (const u of ['http://127.0.0.1.nip.io/', 'https://localtest.me/', 'https://v6only.example/', 'https://mapped.example/']) {
      assertEquals(await probe(u), { status: 0, blocked: true }, u);
    }
    assertEquals(fetched, [], 'none of them is ever requested');
    assertEquals(await probe('https://shop.example./a'), { status: 200, blocked: false }, 'a public shop is checked (trailing dot too)');
    assertEquals(asked.slice(-2).sort(), ['shop.example/A', 'shop.example/AAAA'], 'both record types, for the name without the dot');
    assertEquals(await probe('https://shop.example/hop'), { status: 0, blocked: true }, 'a redirect to a name that resolves inside is not followed');
    assertEquals(fetched, ['https://shop.example./a', 'https://shop.example/hop'], 'evil.example never requested');
    assertEquals(await probe('https://gone.example/'), { status: 200, blocked: false }, 'no records at all (NotFound): fetch decides, as before');
    assertEquals(errs, [], 'NotFound is normal, nothing logged');
    // DNS مش متاح (صلاحية، أو DNS واقع): بالاسم لوحده زي الأول، ومرة واحدة في السجل مهما اتكرر
    setResolverForTests(() => Promise.reject(Object.assign(new Error('denied'), { name: 'PermissionDenied' })));
    fetched.length = 0;
    assertEquals(await probe('https://shop.example/a'), { status: 200, blocked: false });
    assertEquals(await probe('https://shop.example/b'), { status: 200, blocked: false });
    assertEquals(fetched, ['https://shop.example/a', 'https://shop.example/b'], 'DNS unavailable: checked by the name alone, as before');
    assertEquals(errs.length, 1, 'logged once: ' + errs.join(' | '));
    assert(errs[0].indexOf('link check: dns unavailable') === 0 && errs[0].indexOf('PermissionDenied') > -1, errs[0]);
    // وكل resolver جديد بيبدأ من غير «اتكتب قبل كده» (اختبار ورا التاني ميخبّيش السطر)
    setResolverForTests(() => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimedOut' })));
    assertEquals(await probe('https://shop.example/c'), { status: 200, blocked: false });
    assertEquals(errs.length, 2, 'logged again after a new resolver: ' + errs.join(' | '));
    assert(errs[1].indexOf('TimedOut') > -1, errs[1]);
    // DNS معلّق: مهلة الفحص بتقفله هو كمان (الحقيقية ٨ ثواني — هنا ٣٠ ملّي)، من غير طلب ولا سطر في السجل
    setResolverForTests(() => new Promise<string[]>(() => {}));
    (AbortSignal as any).timeout = (_ms: number) => realTimeout.call(AbortSignal, 30);
    fetched.length = 0;
    errs.length = 0;
    let timer = 0;
    const res = await Promise.race([probe('https://slow.example/'), new Promise((r) => { timer = setTimeout(() => r('hung'), 2000); })]);
    clearTimeout(timer);
    assertEquals(res, { status: 0, blocked: false }, 'a hung DNS ends with the check timeout = no answer');
    assertEquals([fetched, errs], [[], []]);
    // والمهلة لو خلصت في نص سلسلة تحويلات: القفزة اللي بعدها مبتستناش DNS معلّق (resolver مبيحترمش الإشارة)
    setResolverForTests((h) => (h === 'late.example' ? new Promise<string[]>(() => {}) : Promise.reject(notFound())));
    stubFetch((url) => {
      fetched.push(url);
      return url === 'https://first.example/'
        ? new Promise<Response>((r) => setTimeout(() => r(new Response(null, { status: 301, headers: { location: 'https://late.example/' } })), 60))
        : new Response('ok', { status: 200 });
    });
    const res2 = await Promise.race([probe('https://first.example/'), new Promise((r) => { timer = setTimeout(() => r('hung'), 2000); })]);
    clearTimeout(timer);
    assertEquals(res2, { status: 0, blocked: false }, 'the deadline passed mid-chain = no answer, without waiting on DNS');
    assertEquals([fetched, errs], [['https://first.example/'], []]);
  } finally {
    setResolverForTests(null);
    restoreFetch();
    console.error = realError;
    (AbortSignal as any).timeout = realTimeout;
  }
});

Deno.test('الطابور — ملخص بحسابات كتير: سطر لكل حساب بحكمه، والتفاصيل للي محتاج انتباه بس، والرسالة تحت حد قصّ Gmail', async () => {
  const restoreEngine = fakeEngine();
  try {
    const tones = ['bad', 'good', 'good', 'mixed', 'good'];
    const st = { outbox: tones.map((tn, i) => qSum('snapchat', 'S' + i, 'Acct' + i, tn)), accounts: tones.map((_tn, i) => qAcct('snapchat', 'S' + i)),
      digest: { summary_pending: QKEY, summary_pending_at: new Date().toISOString(), sending_until: null } as QRow };
    const out = fakeQueueDb(st);
    assertEquals(await assemble([qUser({ summary_pending: QKEY, summary_pending_at: st.digest.summary_pending_at })], noEngine, { stop: {}, us: {} }), { summary: 1 });
    const html = String(out.mails[0].html);
    tones.forEach((_tn, i) => assert(html.indexOf('TITLE-Acct' + i) > -1, 'every account has its line'));
    assert(html.indexOf('PERIOD-Acct0') > -1 && html.indexOf('PERIOD-Acct3') > -1, 'details for the bad and mixed accounts');
    assert(html.indexOf('PERIOD-Acct1') < 0 && html.indexOf('PERIOD-Acct2') < 0 && html.indexOf('PERIOD-Acct4') < 0, 'no details for the good ones');
    assert(new TextEncoder().encode(html).length < 102 * 1024, 'under the Gmail clipping size');
    assertEquals(out.mails[0].subject.indexOf('ملخص حساباتك'), 0);
    // النسخة النصية: سطر المواعيد وسطر الإيقاف زي HTML — كانت بتنتهي برابط من غير ما تقول إنه للإيقاف (التدقيق الشامل ١٣ نوفمبر ٢٠٢٦)
    const text = String(out.mails[0].text);
    assert(text.indexOf('يصلك هذا الملخص') > -1, 'the plain text says when it comes');
    assert(/لإيقاف الملخص والتنبيهات: إيقاف\nhttps?:\/\//.test(text), 'and names the stop link');
    const sumStop = text.split('\n').pop() as string;
    assertEquals(sumStop.indexOf('https://adscenter.online/stop?u=' + QA + '&s='), 0);
    assertEquals(out.mails[0].headers, { 'List-Unsubscribe': '<' + sumStop + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, 'one-click unsubscribe (69)');
  } finally { restoreFetch(); restoreEngine(); Deno.env.delete('RESEND_API_KEY'); }
});

Deno.test('الطابور — ملخص بحسابين: العنوان بينتهي بـ«حسابان» (خبر لوحده بعد النقطتين)', async () => {
  const restoreEngine = fakeEngine();
  try {
    const tones = ['bad', 'good'];
    const st = { outbox: tones.map((tn, i) => qSum('snapchat', 'S' + i, 'Acct' + i, tn)), accounts: tones.map((_tn, i) => qAcct('snapchat', 'S' + i)),
      digest: { summary_pending: QKEY, summary_pending_at: new Date().toISOString(), sending_until: null } as QRow };
    const out = fakeQueueDb(st);
    assertEquals(await assemble([qUser({ summary_pending: QKEY, summary_pending_at: st.digest.summary_pending_at })], noEngine, { stop: {}, us: {} }), { summary: 1 });
    assertMatch(String(out.mails[0].subject), /^ملخص حساباتك \(.*\): حسابان$/);
  } finally { restoreFetch(); restoreEngine(); Deno.env.delete('RESEND_API_KEY'); }
});

Deno.test('رسائل الوصول والصلاحية: فيها رابط الإيقاف، فبتاخد ترويسات الإلغاء بنقرة زي العاجل والملخص (send في runner.ts)', () => {
  const restoreEngine = fakeEngine();
  try {
    const stop = 'https://adscenter.online/stop?u=' + QA + '&s=abcdefghijklmnopqrstuvwxyz';
    for (const en of [false, true]) {
      const mails = [connectionMail('meta', 'act_1', 'Store one', en, stop), expiryMail('snapchat', 'S1', 'Snap one', '2026-12-01T00:00:00Z', 'Asia/Kuwait', en, stop)];
      for (const m of mails) {
        assertEquals(m.stop, stop, m.subject);
        assert(String(m.text).endsWith('\n' + stop) && String(m.html).indexOf('href="' + stop + '"') > -1, m.subject);
      }
    }
  } finally { restoreEngine(); }
});
Deno.test('عدد الحسابات في عنوان البريد: «في حسابين» بعد حرف الجر، و«حسابان» خبراً لوحده (التدقيق الشامل ١٣ نوفمبر ٢٠٢٦)', () => {
  assertEquals([accountsPhrase(2, false), accountsPhrase(2, false, true), accountsPhrase(2, true), accountsPhrase(2, true, true)],
    ['حسابين', 'حسابان', '2 accounts', '2 accounts']);
});

// التدقيق الشامل ١٥ نوفمبر ٢٠٢٦ (٨٩–٩٠): تطبيق Google في الإنتاج من ٣١ أكتوبر وصاحب الأداة بطّل يضيف البريد في Test users — فالإشعار
// مبيطلبش الخطوة دي، ورسالة التفعيل متقولش «فعّلنا البريد». والملخص بالبريد لـ Snapchat كمان من ٣١ أكتوبر، فخطوة «التنبيهات على بريدك»
// بتظهر لعميل Snapchat لوحده
Deno.test('join: Google من غير Test users ولا «فعّلنا البريد»، وخطوة الملخص بالبريد لعميل Meta أو Snapchat', async () => {
  const base = { id: '0b8f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b', email: 'a@example.com', role: 'buyer', name: 'A', business: 'B', store_url: 'https://shop.example',
    country: 'EG', fb_profile: null, google_email: 'g@example.com', snap_email: null, whatsapp: null, status: 'new', submissions: 1, activated_at: null,
    created_at: '2026-11-15T00:00:00Z', updated_at: '2026-11-15T00:00:00Z' };
  for (const lang of ['ar', 'en']) {
    const g = activationMail({ ...base, lang, platforms: ['google'] } as any);
    assert(!/فعّلنا البريد|activated <strong>[^<]*@|g@example\.com/.test(g.html + g.text), lang + ': no "we activated your email", and the Google email is not quoted');
    assertMatch(g.html, lang === 'en' ? /the email you use to sign in to Google Ads/ : /البريد الذي تدخل به إلى Google Ads/);
    assert(!/Automatic summary by email|الملخص التلقائي بالبريد/.test(g.html), lang + ': Google alone has no email-summary step');
    for (const p of ['snapchat', 'meta']) {
      const s = activationMail({ ...base, lang, platforms: [p] } as any);
      assertMatch(s.html, lang === 'en' ? /Once your Meta or Snapchat account is connected/ : /بعد ربط حساب Meta أو Snapchat/, lang + ' ' + p + ': the email-summary step');
    }
  }
  const admin = await adminMail({ ...base, lang: 'ar', platforms: ['meta', 'google'], fb_profile: 'https://facebook.com/x' } as any, false);
  assert(!/Test users|auth\/audience/.test(admin.html + admin.text), 'the owner is not asked to add test users');
  assertMatch(admin.html, /لا يحتاج إضافة/);
  assertMatch(admin.html, /Tester/, 'Meta still needs the tester invitation');
});

// ---------- المحرك الحقيقي في المُشغّل — التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦ (١١٦). في آخر الملف عشان بيتقيّم في النطاق العام بعد كل الاختبارات اللي
// بتستخدم محرك وهمي ----------
// المُشغّل بيحمّل ملفات المحرك من GitHub (ENGINE_COMMIT) ويقيّمها، وبيتأكد بنفسه من ٩ أسماء بس — وهو بيستخدم أكتر (last7Days وLIVE_STATUSES
// وDX.pegRate وsettingsForAccount…): اسم يختفي من المحرك كان بيوقّع المُشغّل في الإنتاج من غير ما أي اختبار يكشفه. هنا الملفات الحالية من
// المستودع، وكل g.* في runner.ts نفسه — فدالة المُشغّل محتاجها لو اتشالت، الاختبار بيقع قبل ما ENGINE_COMMIT يتنقل لها
async function repoText(path: string): Promise<string> {
  const D = (globalThis as any).Deno;
  // Deno (CI): من القرص (--allow-read=Live/js,supabase/functions/sync). المتصفح (الاختبارات المحلية، من غير Deno): من الخادم المحلي
  if (D && typeof D.readTextFile === 'function') return await D.readTextFile(new URL('../../../' + path, import.meta.url));
  return await (await realFetch(path.indexOf('Live/') === 0 ? '/' + path.slice(5) : '/__repo/' + path)).text();
}
// في المتصفح الصفحة حقيقية: meta.js بيحقن مكتبة فيسبوك أول ما يتقيّم لو مفيش عنصر «facebook-jssdk» (والمكتبة الحقيقية كانت هتبعت طلبات Graph
// حقيقية)، والتخزين تخزين صفحة الاختبارات — فبنحط العنصر وتخزين في الذاكرة. Deno مفيهوش document، والمُشغّل بيعمل بدائله هو
function browserGuards(): void {
  const W = globalThis as any;
  // DOM حقيقي بس: في Deno بعد تحميل المحرك المُشغّل نفسه معرّف document بديل (installShims) من غير appendChild — اختبار بينادي الدالة بعد
  // التحميل كان بيقع في Deno بس (CI على 7665886)، والمتصفح فيه DOM حقيقي فمكانش بيبان محلياً
  if (!W.document || typeof W.document.createElement !== 'function' || !W.document.body || typeof W.document.body.appendChild !== 'function') return;
  if (!W.document.getElementById('facebook-jssdk')) { const el = W.document.createElement('i'); el.id = 'facebook-jssdk'; W.document.body.appendChild(el); }
  for (const k of ['localStorage', 'sessionStorage']) {
    const m = new Map<string, string>();
    const store = { getItem: (x: string) => (m.has(x) ? m.get(x) : null), setItem: (x: string, v: unknown) => { m.set(x, String(v)); }, removeItem: (x: string) => { m.delete(x); }, clear: () => m.clear() };
    try { Object.defineProperty(W, k, { configurable: true, writable: true, value: store }); } catch (_) { /* المتصفح رفض: يفضل الأصلي */ }
  }
}
Deno.test('المحرك الحقيقي: المُشغّل بيقيّمه، وكل اسم بيستخدمه منه موجود، وبيعرف الملف اللي نسخته على الموقع أحدث (من غير فرق نهايات السطور)', async () => {
  const FILES = ['i18n.js', 'alerts.js', 'core.js', 'diagnosis.js', 'meta.js', 'snapchat.js'], texts: Record<string, string> = {}, asked: string[] = [];
  for (const f of FILES) texts[f] = await repoText('Live/js/' + f);
  const runnerSrc = await repoText('supabase/functions/sync/runner.ts');
  stubFetch((url) => {
    const f = url.split('/').pop() as string;
    if (url.indexOf('https://raw.githubusercontent.com/Wely-Elazab/Ads-Control-Center/') === 0 && texts[f]) { asked.push('raw:' + f); return new Response(texts[f], { status: 200 }); }
    if (url.indexOf('https://adscenter.online/js/') === 0 && texts[f]) {
      asked.push('site:' + f);
      return new Response(f === 'alerts.js' ? texts[f] + '\n// newer on the site' : texts[f].replace(/\r?\n/g, '\r\n'), { status: 200 });
    }
    return json({ message: 'unexpected ' + url }, 500);
  });
  browserGuards();
  try {
    assertEquals(await loadEngine(), ['alerts.js'], 'only the file that really differs — not the one with other line endings');
    assertEquals([asked.filter((a) => a.indexOf('raw:') === 0).length, asked.filter((a) => a.indexOf('site:') === 0).length], [6, 6], 'six files from the pinned commit, six compared');
    // كل g.* في runner.ts (والمستوى التاني زي g.DX.pegRate) موجود بعد التحميل — إلا اللي المُشغّل بيعرّفه بنفسه
    const G = globalThis as any;
    const own = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'location', 'history', 'FB']);
    for (const m of runnerSrc.matchAll(/\bg\.(\w+)\s*=(?!=)/g)) own.add(m[1]);
    const missing: string[] = [], seen = new Set<string>();
    for (const m of runnerSrc.matchAll(/\bg\.(\w+)(?:\.(\w+))?/g)) {
      const key = m[1] + (m[2] ? '.' + m[2] : '');
      if (own.has(m[1]) || seen.has(key)) continue;
      seen.add(key);
      if (G[m[1]] === undefined || G[m[1]] === null) missing.push(m[1]);
      else if (m[2] && (G[m[1]] as any)[m[2]] === undefined) missing.push(key);
    }
    assert(seen.size > 20, 'the runner uses many engine names: ' + seen.size);
    assertEquals(missing, [], 'every engine name the runner uses exists');
  } finally { restoreFetch(); }
});
// قرار العاجل بالمحرك الحقيقي (urgentAlerts ← analyzeUrgent — بعد الاختبار اللي فوق اللي حمّل المحرك): المُشغّل بيدّي المحرك إعدادات المستخدم
// (أقصى التكلفة والعائد المستهدف) وبيبعت «عاجل» بس. القاعدة الحاكمة للبريد العاجل (قرار صاحب المنتج ٢٥ أكتوبر): عاجل بس لو المستخدم كاتب
// أقصى تكلفة والإعلان صرف ضعفها من غير نتيجة ٣ أيام؛ من غيرها «مهم» — ميتبعتش، بس بيقول إن المشكلة لسه قائمة (alive). نفس حالة اختبار المحرك
// في الأداة («صرف بدون نتائج ٣ أيام»)، بس هنا من الطريق اللي المُشغّل بيمشيه
Deno.test('قرار العاجل بالمحرك الحقيقي: «عاجل» بس بأقصى التكلفة اللي المستخدم كتبها، ومن غيرها «مهم» قائم من غير رسالة', () => {
  const G = globalThis as any;
  const keys = G.last7Days(G.todayKeyInTz('UTC')).slice(-7).map((d: any) => d.key);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  // إعلان بنفس الشكل اللي ملفات المنصات بتبنيه (زي ad() في اختبارات الأداة)
  const ad = (id: string, daily: number[], res: number[]) => {
    const spend = sum(daily), r = sum(res);
    return { id, nativeId: id, platform: 'Meta', source: 'meta:act_1', placement: 'Camp', campaignId: 'c1', campaignName: 'Camp', adsetName: 'Set', offer: 'Ad ' + id,
      headline: 'H', desc: '', caption: 'C', format: 'image', themeClass: 'pv-t1', thumbUrl: null, landing: 'https://example.com', landingKind: 'website', active: true,
      pausedLevel: null, daily, dailyResults: res, dailySales: [0, 0, 0, 0, 0, 0, 0], dailyDates: keys, spend, results: r, resultKey: 'purchase', cpr: r ? spend / r : null,
      roas: null, frequency: null, daysAgo: 30, updatedDaysAgo: 5, currency: 'SAR', reviewStatus: null, deliveryReason: null, platformStatus: 'ACTIVE', period: null,
      adsetId: null, statusPartial: false, plat: null, baseStore: false, setLearns: true };
  };
  const n = (v: number) => [v, v, v, v, v, v, v];
  const cands = [ad('good1', n(100), n(5)), ad('good2', n(100), n(5)), ad('waste', [100, 100, 100, 100, 100, 100, 20], [5, 5, 5, 0, 0, 0, 0])];
  const acct = { id: 'act_1', name: 'A', currency: 'SAR', timezone_name: 'UTC', account_status: 1, spend_cap: '0', amount_spent: '0' };
  const fam = familyOf('waste');
  // أقصى تكلفة ٢٠ للطلب، والإعلان صرف ٣٢٠ من غير طلب ٣ أيام: عاجل — وهو اللي بيروح لقرار الإرسال
  const withMax = urgentAlerts('act_1', acct, cands, null, { maxCost: { purchase: 20 } });
  assertEquals(withMax.urgent.map((a: any) => [a.adId, a.code, a.level]), [['waste', 'waste', 'critical']], 'urgent with the written max cost');
  // من غير أقصى تكلفة: «مهم» — مفيش عاجل (مفيش رسالة)، بس لسه قائم (alive) فقرار «حُلّت» ميتقفلش عليه
  const noMax = urgentAlerts('act_1', acct, cands, null, null);
  assertEquals(noMax.urgent, [], 'no written max cost: nothing urgent');
  assert(noMax.alive[fam + '|waste'], 'but still ongoing as «important»: ' + JSON.stringify(Object.keys(noMax.alive)));
  // أقصى تكلفة لنوع نتيجة تاني (العملاء المحتملين) مبتخلّيش إعلان الشراء عاجل: الحد بنوعه
  assertEquals(urgentAlerts('act_1', acct, cands, null, { maxCost: { lead: 20 } }).urgent, [], 'a max cost for another result type');
});
// موعد الملخص والشهري (summaryDue / monthlyDue) — الوعد اللي العميل اختاره: الملخص في أيامه بعد ساعته بتوقيت حسابه (مش UTC)، ومرة واحدة
// للفترة، والشهري أول أحد في الشهر للشهر اللي فات كله مرة واحدة. الساعة متثبّتة (localParts بتقرا new Date())
function fixedClock(iso: string): () => void {
  const Real = Date, at = Real.parse(iso);
  class Fixed extends Real {
    constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(at); }
    static now() { return at; }
  }
  (globalThis as any).Date = Fixed;
  return () => { (globalThis as any).Date = Real; };
}
Deno.test('موعد الملخص: في أيامه بعد ساعته بتوقيت الحساب، ومرة للفترة؛ والشهري أول أحد في الشهر للشهر اللي فات مرة واحدة', () => {
  const s = (o: Record<string, unknown>) => ({ timezone: 'Asia/Riyadh', summary_days: [0, 3], summary_hour: 9, last_summary_until: '2026-11-21', last_monthly: '2026-10', ...o }) as any;
  const at = (iso: string, fn: () => unknown) => { const undo = fixedClock(iso); try { return fn(); } finally { undo(); } };
  // الأربعاء ٢٥ نوفمبر: ٨:٥٩ الصبح بتوقيت الرياض لسه، و٩:٠٠ ميعاده — من بعد آخر ملخص (السبت ٢١) لحد أمس
  assertEquals(at('2026-11-25T05:59:00Z', () => summaryDue(s({}))), null, 'before its hour');
  assertEquals(at('2026-11-25T06:00:00Z', () => summaryDue(s({}))), { since: '2026-11-22', until: '2026-11-24' });
  assertEquals(at('2026-11-25T06:00:00Z', () => summaryDue(s({ last_summary_until: '2026-11-24' }))), null, 'once: already covered yesterday');
  assertEquals(at('2026-11-24T06:00:00Z', () => summaryDue(s({}))), null, 'Tuesday is not one of its days');
  // اليوم بتوقيت الحساب: ٢١:٣٠ الثلاثاء UTC = ٠٠:٣٠ الأربعاء في الرياض
  assertEquals(at('2026-11-24T21:30:00Z', () => summaryDue(s({ summary_hour: 0 }))), { since: '2026-11-22', until: '2026-11-24' }, 'the account\'s day, not UTC');
  assertEquals(at('2026-11-25T05:59:00Z', () => summaryDue(s({ summary_hour: null }))), null, 'no hour saved: 9 by default');
  // الشهري: الأحد ٦ ديسمبر أول أحد — للشهر اللي فات كله، مرة واحدة، وبعد الساعة
  assertEquals(at('2026-12-06T06:00:00Z', () => monthlyDue(s({}))), { since: '2026-11-01', until: '2026-11-30', month: '2026-11' });
  assertEquals(at('2026-12-06T06:00:00Z', () => monthlyDue(s({ last_monthly: '2026-11' }))), null, 'once a month');
  assertEquals(at('2026-12-06T05:00:00Z', () => monthlyDue(s({}))), null, 'before its hour');
  assertEquals(at('2026-12-13T06:00:00Z', () => monthlyDue(s({}))), null, 'not the first Sunday');
  assertEquals(at('2026-12-02T06:00:00Z', () => monthlyDue(s({}))), null, 'not a Sunday');
});
// (١١٨) عدد التنبيهات مع المعدود في البريد — بالمحرك الحقيقي (g.ar بالأرقام العربية). والقسم «التنبيهات العاجلة منذ الملخص السابق» في الملخص:
// المستمر كله بيظهر، والمحلول لحد ٨ والباقي سطر بعدده بالفعل قدّام، واسم الإعلان (من Meta — المعلن بيكتبه) مُهرَّب
Deno.test('عدد التنبيهات في البريد بالعدد والمعدود الصح، وقسم حالة التنبيهات في الملخص مُهرَّب وبالسطر الأخير صح', () => {
  assertEquals([1, 2, 3, 10, 11, 25].map(alertsCountAr), ['تنبيه آخر', 'تنبيهان آخران', '٣ تنبيهات أخرى', '١٠ تنبيهات أخرى', '١١ تنبيهاً آخر', '٢٥ تنبيهاً آخر']);
  const fam = familyOf('cpr'), at = (d: number) => new Date(Date.UTC(2026, 10, d, 9)).toISOString();
  const mark = (obj: string, resolved: number | null, first = 18) => ({ kind: fam, object_id: obj, first_at: at(first), last_sent_at: at(first), last_seen_at: at(first), times_sent: 1,
    resolved_at: resolved == null ? null : at(resolved), last_code: 'cpr' });
  const cands = [{ id: 'X', offer: '<img src=x onerror="alert(1)">إعلان', resultKey: 'purchase', campaignId: 'c1', campaignName: 'C' }];
  const html = (n: number) => {
    const marks: Record<string, any> = { [fam + '|X']: mark('X', null) };
    for (let i = 0; i < n + 7; i++) marks[fam + '|r' + i] = mark('r' + i, 20 + (i % 3));
    return alertStatusHtml(marks, cands, '2026-11-17', 'Asia/Riyadh', false) as string;
  };
  const h3 = html(3);
  assert(h3.indexOf('<img') < 0 && h3.indexOf('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;إعلان') > -1, 'the ad name is escaped: ' + h3.slice(0, 300));
  assert(h3.indexOf('مستمرة') > -1 && h3.indexOf('حُلّت') > -1, 'ongoing and resolved');
  for (const [n, line] of [[1, 'وحُلّ تنبيه آخر.'], [2, 'وحُلّ تنبيهان آخران.'], [3, 'وحُلّت ٣ تنبيهات أخرى.'], [11, 'وحُلّ ١١ تنبيهاً آخر.']] as [number, string][]) {
    assert(html(n).indexOf(line) > -1, n + ' more resolved: «' + line + '»');
  }
});

// ---------- المُشغّل كله من أوله لآخره (runAll — طور الفحص، التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦، ١١٦) ----------
// قاعدة بيانات وهمية بفلاتر PostgREST اللي المُشغّل بيستخدمها (eq/neq/is/in، وon_conflict للإدخال)، ودوال rpc، وردود Graph وهمية لحساب Meta
// واحد، والمحرك الحقيقي (اتحمّل في اختبار العقد فوق — ولو الاختبار ده اتشغّل لوحده بيتحمّل هنا من الملفات نفسها). أي طلب مش متوقع = خطأ
type Row = Record<string, any>;
function fakeRest(tables: Record<string, Row[]>, rpcs: Record<string, (args: any) => unknown>, seen: string[]) {
  const one = (row: Row, k: string, v: string): boolean => {
    const cell = row[k] == null ? null : String(row[k]);
    if (v.indexOf('eq.') === 0) return cell === decodeURIComponent(v.slice(3));
    if (v.indexOf('neq.') === 0) return cell !== decodeURIComponent(v.slice(4));
    if (v.indexOf('lt.') === 0) return cell != null && cell < decodeURIComponent(v.slice(3));
    if (v === 'is.null') return cell == null;
    if (v === 'is.true') return row[k] === true;
    if (v.indexOf('in.(') === 0) return decodeURIComponent(v.slice(4, -1)).split(',').indexOf(String(cell)) > -1;
    throw new Error('fake db: filter ' + k + '=' + v);
  };
  // or=(a.op.v,b.op.v) — القيمة ممكن تبقى بين علامتين، وفيها نقط (فترة الملخص «..») ونقطتين (الوقت)
  const any = (row: Row, v: string) => decodeURIComponent(v).replace(/^\(|\)$/g, '').split(',').some((part) => {
    const m = /^(\w+)\.(eq|neq|lt|is)\.(.*)$/.exec(part);
    if (!m) throw new Error('fake db: or ' + part);
    return one(row, m[1], m[2] + '.' + m[3].replace(/^"(.*)"$/, '$1'));
  });
  const match = (row: Row, filters: [string, string][]) => filters.every(([k, v]) => (k === 'or' ? any(row, v) : one(row, k, v)));
  return (url: string, init?: RequestInit): Response => {
    const method = (init && init.method) || 'GET', [path, query] = url.slice(url.indexOf('/rest/v1/') + 9).split('?');
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    const prefer = String((((init && init.headers) || {}) as Record<string, string>).prefer || '');
    seen.push(method + ' ' + path);
    if (path.indexOf('rpc/') === 0) {
      const fn = rpcs[path.slice(4)];
      if (!fn) throw new Error('fake db: rpc ' + path);
      return json(fn(body) ?? null);
    }
    if (!tables[path]) throw new Error('fake db: table ' + path);
    const params = (query || '').split('&').filter(Boolean).map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)] as [string, string]);
    const conflict = params.find(([k]) => k === 'on_conflict');
    const hit = tables[path].filter((r) => match(r, params.filter(([k]) => ['select', 'order', 'limit', 'on_conflict'].indexOf(k) < 0)));
    if (method === 'GET') return json(hit.map((r) => ({ ...r })));
    if (method === 'PATCH') {
      hit.forEach((r) => Object.assign(r, body));
      return prefer.indexOf('return=representation') > -1 ? json(hit) : new Response(null, { status: 204 });
    }
    if (method === 'DELETE') { tables[path] = tables[path].filter((r) => hit.indexOf(r) < 0); return json(hit); }
    if (method === 'POST') {
      const keys = conflict ? decodeURIComponent(conflict[1]).split(',') : null;
      (Array.isArray(body) ? body : [body]).forEach((nr: Row) => {
        const old = keys ? tables[path].find((r) => keys.every((k) => String(r[k]) === String(nr[k]))) : null;
        if (old) Object.assign(old, nr); else tables[path].push({ ...nr });
      });
      return new Response(null, { status: 201 });
    }
    throw new Error('fake db: ' + method + ' ' + path);
  };
}
// ملفات المحرك من المستودع (لو المحرك لسه متحمّلش في التشغيل ده)
async function engineFiles(): Promise<(url: string) => Response | null> {
  const texts: Record<string, string> = {};
  for (const f of ['i18n.js', 'alerts.js', 'core.js', 'diagnosis.js', 'meta.js', 'snapchat.js']) texts[f] = await repoText('Live/js/' + f);
  return (url: string) => {
    const f = url.split('/').pop() as string;
    return (url.indexOf('https://raw.githubusercontent.com/') === 0 || url.indexOf('https://adscenter.online/js/') === 0) && texts[f] ? new Response(texts[f], { status: 200 }) : null;
  };
}
const RUN_U = '22222222-3333-4444-5555-666666666666', RUN_TOKEN = 'EAA-runner-test-token', RUN_NOW = '2026-11-18T07:05:00.000Z';
// آخر ٧ أيام بتوقيت الرياض والساعة متثبّتة على RUN_NOW (الأربعاء ١٨ نوفمبر ١٠:٠٥) — آخرهم النهارده
const RUN_KEYS = [12, 13, 14, 15, 16, 17, 18].map((d) => '2026-11-' + d);
// نفس الحالة اللي في اختبار قرار العاجل فوق، بس من ردود Graph نفسها: إعلانين كويسين، وإعلان صرف ٣٢٠ من غير طلب ٣ أيام
function metaRunData() {
  const ad = (id: string) => ({ id, name: 'Ad ' + id, effective_status: 'ACTIVE', created_time: '2026-09-01T00:00:00+0000', adset_id: 's1', campaign_id: 'c1',
    adset: { id: 's1', name: 'Set', optimization_goal: 'OFFSITE_CONVERSIONS' }, campaign: { id: 'c1', name: 'Camp' },
    creative: { title: 'T ' + id, body: 'B', object_story_spec: { link_data: { link: 'https://shop.example/p-' + id } } } });
  const days = (id: string, spend: number[], buys: number[]) => RUN_KEYS.map((k, i) => ({ ad_id: id, date_start: k, spend: String(spend[i]),
    actions: buys[i] ? [{ action_type: 'omni_purchase', value: String(buys[i]) }] : [],
    action_values: buys[i] ? [{ action_type: 'omni_purchase', value: String(buys[i] * 60) }] : [] }));
  const n = (v: number) => [v, v, v, v, v, v, v];
  return {
    ads: [ad('good1'), ad('good2'), ad('waste')],
    daily: [...days('good1', n(100), n(5)), ...days('good2', n(100), n(5)), ...days('waste', [100, 100, 100, 100, 100, 100, 20], [5, 5, 5, 0, 0, 0, 0])],
    // أرقام فترة الملخص صف لكل إعلان (سطر «التكلفة مقابل الحد» — costLine)
    period: [{ ad_id: 'good1', spend: '700', actions: [{ action_type: 'omni_purchase', value: '35' }], action_values: [{ action_type: 'omni_purchase', value: '2100' }] },
      { ad_id: 'good2', spend: '700', actions: [{ action_type: 'omni_purchase', value: '35' }], action_values: [{ action_type: 'omni_purchase', value: '2100' }] },
      { ad_id: 'waste', spend: '320', actions: [], action_values: [] }]
  };
}
// Graph لحساب Meta واحد: الحساب، والإعلانات، وأرقامها يوم بيوم — وأي قايمة أو أرقام تانية فاضية. ctl.account = رد مختلف للحساب نفسه
// ctl.activities = سجل التعديلات، ctl.objDaily = أرقام الحملات يوم بيوم (حصة التعديل من الإنفاق)، ctl.siteFail = طلب أرقام الموقع بيفشل
function fakeMeta(data: { ads: Row[]; daily: Row[]; period?: Row[] }, seen: string[],
  ctl: { account?: () => Response; activities?: Row[]; objDaily?: Row[]; siteFail?: boolean }) {
  return (url: string): Response | null => {
    if (url.indexOf('https://graph.facebook.com/') !== 0) return null;
    const u = new URL(url), p = u.pathname.replace(/^\/v[\d.]+/, ''), q = u.searchParams;
    seen.push('graph ' + p + ' token=' + (q.get('access_token') === RUN_TOKEN));
    if (p === '/act_1') {
      return ctl.account ? ctl.account() : json({ id: 'act_1', name: 'Store One', account_status: 1, timezone_name: 'Asia/Riyadh', currency: 'SAR', spend_cap: '0', amount_spent: '0' });
    }
    if (p === '/act_1/ads') return json({ data: data.ads });
    if (p === '/act_1/insights' && q.get('level') === 'ad' && !q.get('time_increment') && String(q.get('fields')).indexOf('ad_id,spend,') === 0) {
      return json({ data: data.period || [] });
    }
    if (p === '/act_1/activities' && ctl.activities) return json({ data: ctl.activities });
    if (p === '/act_1/insights' && q.get('level') === 'campaign' && q.get('time_increment') === '1' && ctl.objDaily) {
      const tr = JSON.parse(q.get('time_range') || '{}');   // الأيام اللي اتطلبت بس — زي Graph
      return json({ data: ctl.objDaily.filter((r) => r.date_start >= tr.since && r.date_start <= tr.until) });
    }
    if (p === '/act_1/insights' && ctl.siteFail && !q.get('level') && String(q.get('fields')).indexOf('date_start,inline_link_clicks') === 0) {
      return json({ error: { message: 'Please reduce the amount of data', code: 1 } }, 500);
    }
    if (p === '/act_1/insights' && q.get('level') === 'ad' && q.get('time_increment') === '1' && String(q.get('fields')).indexOf('ad_id,date_start') === 0) {
      return json({ data: data.daily });
    }
    if (p === '/act_1/adsets' || p === '/act_1/insights' || p === '/act_1/activities') return json({ data: [] });
    return json({ error: { message: 'unexpected graph ' + p, code: 100 } }, 400);
  };
}
function runState() {
  return {
    user_digests: [{ user_id: RUN_U, email: 'owner@store.example', lang: 'ar', timezone: 'Asia/Riyadh', summary_days: [0], summary_hour: 9, last_summary_until: '2026-11-14',
      last_monthly: '2026-10', summary_pending: null, summary_pending_at: null, monthly_pending: null, monthly_pending_at: null, sending_until: null, enabled: true }] as Row[],
    user_digest_accounts: [{ user_id: RUN_U, platform: 'meta', account_id: 'act_1', name: null, checked_at: '2026-11-18T06:00:00.000Z', claimed_until: null,
      need_summary: null, need_monthly: null, edits_at: null, retry_after: null }] as Row[],
    user_settings: [{ user_id: RUN_U, settings: { acct: { 'meta:act_1': { maxCost: { purchase: 20 } } } } }] as Row[],
    user_alert_marks: [] as Row[], digest_outbox: [] as Row[], send_log: [] as Row[], ad_accounts: [{ platform: 'meta', account_id: 'act_1', name: 'Store One' }] as Row[],
    feedback: [] as Row[]
  };
}
// كل اللي الاختبار محتاجه: الحالة، والطلبات اللي اتبعتت، والرسائل، وروابط الهبوط اللي اتفحصت، وأخطاء السجل. ctl = رد Meta للحساب والمفتاح
// المحفوظ (ok / none = مفيش / garbage = مبيتفكّش). claim(urgent, need) = الحجز الجاي: فحص عاجل (بالنهار) أو قسم ملخص بس
async function runWorld() {
  const st = runState(), seen: string[] = [], mails: any[] = [], probes: string[] = [], vaultErrors: string[] = [], errs: string[] = [], claims: Row[] = [];
  const ctl: { account?: () => Response; vault: 'ok' | 'none' | 'garbage'; autoClaim?: boolean; activities?: Row[]; objDaily?: Row[]; siteFail?: boolean;
    broken?: string[] } = { vault: 'ok' };
  let autoClaims = 0;
  const sealed = await seal(RUN_TOKEN, 'act_1'), eng = await engineFiles();
  const rest = fakeRest(st, {
    digest_claim: () => {
      const a = claims.shift();
      if (a) return [a];
      // ctl.autoClaim: حجز قسم الملخص زي digest_claim الحقيقية — حساب محتاج قسمه، مش محجوز، ومش مستني بعد عطل (من غير فحص عاجل)
      // حد ٨ حجزات: الساعة متثبّتة فحد التشغيل (٩٠ ثانية) مبيخلصش أبداً — حساب بيرجع يتحجز على طول (عيب) يفشّل الاختبار بدل ما يعلّقه
      if (!ctl.autoClaim || ++autoClaims > 8) return [];
      const now = new Date().toISOString(), r = st.user_digest_accounts.find((x) => (x.need_summary || x.need_monthly) &&
        (!x.claimed_until || x.claimed_until < now) && (!x.retry_after || x.retry_after < now));
      if (!r) return [];
      r.claimed_until = new Date(Date.now() + 180000).toISOString();
      return [{ ...r, urgent_due: false }];
    },
    vault_user_get: (x) => {
      if (ctl.vault === 'none' || x.p_user !== RUN_U || x.p_account !== 'act_1') return [];
      return [{ ciphertext: ctl.vault === 'garbage' ? 'AAAA' : sealed.ct, iv: ctl.vault === 'garbage' ? 'BBBB' : sealed.iv, expires_at: '2027-01-15T00:00:00Z' }];
    },
    vault_user_mark_error: (x) => { vaultErrors.push(x.p_error); return null; },
    beat: () => null
  }, seen);
  const meta = fakeMeta(metaRunData(), seen, ctl);
  Deno.env.set('RESEND_API_KEY', 'test-resend-key');
  stubFetch((url, init) => {
    if (url.indexOf('/rest/v1/') > -1) return rest(url, init);
    if (url.indexOf('https://api.resend.com/') === 0) { mails.push(JSON.parse(String(init && init.body))); return json({ id: 'mail-' + mails.length }); }
    if (url.indexOf('https://shop.example/') === 0) {
      probes.push(url);
      return (ctl.broken || []).indexOf(url) > -1 ? new Response('gone', { status: 404 }) : new Response('ok', { status: 200 });
    }
    return meta(url) || eng(url) || json({ message: 'unexpected ' + url }, 500);
  });
  browserGuards();
  // الحجز زي digest_claim الحقيقية: الصف نفسه بيتحجز (claimed_until ٣ دقايق)، والمُشغّل لازم يفكّه في الآخر
  const claim = (urgent = true, need: string | null = null) => {
    Object.assign(st.user_digest_accounts[0], { claimed_until: new Date(Date.now() + 180000).toISOString() }, need ? { need_summary: need } : {});
    claims.push({ ...st.user_digest_accounts[0], urgent_due: urgent });
  };
  return { st, seen, mails, probes, vaultErrors, errs, ctl, claim };
}
// الساعة متثبّتة، والسجل بيتجمع (الأخطاء بتطلع في رسالة الفشل)، وكل حاجة بترجع زي ما كانت. at() = الساعة دلوقتي في الاختبار
async function withRunWorld(fn: (w: Awaited<ReturnType<typeof runWorld>>) => Promise<void>) {
  const undo = fixedClock(RUN_NOW), realErr = console.error;
  const w = await runWorld();
  console.error = (...a: unknown[]) => { w.errs.push(a.map(String).join(' ')); };
  try { await fn(w); } finally { console.error = realErr; restoreFetch(); undo(); }
}
Deno.test('المُشغّل كله (runAll) لحساب Meta: إعلان صرف ضعف أقصى التكلفة من غير طلبات — بيتحط في الطابور، والتشغيل الجاي بيبعته مرة واحدة، وبعدها «قائم» من غير رسالة', async () => {
  await withRunWorld(async (w) => {
    // ١) الفحص: الإعلان المهدر عاجل (أقصى تكلفة ٢٠ للطلب)، وبيتحط في الطابور — مفيش رسالة في نفس التشغيل (الإرسال من الطابور أول كل تشغيل)
    w.claim();
    const r1 = await runAll('runner-key');
    assertEquals([r1.users, r1.claimed, r1.outcomes, r1.sent], [1, 1, { 'meta:ok': 1 }, {}], 'run 1 — log: ' + w.errs.join(' | '));
    assertEquals(w.mails.length, 0, 'nothing sent in the same run');
    const q1 = w.st.digest_outbox.filter((r) => r.kind === 'urgent' && r.period === '');
    assertEquals(q1.length, 1, 'one urgent section waiting: ' + JSON.stringify(w.st.digest_outbox).slice(0, 400));
    assertEquals(q1[0].payload.fresh.map((a: any) => [a.adId, a.code]), [['waste', 'waste']], 'the wasting ad, urgent');
    assertEquals(q1[0].marks.map((m: any) => [m.kind, m.object_id, m.times_sent]), [[familyOf('waste'), 'waste', 1]], 'its mark waits for the mail');
    assertEquals(w.st.user_alert_marks, [], 'no mark saved before the mail goes out');
    const a1 = w.st.user_digest_accounts[0];
    assertEquals([a1.claimed_until, a1.retry_after, a1.checked_at, a1.edits_at], [null, null, RUN_NOW, RUN_NOW], 'claim released, checked now, edit log read now');
    const graphCalls = w.seen.filter((x) => x.indexOf('graph ') === 0);
    assert(graphCalls.length > 4 && graphCalls.every((x) => x.endsWith('token=true')), 'every Graph call with the stored token: ' + graphCalls.join(', '));
    assertEquals(w.probes.slice().sort(), ['https://shop.example/p-good1', 'https://shop.example/p-good2', 'https://shop.example/p-waste'], 'the landing pages are checked');
    assertEquals([w.vaultErrors, w.errs], [[], []]);

    // ٢) التشغيل الجاي: الرسالة مرة واحدة للمستخدم، والبصمة بعد الإرسال بس، والطابور فاضي
    const r2 = await runAll('runner-key');
    assertEquals([r2.claimed, r2.sent], [0, { 'urgent-sent': 1 }], 'run 2 — log: ' + w.errs.join(' | '));
    assertEquals(w.mails.length, 1);
    const m = w.mails[0];
    assertEquals(m.to, ['owner@store.example']);
    assert(String(m.html).indexOf('Ad waste') > -1 && String(m.html).indexOf('Store One') > -1, 'the ad and the account in the mail: ' + String(m.text).slice(0, 300));
    assert(String(m.headers && m.headers['List-Unsubscribe']).indexOf('https://adscenter.online/stop?u=' + RUN_U + '&s=') === 1, 'one-click stop header for this user');
    assertEquals(w.st.digest_outbox, [], 'the queue is empty after sending');
    assertEquals(w.st.user_alert_marks.map((x) => [x.user_id, x.platform, x.account_id, x.kind, x.object_id, x.times_sent, x.resolved_at]),
      [[RUN_U, 'meta', 'act_1', familyOf('waste'), 'waste', 1, null]], 'the mark is saved once the mail is out');
    assertEquals(w.st.send_log.map((x) => [x.type, x.status]), [['urgent', 'sent']]);

    // ٣) فحص تاني بعدها والمشكلة لسه قائمة: مش جديد ولا وقت التذكير (يومين) — بيتسجّل إنه لسه ظاهر، وصف «قائم» من غير رسالة لوحده
    w.claim();
    const r3 = await runAll('runner-key');
    assertEquals([r3.claimed, r3.outcomes, r3.sent], [1, { 'meta:ok': 1 }, {}], 'run 3 — log: ' + w.errs.join(' | '));
    assertEquals(w.st.digest_outbox.map((r) => [r.kind, r.period, (r.payload.ongoing || []).length]), [['urgent', 'ctx', 1]], 'ongoing context only');
    const r4 = await runAll('runner-key');
    assertEquals([r4.claimed, r4.sent, w.mails.length], [0, {}, 1], 'context alone is not a message');
    assertEquals(w.errs, []);
  });
});
// الوصول (lostAccess / accessMarks): رسالة «الوصول» على طول (مش من الطابور) مرة واحدة وتذكير واحد بعد يومين — وبالنهار بس. حجز الملخص ممكن
// يبقى بالليل، وكانت الرسالة بتطلع ساعتها (التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦، ١٢٠)
Deno.test('المُشغّل كله لحساب Meta — الوصول: عطل مؤقت = بعد ١٠ دقايق من غير رسالة؛ المفتاح اترفض = رسالة «الوصول» بالنهار بس، مرة وتذكير بعد يومين؛ ورجع = البصمة بتتقفل', async () => {
  await withRunWorld(async (w) => {
    const at = (iso: string) => { fixedClock(iso); };
    // ١) عطل مؤقت عند Meta: مفيش رسالة ولا بصمة ولا طابور، والحساب بيرجع بعد ١٠ دقايق — مش «الوصول ضاع»
    w.ctl.account = () => json({ error: { code: 2, message: 'Service temporarily unavailable' } }, 500);
    w.claim();
    const r1 = await runAll('runner-key');
    assertEquals([r1.outcomes, w.mails.length, w.st.user_alert_marks.length, w.st.digest_outbox.length, w.vaultErrors], [{ 'meta:meta-retry': 1 }, 0, 0, 0, []],
      'transient — log: ' + w.errs.join(' | '));
    const a = w.st.user_digest_accounts[0];
    assertEquals([a.claimed_until, a.retry_after, a.checked_at], [null, '2026-11-18T07:15:00.000Z', RUN_NOW], 'back in ten minutes');
    // ٢) Meta رفضت المفتاح (١٩٠) في حجز ملخص بالليل (٠٠:٣٥ بالرياض — مفيش فحص عاجل، ومش دقيقة تذكير الانضمام): السبب بيتسجّل، والقسم «لم نستطع قراءة الأرقام»، ومفيش رسالة
    w.ctl.account = () => json({ error: { code: 190, message: 'Error validating access token' } }, 400);
    at('2026-11-18T21:35:00.000Z');
    w.claim(false, '2026-11-15..2026-11-17');
    const r2 = await runAll('runner-key');
    assertEquals([r2.outcomes, w.vaultErrors, w.mails.length, w.st.user_alert_marks.length], [{ 'meta:lost': 1 }, ['meta rejected stored token'], 0, 0],
      'night: no mail — log: ' + w.errs.join(' | '));
    assertEquals(w.st.digest_outbox.map((r) => [r.kind, r.period, r.payload.missing]), [['summary', '2026-11-15..2026-11-17', true]], 'the summary says the numbers could not be read');
    assertEquals([w.st.user_digest_accounts[0].need_summary, w.st.user_digest_accounts[0].retry_after], [null, null]);
    // ٣) أول فحص عاجل الصبح (١٠:٠٥): رسالة «الوصول» على طول، وبصمتها
    at('2026-11-19T07:05:00.000Z');
    w.claim();
    const r3 = await runAll('runner-key');
    assertEquals([r3.outcomes, w.mails.length], [{ 'meta:lost': 1 }, 1], 'day: the access mail — log: ' + w.errs.join(' | '));
    assert(String(w.mails[0].html).indexOf('Store One') > -1, 'the account name in the mail: ' + String(w.mails[0].subject));
    assertEquals(w.mails[0].to, ['owner@store.example']);
    assertEquals(w.st.user_alert_marks.map((m) => [m.kind, m.object_id, m.times_sent, m.resolved_at]), [['connection', '', 1, null]]);
    // ٤) لسه مرفوض بعد ساعة: مفيش رسالة تانية؛ التذكير الوحيد بعد يومين بالظبط؛ وبعده مفيش
    at('2026-11-19T08:05:00.000Z'); w.claim(); await runAll('runner-key');
    assertEquals([w.mails.length, w.st.user_alert_marks[0].last_seen_at], [1, '2026-11-19T08:05:00.000Z'], 'no second mail within two days, still seen');
    at('2026-11-21T07:05:00.000Z'); w.claim(); await runAll('runner-key');
    assertEquals([w.mails.length, w.st.user_alert_marks[0].times_sent], [2, 2], 'one reminder after two days');
    at('2026-11-23T07:05:00.000Z'); w.claim(); await runAll('runner-key');
    assertEquals(w.mails.length, 2, 'and nothing after that');
    // ٥) الوصول رجع: بصمة «الوصول» بتتقفل والفحص بيكمّل عادي
    w.ctl.account = undefined;
    at('2026-11-23T08:05:00.000Z'); w.claim();
    const r5 = await runAll('runner-key');
    assertEquals(r5.outcomes, { 'meta:ok': 1 }, 'log: ' + w.errs.join(' | '));
    assertEquals(w.st.user_alert_marks.map((m) => [m.kind, m.resolved_at]), [['connection', '2026-11-23T08:05:00.000Z']], 'the access mark is closed');
    assertEquals([w.mails.length, w.errs], [2, []]);
  });
});
Deno.test('المُشغّل كله لحساب Meta — المفتاح المحفوظ: مبيتفكّش = عطل عندنا (مفيش رسالة للعميل ولا طلب لـ Meta)؛ مفيش مفتاح خالص = رسالة «الوصول»', async () => {
  await withRunWorld(async (w) => {
    w.ctl.vault = 'garbage';
    w.claim(true, '2026-11-15..2026-11-17');
    const r1 = await runAll('runner-key');
    assertEquals([r1.outcomes, w.vaultErrors, w.mails.length, w.st.user_alert_marks.length], [{ 'meta:decrypt-failed': 1 }, ['decrypt failed'], 0, 0],
      'log: ' + w.errs.join(' | '));
    assertEquals([w.st.user_digest_accounts[0].retry_after, w.st.user_digest_accounts[0].need_summary], [null, null], 'not a retry, and the summary does not wait for it');
    assertEquals(w.st.digest_outbox.map((r) => [r.kind, r.payload.missing]), [['summary', true]], 'its summary section says the numbers could not be read');
    w.st.digest_outbox = [];
    w.ctl.vault = 'none';
    w.claim();
    const r2 = await runAll('runner-key');
    assertEquals([r2.outcomes, w.mails.length, w.st.user_alert_marks.map((m) => m.kind)], [{ 'meta:lost': 1 }, 1, ['connection']], 'log: ' + w.errs.join(' | '));
    assertEquals(w.seen.filter((x) => x.indexOf('graph ') === 0), [], 'Meta is never asked without a usable key');
    assertEquals(w.errs, []);
  });
});
// Snapchat من طريق الـ Worker (Live/api/digest-fetch.js): النسخة المقفولة بتروح له ويرجّع { status, data, sealed } — النسخة الجديدة بتتقفل تاني
// بنفس الربط (sealedAad) وبتتحفظ مكان القديمة (vault_sealed_rotate)، والطلبات اللي بعدها بيها. ٤٠١ AUTH أو رد Snapchat ٤٠١/٤٠٣ = الوصول ضاع
const SNAP_SEALED_1 = 'snap-sealed-v1', SNAP_SEALED_2 = 'snap-sealed-v2';
// نفس حالة Meta: إعلانين كويسين، وإعلان صرف ٣٢٠ من غير طلب ٣ أيام — بشكل رد api/snapchat-ads-fetch.js (المبالغ بالمليون)
function snapRunPayload(extra: Row = {}) {
  const M = 1000000, n = (v: number) => [v, v, v, v, v, v, v];
  const row = (id: string, spend: number[], buys: number[]) => ({ id, timeseries: RUN_KEYS.map((k, i) => ({ start_time: k + 'T00:00:00.000+03:00',
    stats: { spend: spend[i] * M, swipes: 40, conversion_purchases: buys[i], conversion_purchases_value: buys[i] * 60 * M } })) });
  const ad = (id: string) => ({ ad: { id, name: 'Snap ' + id, status: 'ACTIVE', ad_squad_id: 'sq1', creative_id: 'cr-' + id, created_at: '2026-09-01T00:00:00.000Z' } });
  return {
    ads: [ad('sgood1'), ad('sgood2'), ad('swaste')],
    creatives: { 'cr-sgood1': { url: 'https://shop.example/s-sgood1' }, 'cr-sgood2': { url: 'https://shop.example/s-sgood2' }, 'cr-swaste': { url: 'https://shop.example/s-swaste' } },
    media: null,
    squads: [{ id: 'sq1', name: 'Squad', campaign_id: 'sc1', optimization_goal: 'PIXEL_PURCHASE', status: 'ACTIVE' }],
    campaigns: [{ id: 'sc1', name: 'Snap camp', status: 'ACTIVE' }],
    stats: { timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: [row('sgood1', n(100), n(5)), row('sgood2', n(100), n(5)),
      row('swaste', [100, 100, 100, 100, 100, 100, 20], [5, 5, 5, 0, 0, 0, 0])] } } }] },
    statsError: null, periodStats: null, storeStats: null, periodStoreStats: null, period: null,
    range: { since: '2026-11-11', until: '2026-11-18', timeZone: 'Asia/Riyadh' }, account: { timezone: 'Asia/Riyadh', currency: 'SAR' }, ...extra
  };
}
// رد الإعلانات لفترة الملخص: الإعلانين الكويسين ١٠٠ و٥ طلبات كل يوم، والمهدر ١٠٠ من غير طلبات — يوم بيوم زي الـ Worker الحقيقي
function snapPeriodPayload(since: string, until: string) {
  const M = 1000000, keys: string[] = [];
  for (let d = Date.parse(since + 'T00:00:00Z'); d <= Date.parse(until + 'T00:00:00Z'); d += 86400000) keys.push(new Date(d).toISOString().slice(0, 10));
  const row = (id: string, buys: number) => ({ id, timeseries: keys.map((k) => ({ start_time: k + 'T00:00:00.000+03:00',
    stats: { spend: 100 * M, swipes: 40, conversion_purchases: buys, conversion_purchases_value: buys * 60 * M } })) });
  return snapRunPayload({ periodStats: { timeseries_stats: [{ timeseries_stat: { breakdown_stats: { ad: [row('sgood1', 5), row('sgood2', 5), row('swaste', 0)] } } }] },
    period: { since, until, timeZone: 'Asia/Riyadh', isDefault: false } });
}
async function snapWorld() {
  const st = runState(), seen: string[] = [], mails: any[] = [], probes: string[] = [], vaultErrors: string[] = [], errs: string[] = [], claims: Row[] = [], rotations: Row[] = [];
  st.user_digest_accounts = [{ user_id: RUN_U, platform: 'snapchat', account_id: 'S1', name: 'Snap Store', checked_at: '2026-11-18T06:00:00.000Z', claimed_until: null,
    need_summary: null, need_monthly: null, edits_at: null, retry_after: null }];
  st.user_settings = [{ user_id: RUN_U, settings: { acct: { 'snapchat:S1': { maxCost: { purchase: 20 } } } } }];
  const ctl: { worker?: (body: any) => Response; expired?: boolean; payload: Row; periodShift?: 'since' | 'until' } = { payload: snapRunPayload() };
  const aad = sealedAad(RUN_U, 'snapchat', 'S1'), first = await seal(SNAP_SEALED_1, aad), eng = await engineFiles();
  // النسخة المحفوظة: vault_sealed_rotate بيبدّلها زي قاعدة البيانات الحقيقية، فالفحص الجاي بياخد الجديدة
  let stored = { ct: first.ct, iv: first.iv };
  const rest = fakeRest(st, {
    digest_claim: () => { const a = claims.shift(); return a ? [a] : []; },
    vault_sealed_get: (x) => (x.p_user === RUN_U && x.p_platform === 'snapchat' && x.p_account === 'S1'
      ? [{ ciphertext: stored.ct, iv: stored.iv, expires_at: ctl.expired ? '2026-11-17T00:00:00Z' : '2027-01-15T00:00:00Z' }] : []),
    vault_sealed_rotate: (x) => { rotations.push(x); stored = { ct: x.p_cipher, iv: x.p_iv }; return null; },
    vault_sealed_mark_error: (x) => { vaultErrors.push(x.p_error); return null; },
    beat: () => null
  }, seen);
  Deno.env.set('RESEND_API_KEY', 'test-resend-key');
  stubFetch((url, init) => {
    if (url.indexOf('/rest/v1/') > -1) return rest(url, init);
    if (url.indexOf('https://api.resend.com/') === 0) { mails.push(JSON.parse(String(init && init.body))); return json({ id: 'mail-' + mails.length }); }
    if (url.indexOf('https://shop.example/') === 0) { probes.push(url); return new Response('ok', { status: 200 }); }
    if (url === 'https://adscenter.online/api/digest-fetch') {
      const body = JSON.parse(String(init && init.body)), h = ((init && init.headers) || {}) as Record<string, string>;
      seen.push('worker ' + body.call.action + ' key=' + (h['x-runner-key'] === 'runner-key') + ' user=' + (body.user === RUN_U) + ' sealed=' + body.sealed);
      if (ctl.worker) return ctl.worker(body);
      // فترة الملخص (preset custom): زي api/snapchat-ads-fetch.js — أرقام الفترة يوم بيوم (timeseries_stats) ومعاها المدى (period)
      if (body.call.action === 'ads' && body.call.period && body.call.period.preset === 'custom') {
        const pp: Row = snapPeriodPayload(body.call.period.since, body.call.period.until);
        // ctl.periodShift: فترة غير اللي اتطلبت — من أولها أو من آخرها
        if (ctl.periodShift) pp.period = { ...pp.period, [ctl.periodShift]: ctl.periodShift === 'since' ? '2026-11-14' : '2026-11-22' };
        return json({ status: 200, data: pp, sealed: SNAP_SEALED_2 });
      }
      if (body.call.action === 'ads') return json({ status: 200, data: ctl.payload, sealed: SNAP_SEALED_2 });
      if (body.call.action === 'diagnosis') return json({ status: 200, data: { daily: [], dims: [], plat: null, numbers: null }, sealed: body.sealed });
      if (body.call.action === 'changes') return json({ status: 200, data: { changes: [], done: [] }, sealed: body.sealed });
      return json({ error: 'unexpected', code: 'SERVER' }, 500);
    }
    return eng(url) || json({ message: 'unexpected ' + url }, 500);
  });
  browserGuards();
  const claim = (urgent = true, need: string | null = null) => {
    Object.assign(st.user_digest_accounts[0], { claimed_until: new Date(Date.now() + 180000).toISOString() }, need ? { need_summary: need } : {});
    claims.push({ ...st.user_digest_accounts[0], urgent_due: urgent });
  };
  return { st, seen, mails, probes, vaultErrors, errs, rotations, aad, ctl, claim };
}
async function withSnapWorld(fn: (w: Awaited<ReturnType<typeof snapWorld>>) => Promise<void>) {
  const undo = fixedClock(RUN_NOW), realErr = console.error;
  const w = await snapWorld();
  console.error = (...a: unknown[]) => { w.errs.push(a.map(String).join(' ')); };
  try { await fn(w); } finally { console.error = realErr; restoreFetch(); undo(); }
}
Deno.test('المُشغّل كله لحساب Snapchat: من الـ Worker بالنسخة المقفولة، والنسخة الجديدة بتتقفل وتتحفظ وتتبعت بعدها؛ الإعلان المهدر بيتحط في الطابور ويتبعت', async () => {
  await withSnapWorld(async (w) => {
    w.claim();
    const r1 = await runAll('runner-key');
    assertEquals([r1.claimed, r1.outcomes, r1.sent], [1, { 'snapchat:ok': 1 }, {}], 'run 1 — log: ' + w.errs.join(' | '));
    const worker = w.seen.filter((x) => x.indexOf('worker ') === 0);
    assertEquals(worker, ['worker ads key=true user=true sealed=' + SNAP_SEALED_1, 'worker changes key=true user=true sealed=' + SNAP_SEALED_2],
      'the week first with the stored copy, then the edit log with the new one');
    assertEquals(w.rotations.length, 1, 'the new copy is saved once');
    assertEquals([w.rotations[0].p_user, w.rotations[0].p_platform, w.rotations[0].p_account], [RUN_U, 'snapchat', 'S1']);
    assertEquals(await unseal(w.rotations[0].p_cipher, w.rotations[0].p_iv, w.aad), SNAP_SEALED_2, 'sealed again for this user and account only');
    const q1 = w.st.digest_outbox.filter((r) => r.kind === 'urgent' && r.period === '');
    assertEquals(q1.map((r) => [r.platform, r.account_id]), [['snapchat', 'S1']]);
    assertEquals(q1[0].payload.fresh.map((a: any) => a.code), ['waste'], 'the wasting ad, urgent: ' + JSON.stringify(q1[0].payload.fresh).slice(0, 300));
    assertEquals(w.probes.slice().sort(), ['https://shop.example/s-sgood1', 'https://shop.example/s-sgood2', 'https://shop.example/s-swaste'], 'the landing pages are checked');
    const a1 = w.st.user_digest_accounts[0];
    assertEquals([a1.claimed_until, a1.retry_after, a1.checked_at], [null, null, RUN_NOW]);
    const r2 = await runAll('runner-key');
    assertEquals(r2.sent, { 'urgent-sent': 1 }, 'run 2 — log: ' + w.errs.join(' | '));
    assert(String(w.mails[0].html).indexOf('Snap swaste') > -1 && String(w.mails[0].html).indexOf('Snap Store') > -1, 'the ad and the account in the mail');
    assertEquals(w.st.user_alert_marks.map((m) => [m.platform, m.account_id, m.kind, m.times_sent]), [['snapchat', 'S1', familyOf('waste'), 1]]);
    assertEquals([w.vaultErrors, w.errs], [[], []]);
  });
});
Deno.test('المُشغّل كله لحساب Snapchat — الوصول: الـ Worker رفض (AUTH) أو Snapchat ردت ٤٠٣ = «الوصول»؛ عطل عند Snapchat أو أرقام الأسبوع فشلت = بعد ١٠ دقايق؛ النسخة انتهت = من غير الـ Worker', async () => {
  await withSnapWorld(async (w) => {
    const retryNow = async (label: string) => {
      w.claim();
      const r = await runAll('runner-key');
      assertEquals([r.outcomes, w.mails.length, w.st.user_digest_accounts[0].retry_after], [{ 'snapchat:snap-retry': 1 }, 0, '2026-11-18T07:15:00.000Z'],
        label + ' — log: ' + w.errs.join(' | '));
      w.st.user_digest_accounts[0].retry_after = null;
    };
    w.ctl.worker = () => json({ error: 'refresh failed', code: 'UPSTREAM' }, 502);
    await retryNow('upstream');
    w.ctl.worker = undefined;
    w.ctl.payload = snapRunPayload({ statsError: 'E1003', stats: null });
    await retryNow('stats failed');
    assertEquals(w.vaultErrors, [], 'a temporary failure is not a lost access');
    // Snapchat نفسها ردت ٤٠٣ على الحساب: الوصول اتشال
    w.ctl.worker = (b) => json({ status: 403, data: { request_status: 'ERROR' }, sealed: b.sealed });
    w.claim();
    const r3 = await runAll('runner-key');
    assertEquals([r3.outcomes, w.vaultErrors, w.mails.length], [{ 'snapchat:lost': 1 }, ['snapchat rejected stored access'], 1], '403 — log: ' + w.errs.join(' | '));
    assert(String(w.mails[0].html).indexOf('Snap Store') > -1, 'the access mail names the account');
    // الـ Worker رفض النسخة (AUTH): نفس الحالة، والرسالة مبتتكررش قبل يومين
    w.ctl.worker = () => json({ error: 'refresh rejected', code: 'AUTH' }, 401);
    w.claim();
    const r4 = await runAll('runner-key');
    assertEquals([r4.outcomes, w.vaultErrors.length, w.mails.length], [{ 'snapchat:lost': 1 }, 2, 1], 'AUTH — log: ' + w.errs.join(' | '));
    // النسخة عدّى عليها ٦٠ يوم من غير ما المستخدم يفتح الحساب: «الوصول» من غير ما نسأل الـ Worker أصلاً
    const before = w.seen.filter((x) => x.indexOf('worker ') === 0).length;
    w.ctl.expired = true;
    w.claim();
    const r5 = await runAll('runner-key');
    assertEquals([r5.outcomes, w.seen.filter((x) => x.indexOf('worker ') === 0).length], [{ 'snapchat:lost': 1 }, before], 'expired copy: the Worker is not asked');
    // الـ Worker جدّد الجلسة في فحص الأرقام اللي فشلت ورجّع نسخة جديدة: بتتحفظ برضه (القديمة ممكن تكون اتلغت عند Snapchat)، والفحوص اللي بعدها بيها
    assertEquals(w.rotations.length, 1, 'the renewed copy is kept even when the numbers failed');
    assertEquals(w.seen.filter((x) => x.indexOf('worker ') === 0).slice(-2).map((x) => x.slice(x.indexOf('sealed=') + 7)), [SNAP_SEALED_2, SNAP_SEALED_2],
      'the later checks send the saved new copy');
    assertEquals(w.errs, []);
  });
});
// ملخص Snapchat (snapSummary): التقرير من الـ Worker (diagnosis)، وسطر «التكلفة مقابل الحد الذي حددته» من إعلانات الفترة — الـ Worker بيرجّعها يوم
// بيوم (timeseries_stats) ومعاها المدى، والأداة بتدّي المدى للتحويل. المُشغّل مكانش بيدّيه، فأرقام الفترة كانت بتتقرا كأنها مجاميع وتطلع أصفار،
// والسطر مبيظهرش في أي ملخص Snapchat (التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦، ١٢٢)
Deno.test('المُشغّل كله لحساب Snapchat — الملخص: التقرير من الـ Worker، وسطر التكلفة مقابل الحد من أرقام الفترة يوم بيوم زي الأداة (١٢٢)', async () => {
  await withSnapWorld(async (w) => {
    fixedClock('2026-11-22T07:05:00.000Z');   // الأحد ١٠:٠٥ بالرياض — ميعاد الملخص للفترة ١٥–٢١
    w.st.user_digest_accounts[0].checked_at = '2026-11-22T06:50:00.000Z';
    w.claim(false, '2026-11-15..2026-11-21');
    const r1 = await runAll('runner-key');
    assertEquals([r1.claimed, r1.outcomes], [1, { 'snapchat:ok': 1 }], 'log: ' + w.errs.join(' | '));
    const sec = w.st.digest_outbox.filter((r) => r.kind === 'summary')[0];
    assert(sec && sec.payload.sum && sec.payload.sum.composed, 'the section: ' + JSON.stringify(w.st.digest_outbox).slice(0, 300));
    assertEquals(sec.payload.name, 'Snap Store');
    // ٢١٠٠ إنفاق و٧٠ طلب في الفترة = ٣٠ للطلب، والحد ٢٠
    const cost = sec.payload.sum.composed.costCmp;
    assert(typeof cost === 'string' && cost.indexOf('٣٠') > -1 && cost.indexOf('٢٠') > -1, 'cost per purchase 30 vs your limit 20: ' + JSON.stringify(cost));
    assertEquals(w.seen.filter((x) => x.indexOf('worker ') === 0).map((x) => x.split(' ')[1]), ['ads', 'diagnosis', 'ads'], 'the week, the report, the period');
    // الـ Worker رجّع فترة غير اللي اتطلبت: السطر مبيتكتبش من أرقام فترة تانية (زي الأداة «تعذّر تحميل الفترة»)، والملخص بيكمّل
    for (const shift of ['since', 'until'] as const) {
      w.ctl.periodShift = shift;
      w.claim(false, '2026-11-15..2026-11-21');
      const r2 = await runAll('runner-key');
      assertEquals(r2.outcomes, { 'snapchat:ok': 1 }, shift + ' — log: ' + w.errs.join(' | '));
      const again = w.st.digest_outbox.filter((r) => r.kind === 'summary')[0];
      assertEquals(again.payload.sum.composed.costCmp, null, 'no cost line from another period (' + shift + ')');
    }
    assertEquals(w.errs, []);
  });
});
// الملخص كله من المُشغّل (plan ← قسم كل حساب ← الإرسال من الطابور): ميعاده جه (الأحد ٩ الصبح بتوقيت المستخدم) → الفترة على المستخدم وعلى
// حساباته، والقسم بيتبني ويتحط في الطابور، والتشغيل الجاي بيبعت الرسالة مرة واحدة ويسجّل آخر يوم فيها
Deno.test('المُشغّل كله — الملخص: ميعاده جه = الفترة على المستخدم وحساباته، والقسم بيتبني ومعاه سطر التكلفة مقابل الحد، والرسالة مرة واحدة وآخر يوم بيتسجّل', async () => {
  await withRunWorld(async (w) => {
    fixedClock('2026-11-22T07:05:00.000Z');   // الأحد ١٠:٠٥ بالرياض: ميعاد الملخص، ومش أول أحد في الشهر (مفيش شهري)
    w.ctl.autoClaim = true;
    w.st.user_digest_accounts[0].checked_at = '2026-11-22T06:50:00.000Z';   // اتفحص من ربع ساعة: مفيش فحص عاجل
    const KEY = '2026-11-15..2026-11-21', u = w.st.user_digests[0];
    // قسم من فترة قديمة اتساب في الطابور (ملخص ماتبعتش): الفترة الجديدة بتغطي أيامه، فبيتمسح
    w.st.digest_outbox.push({ user_id: RUN_U, platform: 'meta', account_id: 'act_1', kind: 'summary', period: '2026-11-08..2026-11-14', payload: { name: 'old' }, marks: null,
      created_at: '2026-11-15T07:00:00.000Z' });
    const r1 = await runAll('runner-key');
    assertEquals([r1.claimed, r1.outcomes, r1.sent], [1, { 'meta:ok': 1 }, { 'summary-waiting': 1 }], 'run 1 — log: ' + w.errs.join(' | '));
    assertEquals([u.summary_pending, u.summary_pending_at], [KEY, '2026-11-22T07:05:00.000Z'], 'the period is on the user');
    assertEquals(w.st.digest_outbox.filter((r) => r.period === '2026-11-08..2026-11-14'), [], 'the old period section is dropped');
    const q = w.st.digest_outbox.filter((r) => r.kind === 'summary');
    assertEquals(q.map((r) => [r.platform, r.account_id, r.period]), [['meta', 'act_1', KEY]], 'one section for the period');
    const sec = q[0].payload;
    assertEquals(sec.name, 'Store One');
    assert(sec.sum && sec.sum.composed && typeof sec.sum.composed.title === 'string', 'the report itself: ' + JSON.stringify(sec.sum).slice(0, 300));
    assert(typeof sec.sum.composed.costCmp === 'string' && sec.sum.composed.costCmp.length > 0, 'the cost vs your limit line: ' + JSON.stringify(sec.sum.composed.costCmp));
    assertEquals([w.st.user_digest_accounts[0].need_summary, w.st.user_digest_accounts[0].retry_after], [null, null], 'the account does not wait any more');
    assertEquals(w.mails.length, 0, 'the mail goes out from the queue, next run');
    const r2 = await runAll('runner-key');
    assertEquals([r2.claimed, r2.sent], [0, { summary: 1 }], 'run 2 — log: ' + w.errs.join(' | '));
    assertEquals(w.mails.length, 1);
    assertEquals(w.mails[0].to, ['owner@store.example']);
    assert(String(w.mails[0].html).indexOf('Store One') > -1, 'the account in the summary mail: ' + String(w.mails[0].subject));
    assert(String(w.mails[0].headers && w.mails[0].headers['List-Unsubscribe']).indexOf('/stop?u=' + RUN_U + '&s=') > -1, 'one-click stop');
    assertEquals([u.summary_pending, u.summary_pending_at, u.last_summary_until, u.sending_until], [null, null, '2026-11-21', null], 'the period is closed as sent');
    assertEquals([w.st.digest_outbox, w.st.send_log.map((x) => [x.type, x.status])], [[], [['summary', 'sent']]]);
    const r3 = await runAll('runner-key');
    assertEquals([r3.claimed, r3.sent, w.mails.length], [0, {}, 1], 'once only');
    assertEquals(w.errs, []);
  });
});
// حساب بتوقيت متأخر (لوس أنجلوس): ميعاد الملخص بتوقيت المستخدم، وآخر يوم في الفترة لسه مخلصش بتوقيت الحساب — «أيام مكتملة» لازم تبقى صح
// (مراجعة ١ نوفمبر، ر٥): القسم بيستنى من غير ما الإعلانات تتحمّل (طلبات مهدرة من حد Meta)، وبيتبني أول ما اليوم يخلص هناك
Deno.test('المُشغّل كله — الملخص لحساب بتوقيت متأخر: اليوم الأخير لسه مخلصش هناك = القسم بيستنى ١٠ دقايق من غير ما الإعلانات تتحمّل، وبعد ما يخلص بيتبني', async () => {
  await withRunWorld(async (w) => {
    fixedClock('2026-11-22T07:05:00.000Z');   // الرياض ١٠:٠٥ الأحد — لوس أنجلوس ٢٣:٠٥ السبت ٢١، آخر يوم في الفترة لسه شغّال هناك
    w.ctl.autoClaim = true;
    w.st.user_digest_accounts[0].checked_at = '2026-11-22T06:50:00.000Z';
    w.ctl.account = () => json({ id: 'act_1', name: 'Store One', account_status: 1, timezone_name: 'America/Los_Angeles', currency: 'USD', spend_cap: '0', amount_spent: '0' });
    const r1 = await runAll('runner-key');
    assertEquals([r1.claimed, r1.outcomes], [1, { 'meta:ok': 1 }], 'log: ' + w.errs.join(' | '));
    const a = w.st.user_digest_accounts[0];
    assertEquals([a.need_summary, a.retry_after, a.checked_at], ['2026-11-15..2026-11-21', '2026-11-22T07:15:00.000Z', '2026-11-22T06:50:00.000Z'],
      'the section waits ten minutes for the day to end there (not an urgent check)');
    assertEquals(w.st.digest_outbox.filter((r) => r.kind === 'summary'), []);
    assertEquals(w.seen.filter((x) => x.indexOf('graph /act_1/') === 0), [], 'only the account itself was asked — the ads are not loaded');
    // اليوم خلص هناك (الأحد ٠٠:٠٥ لوس أنجلوس = ٠٨:٠٥ UTC)
    fixedClock('2026-11-22T08:05:00.000Z');
    const r2 = await runAll('runner-key');
    assertEquals([r2.claimed, r2.outcomes], [1, { 'meta:ok': 1 }], 'log: ' + w.errs.join(' | '));
    assertEquals(w.st.digest_outbox.filter((r) => r.kind === 'summary').map((r) => r.period), ['2026-11-15..2026-11-21'], 'built once the day is complete there');
    assertEquals([w.st.user_digest_accounts[0].need_summary, w.st.user_digest_accounts[0].retry_after], [null, null]);
    assertEquals(w.errs, []);
  });
});
// فحص عاجل وقسم ملخص في نفس الحجز، واليوم الأخير لسه مخلصش بتوقيت الحساب: الفحص العاجل بيتم (التنبيهات اللي اتلاقت متضيعش)، والقسم لوحده
// بيستنى (summarySections — الخروج المبكر في checkMetaAccount للحجز من غير فحص عاجل بس)
Deno.test('المُشغّل كله — فحص عاجل وقسم ملخص في نفس الحجز واليوم لسه مخلصش هناك: العاجل بيتم والقسم لوحده بيستنى', async () => {
  await withRunWorld(async (w) => {
    fixedClock('2026-11-22T07:05:00.000Z');
    w.ctl.account = () => json({ id: 'act_1', name: 'Store One', account_status: 1, timezone_name: 'America/Los_Angeles', currency: 'USD', spend_cap: '0', amount_spent: '0' });
    w.claim(true, '2026-11-15..2026-11-21');
    const r1 = await runAll('runner-key');
    assertEquals([r1.claimed, r1.outcomes], [1, { 'meta:ok': 1 }], 'log: ' + w.errs.join(' | '));
    const a = w.st.user_digest_accounts[0];
    assertEquals([a.edits_at, a.checked_at], ['2026-11-22T07:05:00.000Z', '2026-11-22T07:05:00.000Z'], 'the urgent check ran (edit log read now)');
    assertEquals([a.need_summary, a.retry_after], ['2026-11-15..2026-11-21', '2026-11-22T07:15:00.000Z'], 'the summary section alone waits');
    assertEquals(w.st.digest_outbox.filter((r) => r.kind === 'summary'), [], 'no section for an incomplete day');
    assertEquals(w.errs, []);
  });
});
// التنبيهات اللي محتاجة بيانات زيادة (extraAlerts): «إيقاف عنصر كبير» من سجل تعديلات Meta — بنصيبه من إنفاق الحساب في الـ٧ أيام المكتملة (١٢١)
// ووقته بتوقيت الحساب، والتعديل اللي اتقيّم قبل كده مبيتكررش؛ والرابط المعطّل (٤٠٤ من أول مرة)؛ ومصدر فشل (أرقام الموقع) بيتكتب في السجل
// والفحص بيكمّل بالباقي
Deno.test('المُشغّل كله لحساب Meta — بيانات زيادة: إيقاف حملة كبيرة بنصيبها في الأيام المكتملة ووقتها بتوقيت الحساب، ورابط معطّل، ومصدر فاشل والفحص بيكمّل', async () => {
  await withRunWorld(async (w) => {
    const pause = (id: string, name: string, at: string) => ({ event_type: 'update_campaign_group_run_status', event_time: at, object_id: id, object_name: name,
      object_type: 'CAMPAIGN_GROUP', extra_data: JSON.stringify({ old_value: 'ACTIVE', new_value: 'PAUSED' }), actor_name: 'Sara' });
    // الحملة اللي فيها الإعلانات التلاتة اتوقفت ٦:٣٠ UTC (٩:٣٠ بالرياض)، وحملة تانية قبل آخر قراءة لسجل التعديلات (٦:٠٠) — اتقيّمت قبل كده
    w.ctl.activities = [pause('c1', 'Camp', '2026-11-18T06:30:00+0000'), pause('c2', 'Old camp', '2026-11-18T05:00:00+0000')];
    // إنفاق الحملة يوم بيوم: ١٥٠ كل يوم (نص إنفاق الحساب)، والنهارده لحد دلوقتي ١١٠
    // وc2 (اللي اتقيّمت قبل كده) ليها نصيب كبير كمان — لو اتحسبت تاني كانت هتطلع تنبيه زيادة
    w.ctl.objDaily = RUN_KEYS.map((k, i) => ({ date_start: k, campaign_id: 'c1', spend: i === RUN_KEYS.length - 1 ? '110' : '150' }))
      .concat(RUN_KEYS.map((k) => ({ date_start: k, campaign_id: 'c2', spend: '100' })));
    w.ctl.broken = ['https://shop.example/p-good2'];
    w.ctl.siteFail = true;
    w.claim();
    const r1 = await runAll('runner-key');
    assertEquals([r1.claimed, r1.outcomes], [1, { 'meta:ok': 1 }], 'log: ' + w.errs.join(' | '));
    const sec = w.st.digest_outbox.filter((r) => r.kind === 'urgent' && r.period === '')[0];
    const fresh = sec.payload.fresh as any[];
    assertEquals(fresh.map((a) => a.code).sort(), ['big-edit', 'link-broken', 'waste'], 'the three urgent alerts: ' + JSON.stringify(fresh).slice(0, 500));
    const edit = fresh.find((a) => a.code === 'big-edit'), link = fresh.find((a) => a.code === 'link-broken');
    assertEquals(edit.objectId, 'c1@2026-11-18T06:30:00', 'the paused campaign, once per edit');
    // نصيبها من إنفاق الحساب في الـ٧ أيام المكتملة (١١–١٧): ٩٠٠ من ١٨٠٠ = ٥٠٪ — كان «٥٦٪» (من ١٢ لحد النهارده قصاد الأيام المكتملة)
    assert(String(edit.detail).indexOf('٥٠٪') > -1, 'its share of the spend in the last 7 complete days: ' + edit.detail);
    assert(String(edit.detail).indexOf('Sara') > -1 && String(edit.detail).indexOf('٠٩:٣٠') > -1, 'who and when, in the account time zone: ' + edit.detail);
    assert(/^u:[0-9a-f]{24}$/.test(String(link.objectId)), 'the broken page key: ' + link.objectId);
    assert(String(link.detail).indexOf('https://shop.example/p-good2') > -1, 'the broken page: ' + link.detail);
    assertEquals(sec.marks.map((m: any) => m.object_id).sort(), [link.objectId, 'c1@2026-11-18T06:30:00', 'waste'].sort(), 'a mark for each');
    // المصدر الفاشل اتكتب مرة، والتعديلات اتقرت (العلامة اتحركت)
    assertEquals(w.errs.filter((x) => x.indexOf('extra alerts site') === 0).length, 1, 'log: ' + w.errs.join(' | '));
    assertEquals(w.errs.filter((x) => x.indexOf('extra alerts site') !== 0), [], 'nothing else in the log');
    assertEquals(w.st.user_digest_accounts[0].edits_at, RUN_NOW, 'the edit log was read');
  });
});
