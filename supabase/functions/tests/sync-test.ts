// اختبارات دالة sync (مراجعة المرحلة ٢، ١٢ أكتوبر ٢٠٢٦ — ب٢: الخادم كان من غير أي اختبار).
// من غير شبكة ولا قاعدة بيانات: fetch بيتبدّل ببديل في كل اختبار محتاجه، ومفتاح التشفير مفتاح تجريبي عشوائي.
// بتتشغّل في التكامل المستمر (.github/workflows/tests.yml):
//   deno test --allow-env --no-check supabase/functions/tests/sync-test.ts
// مكان الملف حسب توصية Supabase («Testing your Edge Functions»): supabase/functions/tests/<اسم الدالة>-test.ts

import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1';
import { corsHeaders, esc, reply } from '../sync/lib.ts';
import { cleanEmail, daysText, hourText, linkSig, sameString, seal, unseal } from '../sync/digest.ts';
import { bearer, cleanCode, verifyJwt } from '../sync/auth.ts';
import { handleMetaLink } from '../sync/metalink.ts';
import { callTimeout, familyOf, freshUsage, markMap, readUsage, resolveNow, settingsChoice } from '../sync/runner.ts';
import { MAX_KEYS, cleanAccountSettings, cleanUserSettings, cleanUserWrite, handleSettings, handleUserSettings, type UserWrite } from '../sync/settings.ts';
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

// ---------- auth.ts ----------
Deno.test('رمز الدخول: الأرقام العربية والفارسية والمسافات مقبولة، وأي طول غير ٦ مرفوض', () => {
  assertEquals(cleanCode('١٢٣٤٥٦'), '123456');
  assertEquals(cleanCode('۱۲۳ ۴۵۶'), '123456');
  assertEquals(cleanCode(' 123 456 '), '123456');
  for (const bad of ['12345', '1234567', 'abcdef', '', null, undefined]) assertEquals(cleanCode(bad), null, String(bad));
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
  assertEquals(u, { tier: 'development_access', accPct: 42, bucPct: 55, regainMin: 0, calls: 4 });
  // الاسم اللي في الصفحة الرسمية، والحجب
  readUsage(new Headers({ 'x-business-use-case': JSON.stringify({ '1': [{ call_count: 100, estimated_time_to_regain_access: 5 }] }) }), u);
  assertEquals([u.bucPct, u.regainMin, u.calls], [100, 5, 5]);
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
Deno.test('إعدادات الحساب: المفاتيح المعروفة بس جوه حدودها، والمستهدف وحد الخسارة مع بعض، والتكلفة المقبولة أرقام موجبة', () => {
  assertEquals(cleanAccountSettings({ cprWarnMultiple: 2, minSpendShare: 0.9, evil: 1, roasTarget: 5, roasBreakEven: 5,
    maxCost: { lead: 30, message: -1, 'bad key!': 3 }, campaignMaxCost: { '123': 12 } }),
    { cprWarnMultiple: 2, roasTarget: 5, roasBreakEven: 5, maxCost: { lead: 30 }, campaignMaxCost: { '123': 12 } });
  assertEquals(cleanAccountSettings({ roasTarget: 5 }), {}, 'a target alone is dropped');
  assertEquals(cleanAccountSettings({ roasTarget: 2, roasBreakEven: 4 }), {}, 'a loss limit above the target is dropped');
  assertEquals(cleanAccountSettings([1]), null);
});
Deno.test('سجل الحساب القديم: قراءة بس (للنقل لإعدادات المستخدم)، ومن غير إثبات الوصول للحساب في منصته مفيش قراءة', async () => {
  let metaOk = true, snapOk = true, writes = 0;
  stubFetch((url, init) => {
    if (url.indexOf('graph.facebook.com') > -1) return metaOk ? json({ id: 'act_123', name: 'X' }) : json({ error: { code: 100 } }, 400);
    if (url.indexOf('adsapi.snapchat.com') > -1) return snapOk ? json({ adaccounts: [{ adaccount: { id: 'aaaa-1111' } }] }) : json({ request_status: 'ERROR' }, 403);
    if (url.indexOf('/rest/v1/account_settings') > -1) {
      if (init && init.method && init.method !== 'GET') { writes++; return new Response(null, { status: 204 }); }
      return json([{ settings: { roasTarget: 5, roasBreakEven: 5 }, updated_at: '2026-10-24T00:00:00Z' }]);
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const T = 'TOKEN_abcdefghijklmnopqrstuvwxyz';
    const get = await handleSettings('settings.get', { platform: 'meta', accountId: 'act_123', platformToken: T }, null);
    assertEquals(get.status, 200);
    assertEquals((await get.json()).settings, { roasTarget: 5, roasBreakEven: 5 });
    assertEquals(writes, 0, 'reading writes nothing');
    const set = await handleSettings('settings.set', { platform: 'meta', accountId: 'act_123', platformToken: T, settings: { roasTarget: 1, roasBreakEven: 1 } }, null);
    assertEquals([set.status, writes], [400, 0], 'saving to the account record is gone');
    metaOk = false;
    assertEquals((await handleSettings('settings.get', { platform: 'meta', accountId: 'act_123', platformToken: T }, null)).status, 403, 'no access on Meta');
    snapOk = false;
    assertEquals((await handleSettings('settings.get', { platform: 'snapchat', accountId: 'aaaa-1111', platformToken: T }, null)).status, 403);
    assertEquals((await handleSettings('settings.get', { platform: 'google', accountId: '1', platformToken: T }, null)).status, 400);
    assertEquals((await handleSettings('settings.get', { platform: 'meta', accountId: '123', platformToken: T }, null)).status, 400);
  } finally { restoreFetch(); }
});
// إعدادات التنبيهات لكل مستخدم (قرار صاحب المنتج ٢٦ أكتوبر ٢٠٢٦): «كل الحسابات» ومجموعة لكل منصة اتخصّصت
Deno.test('إعدادات المستخدم: «كل الحسابات» دايماً، والمنصات المعروفة بس، وعملة حد النوع معاه بس', () => {
  assertEquals(cleanUserSettings({ all: { roasTarget: 5, roasBreakEven: 5, maxCost: { lead: 30 }, maxCostCur: 'SAR', evil: 1 },
    plat: { snapchat: { roasTarget: 2, roasBreakEven: 1 }, myspace: { roasTarget: 9, roasBreakEven: 1 }, tiktok: [1] }, asked: true, other: 1 }),
    { all: { roasTarget: 5, roasBreakEven: 5, maxCost: { lead: 30 }, maxCostCur: 'SAR' }, plat: { snapchat: { roasTarget: 2, roasBreakEven: 1 } }, asked: true });
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
      if (method === 'GET') return json([{ settings: { all: { roasTarget: 5, roasBreakEven: 5 } }, updated_at: '2026-10-26T00:00:00Z', used_at: usedAt }]);
      return new Response(null, { status: 204 });
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const get = await handleUserSettings('usettings.get', {}, U, null);
    assertEquals((await get.json()).settings, { all: { roasTarget: 5, roasBreakEven: 5 } });
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
Deno.test('حفظ إعدادات المستخدم: المجموعات اللي اتغيّرت بس متنضّفة، وnull = إلغاء تخصيص، والمستهدف لـ«كل الحسابات» مع بعض، وأي جزء غلط = رفض الطلب كله', () => {
  assertEquals(cleanUserWrite({ changes: { all: { roasTarget: 4, roasBreakEven: 2, evil: 1 }, snapchat: null }, asked: true }),
    { base: null, changes: { all: { roasTarget: 4, roasBreakEven: 2 }, snapchat: null }, goals: null, asked: true });
  assertEquals(cleanUserWrite({ goals: { roasTarget: 5, roasBreakEven: 4, cprWarnMultiple: 3 }, asked: true }),
    { base: null, changes: {}, goals: { roasTarget: 5, roasBreakEven: 4 }, asked: true }, 'goals = the two goals only');
  assertEquals(cleanUserWrite({ base: { all: { roasTarget: 5, roasBreakEven: 5 }, plat: { snapchat: { roasTarget: 2, roasBreakEven: 1 } } } }),
    { base: { all: { roasTarget: 5, roasBreakEven: 5 }, plat: { snapchat: { roasTarget: 2, roasBreakEven: 1 } } }, changes: {}, goals: null, asked: false }, 'base alone = «create if missing»');
  assertEquals(cleanUserWrite({ asked: true }), { base: null, changes: {}, goals: null, asked: true });
  assertEquals(cleanUserWrite({ changes: { all: null } }), null, 'all accounts cannot be removed');
  assertEquals(cleanUserWrite({ changes: { myspace: {} } }), null, 'unknown platform');
  assertEquals(cleanUserWrite({ changes: { meta: [1] } }), null, 'a bad set refuses the whole request');
  assertEquals(cleanUserWrite({ changes: [] }), null);
  assertEquals(cleanUserWrite({ goals: { roasTarget: 5 } }), null, 'a target alone');
  assertEquals(cleanUserWrite({ goals: { roasTarget: 2, roasBreakEven: 4 } }), null, 'loss limit above the target');
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
      return json({ all: { roasTarget: 4, roasBreakEven: 2 }, plat: { meta: { roasTarget: 9, roasBreakEven: 3 } }, asked: true });
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const set = await handleUserSettings('usettings.set', { changes: { all: { roasTarget: 4, roasBreakEven: 2, evil: 9 } }, asked: true, userId: 'someone-else' }, U, null);
    assertEquals(set.status, 200);
    assertEquals(rpcs[0], { p_user: U, p_base: null, p_changes: { all: { roasTarget: 4, roasBreakEven: 2 } }, p_goals: null, p_asked: true }, 'cleaned, and only for this user');
    assertEquals((await set.json()).settings, { all: { roasTarget: 4, roasBreakEven: 2 }, plat: { meta: { roasTarget: 9, roasBreakEven: 3 } }, asked: true }, 'the whole merged record back');
    // صفحة اتفتحت قبل ٣١ أكتوبر (السجل كله): بيتحوّل لتعديل «كل الحسابات» والمنصات اللي فيه — من غير إلغاء تخصيص مش فيه
    await handleUserSettings('usettings.set', { settings: { all: { roasTarget: 6, roasBreakEven: 2 }, plat: { snapchat: { roasTarget: 2, roasBreakEven: 1 }, myspace: {} }, asked: true } }, U, null);
    assertEquals(rpcs[1].p_changes, { all: { roasTarget: 6, roasBreakEven: 2 }, snapchat: { roasTarget: 2, roasBreakEven: 1 } });
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
  const acs = { roasTarget: 5, roasBreakEven: 5, maxCost: { lead: 30 } };
  assertEquals(settingsChoice(acs), { target: { roas: 5, be: 5 }, sens: acs });
  assertEquals(settingsChoice({ cprWarnMultiple: 2 }).target, null, 'a record without goals: profit waits');
});
