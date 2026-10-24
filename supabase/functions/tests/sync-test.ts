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
import { byOwner, callTimeout, familyOf, freshUsage, markMap, normName, ownPausedIds, readUsage, resolveNow, settingsChoice } from '../sync/runner.ts';
import { cleanAccountSettings, handleSettings } from '../sync/settings.ts';

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

// المرحلة ٥ (ق٣، ١٩ أكتوبر ٢٠٢٦): اللي صاحب المفتاح عمله بنفسه (وقّف أكبر مصدر مبيعات، ضاعف ميزانية) مبيوصلوش بريد «عاجل» —
// Google SRE: تنبيه على فعل المستقبِل نفسه بيتعلّم يتجاهله. التعديل اللي عمله حد تاني بيفضل عاجل
Deno.test('فعل صاحب المفتاح نفسه: الاسم بيتقارن من غير حالة الحروف والمسافات، وحد تاني = مش هو', () => {
  const me = normName('  Store   Owner ');
  assertEquals(me, 'store owner');
  assert(byOwner('store owner', me) && byOwner('STORE OWNER', me));
  assert(!byOwner('Agency Buyer', me) && !byOwner(null, me) && !byOwner('store owner', ''));
  const paused = ownPausedIds([
    { kind: 'pause', id: 'c1', actor: 'Store Owner' },
    { kind: 'pause', id: 'a2', actor: 'Agency Buyer' },
    { kind: 'budget', id: 's3', actor: 'Store Owner' },
    null
  ], me);
  assertEquals(paused, { c1: true });
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
Deno.test('إعدادات الحساب: من غير إثبات الوصول للحساب في منصته مفيش قراءة ولا حفظ', async () => {
  let metaOk = true, snapOk = true, writes = 0, touches = 0, usedAt = '2025-01-01T00:00:00Z', lastWrite: any = null;
  stubFetch((url, init) => {
    if (url.indexOf('graph.facebook.com') > -1) return metaOk ? json({ id: 'act_123', name: 'X' }) : json({ error: { code: 100 } }, 400);
    if (url.indexOf('adsapi.snapchat.com') > -1) return snapOk ? json({ adaccounts: [{ adaccount: { id: 'aaaa-1111' } }] }) : json({ request_status: 'ERROR' }, 403);
    if (url.indexOf('/rest/v1/account_settings') > -1) {
      if (init && init.method === 'POST') { writes++; lastWrite = JSON.parse(String(init.body)); return new Response(null, { status: 201 }); }
      if (init && init.method === 'PATCH') { touches++; return new Response(null, { status: 204 }); }
      return json([{ settings: { roasTarget: 5, roasBreakEven: 5 }, updated_at: '2026-10-24T00:00:00Z', used_at: usedAt }]);
    }
    throw new Error('unexpected fetch ' + url);
  });
  try {
    const T = 'TOKEN_abcdefghijklmnopqrstuvwxyz';
    const get = await handleSettings('settings.get', { platform: 'meta', accountId: 'act_123', platformToken: T }, null);
    assertEquals(get.status, 200);
    assertEquals((await get.json()).settings, { roasTarget: 5, roasBreakEven: 5 });
    // آخر استخدام (مدة الاحتفاظ ١٢ شهر من غير فتح): بيتحدّث لو أقدم من يوم بس
    assertEquals(touches, 1, 'old last-use: touched');
    usedAt = new Date().toISOString();
    await handleSettings('settings.get', { platform: 'meta', accountId: 'act_123', platformToken: T }, null);
    assertEquals(touches, 1, 'used today: no extra write');
    metaOk = false;
    const denied = await handleSettings('settings.set', { platform: 'meta', accountId: 'act_123', platformToken: T, settings: { roasTarget: 1, roasBreakEven: 1 } }, null);
    assertEquals([denied.status, writes], [403, 0], 'no access on Meta: nothing written');
    const set = await handleSettings('settings.set', { platform: 'snapchat', accountId: 'aaaa-1111', platformToken: T, settings: { roasTarget: 4, roasBreakEven: 2, evil: 9 } }, null);
    assertEquals([set.status, writes], [200, 1]);
    assertEquals((await set.json()).settings, { roasTarget: 4, roasBreakEven: 2 });
    assert(lastWrite && lastWrite.used_at && lastWrite.used_at === lastWrite.updated_at, 'saving counts as use');
    snapOk = false;
    assertEquals((await handleSettings('settings.get', { platform: 'snapchat', accountId: 'aaaa-1111', platformToken: T }, null)).status, 403);
    assertEquals((await handleSettings('settings.get', { platform: 'google', accountId: '1', platformToken: T }, null)).status, 400);
    assertEquals((await handleSettings('settings.get', { platform: 'meta', accountId: '123', platformToken: T }, null)).status, 400);
  } finally { restoreFetch(); }
});
// البريد بسجل الحساب بس: من غيره حكم الربح بيستنى زي الأداة (النسخة القديمة اللي كانت مع الملخص كانت ×٣/×١ غلط — اتشاف حياً)
Deno.test('البريد بيقرا سجل الحساب بس — من غيره أو من غير مستهدف فيه حكم الربح بيستنى زي الأداة', () => {
  assertEquals(settingsChoice(null), { target: null, sens: null });
  const acs = { roasTarget: 5, roasBreakEven: 5, maxCost: { lead: 30 } };
  assertEquals(settingsChoice(acs), { target: { roas: 5, be: 5 }, sens: acs });
  assertEquals(settingsChoice({ cprWarnMultiple: 2 }).target, null, 'a record without goals: profit waits');
});
