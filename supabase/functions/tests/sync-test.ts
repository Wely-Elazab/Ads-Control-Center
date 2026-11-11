// اختبارات دالة sync (مراجعة المرحلة ٢، ١٢ أكتوبر ٢٠٢٦ — ب٢: الخادم كان من غير أي اختبار).
// من غير شبكة ولا قاعدة بيانات: fetch بيتبدّل ببديل في كل اختبار محتاجه، ومفتاح التشفير مفتاح تجريبي عشوائي.
// بتتشغّل في التكامل المستمر (.github/workflows/tests.yml):
//   deno test --allow-env --no-check supabase/functions/tests/sync-test.ts
// مكان الملف حسب توصية Supabase («Testing your Edge Functions»): supabase/functions/tests/<اسم الدالة>-test.ts

import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1';
import { corsHeaders, esc, reply, str, stripHidden } from '../sync/lib.ts';
import { MAX_PER_PLATFORM, SNAP_ID, cleanEmail, daysText, hourText, handleDigest, linkSig, sameString, seal, unseal } from '../sync/digest.ts';
import { bearer, cleanCode, counterMissing, handleLogin, newCode, verifyJwt } from '../sync/auth.ts';
import { handleMetaLink } from '../sync/metalink.ts';
import {
  addDays, assemble, callTimeout, daysBetween, familyOf, freshUsage, keyWindow, markMap, monthWindow, needsAttention, readUsage, resolveNow, settingsChoice,
  summaryWindow, urgentReady, windowComplete, windowKey, statusPick, ongoingAll, editsSince, probe
} from '../sync/runner.ts';
import { ACCT_MAX, MAX_KEYS, cleanAccountSettings, cleanUserSettings, cleanUserWrite, handleSettings, handleUserSettings, type UserWrite } from '../sync/settings.ts';
import { cleanDecisions, cleanOpen, decisionOk, handleEpisodes, sinceOf } from '../sync/episodes.ts';

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
  assertEquals(SNAP_ID.test('cd3b3bfe-4361-484c-9985-51c2d1264860'), true);
  assertEquals(SNAP_ID.test('CD3B3BFE-4361-484C-9985-51C2D1264860'), true, 'الحروف الكبيرة مقبولة');
  for (const bad of ['------------------------------------', 'cd3b3bfe43614 84c998551c2d1264860',
    'cd3b3bfe-4361-484c-9985-51c2d126486', 'cd3b3bfe-4361-484c-9985-51c2d1264860x', '']) {
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
  for (const k of ['waste', 'waste-week', 'loss', 'cost-max', 'cpr', 'fatigue', 'waste-early', 'drop', 'spike', 'low-roas', 'roas-drop', 'waste-view', 'waste-new']) assertEquals(familyOf(k), 'perf', k);
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
    assertEquals((await handleSettings('settings.get', { platform: 'snapchat', accountId: 'cd3b3bfe-4361-484c-9985-51c2d1264860', platformToken: T }, null)).status, 403);
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
    const snap = await call('digest.add', { platform: 'snapchat', accountId: 'cd3b3bfe-4361-484c-9985-51c2d1264860', sealed: 'v2.' + 'A'.repeat(16) + '.' + 'B'.repeat(40) }, A);
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
  const SNAP = 'cd3b3bfe-4361-484c-9985-51c2d1264860', SEALED = 'v2.' + 'A'.repeat(16) + '.' + 'B'.repeat(40);
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
  const SNAP = 'cd3b3bfe-4361-484c-9985-51c2d1264860', SNAP2 = '0f0e0d0c-0b0a-4908-8706-050403020100';
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
    assertEquals(m.subject, 'عاجل: أمران يحتاجان إلى إجراء — حسابين');
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
    assert(html.indexOf('وما زالت هذه التنبيهات العاجلة قائمة منذ أبلغناك بها') > -1, 'a still-ongoing section');
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
    assert(seen.length - before <= 11, 'a bounded number of hops');
  } finally { restoreFetch(); }
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
  } finally { restoreFetch(); restoreEngine(); Deno.env.delete('RESEND_API_KEY'); }
});
