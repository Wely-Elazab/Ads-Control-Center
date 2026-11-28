// معالج دالة sync — العمليات ووصفها والأمان في رأس index.ts. هنا عشان يتختبر (tests/sync-test.ts): index.ts بيشغّل Deno.serve
// أول ما يتحمّل، فالاختبار مكانش يقدر يستورده (التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦، ١١٦). نفس الأسطر اللي كانت هناك بالظبط

import { META_ID, TOKEN, corsHeaders, reply, db, rpc, metaAccount, isAppAdmin, str, stripHidden, sendEmail, mailHtml, MAIL_REPLY_TO } from './lib.ts';
import { handleDigest } from './digest.ts';
import { handleJoin } from './join.ts';
import { runAll, preview, previewSummary } from './runner.ts';
import { handleLogin, requireLogin } from './auth.ts';
import { handleMetaLink } from './metalink.ts';
import { handleSettings, handleUserSettings, handleStoreAccount } from './settings.ts';
import { handleEpisodes } from './episodes.ts';
import { handleStores, handleInvite } from './stores.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const MAX_BODY = 16 * 1024;
// حفظ إعدادات المستخدم بس ممكن يكبر عن كده: «كل الحسابات» فيها حدود حملات كل الحسابات مع بعض (لحد ٢٬٠٠٠ في القائمة — settings.ts
// MAX_KEYS، مراجعة ٣١ أكتوبر). باقي العمليات على الحد القديم
const MAX_BODY_SETTINGS = 256 * 1024;
const REASONS = ['offer', 'stock', 'price', 'site', 'shipping', 'ads', 'season', 'tracking', 'other'];
const KINDS = ['urgent', 'why', 'decision', 'watch', 'opportunity', 'follow', 'note'];
const META_VIEW = /^meta:(act_\d{1,30})$/;

// «meta:act_1» → «act_1» (الحساب اللي لازم نتحقق منه). أي شكل تاني = مرفوض
function metaIdOf(viewKey: unknown): string | null {
  const m = typeof viewKey === 'string' ? META_VIEW.exec(viewKey) : null;
  return m ? m[1] : null;
}

function validDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
}

// إجابة واحدة بعد التنظيف — أي حقل غريب بيترفض أو بيتشال بدل ما يوصل لقاعدة البيانات
function cleanEntry(viewKey: string, e: any, info: any): Record<string, unknown> | null {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.block !== 'string' || !e.block || e.block.length > 200 || /[\u0000-\u001f]/.test(e.block)) return null;
  if (!validDate(e.since) || !validDate(e.until) || e.until < e.since) return null;
  if (e.verdict !== 'yes' && e.verdict !== 'no') return null;
  const reasons = Array.isArray(e.reasons) ? REASONS.filter((r) => e.reasons.indexOf(r) > -1) : [];
  const now = Date.now(), at = typeof e.at === 'string' ? Date.parse(e.at) : NaN;
  const i = info && typeof info === 'object' ? info : {};
  return {
    view_key: viewKey, block: e.block, since: e.since, until: e.until, verdict: e.verdict, reasons,
    // المحارف المخفية بتتشال زي باقي النصوص (lib.ts stripHidden) — سطر سطر عشان الملاحظة ممكن تبقى أكتر من سطر (التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦، ١١٧)
    note: typeof e.note === 'string' ? e.note.replace(/\r\n?/g, '\n').split('\n').map(stripHidden).join('\n').slice(0, 500) : '',
    block_kind: KINDS.indexOf(i.kind) > -1 ? i.kind : null,
    block_title: str(i.title, 300),
    head_type: typeof i.head === 'string' && /^[A-Za-z]{1,40}$/.test(i.head) ? i.head : null,
    lang: i.lang === 'ar' || i.lang === 'en' ? i.lang : null,
    // وقت الإجابة من جهاز العميل — لو غريب (مستقبل أو فاضي) بنستخدم وقت الاستلام
    answered_at: new Date(isFinite(at) && at <= now + 5 * 60000 ? at : now).toISOString(),
    updated_at: new Date(now).toISOString()
  };
}

// حالة الأسرار من غير قيمها: موجودة؟ طولها صح؟ المزوّد قابلها؟ + أسماء الأسرار اللي ضفناها إحنا (أسماء بس)
async function secretsStatus(): Promise<Record<string, unknown>> {
  const enc = Deno.env.get('TOKEN_ENC_KEY') || '';
  const t = enc.trim();
  let bytes = 0;
  try { bytes = t ? atob(t).length : 0; } catch (_) { bytes = -1; }
  // شكل المفتاح بس (عدد حروفه وأنواعها) — عشان نعرف لو اتلزق غلط، من غير ما نكشف أي جزء منه
  const shape = {
    chars: t.length, trimmed: enc.length - t.length, base64: /^[A-Za-z0-9+/]+={0,2}$/.test(t),
    quotes: /["'«»]/.test(t), spaces: /\s/.test(t), upper: /[A-Z]/.test(t), lower: /[a-z]/.test(t), digits: /\d/.test(t), symbols: /[^A-Za-z0-9]/.test(t)
  };
  const out: Record<string, any> = {
    tokenKey: { set: !!enc, bytes, ok: bytes === 32, shape },
    metaSecret: { set: !!Deno.env.get('META_APP_SECRET') },
    custom: Object.keys(Deno.env.toObject()).filter((k) => !/^(SUPABASE_|SB_|DENO_)/.test(k)).sort()
  };
  const rk = Deno.env.get('RESEND_API_KEY');
  out.resend = { set: !!rk };
  if (rk) {
    const r = await fetch('https://api.resend.com/domains', { headers: { authorization: 'Bearer ' + rk } }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    out.resend.http = r ? r.status : 0;
    if (r && r.ok && j && Array.isArray(j.data)) out.resend.domains = j.data.map((d: any) => ({ name: d.name, status: d.status, region: d.region }));
    else if (j) out.resend.error = String(j.name || j.message || '').slice(0, 80);
  }
  return out;
}

export async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, origin);

  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_SETTINGS) return reply(413, { error: 'too large' }, origin);
    body = JSON.parse(text);
    if (text.length > MAX_BODY && !(body && body.action === 'usettings.set')) return reply(413, { error: 'too large' }, origin);
  } catch (_) {
    return reply(400, { error: 'json' }, origin);
  }
  const action = body && body.action;

  try {
    if (action === 'ping') {
      await db('rpc/beat', { method: 'POST', body: JSON.stringify({ p_source: 'cloudflare' }) });
      return reply(200, { ok: true }, origin);
    }
    // رابط الإيقاف في الرسائل: توقيعه هو الإثبات، من غير دخول Meta
    if (action === 'stop') return await handleDigest(action, body, origin);
    // طلب الانضمام عام (من غير دخول)، و«أرسلت الدعوة» توقيعه هو الإثبات
    if (action === 'join' || action === 'join.peek' || action === 'join.activate') return await handleJoin(action, body, origin);
    // دعوة متجر (stores.ts — ٢٧ نوفمبر ٢٠٢٦): رابط الدعوة اللي وصل لبريد المدعو هو الإثبات، من غير دخول
    if (action === 'invite.peek' || action === 'invite.accept') return await handleInvite(action, body, origin);

    // المُشغّل: بنرد فوراً ونكمّل في الخلفية (pg_net مش محتاج يستنى)
    if (action === 'run') {
      const key = req.headers.get('x-runner-key') || '';
      // نفس سؤال الـ Worker (Live/api/_login.js): runner_key_check بتقارن بصمة SHA-256 للمفتاح — كانت هنا دالة تانية بتقارن النص نفسه
      if (!(await rpc('runner_key_check', { p_key: key }))) return reply(403, { error: 'key' }, origin);
      // المفتاح نفسه بيروح للـ Worker مع طلبات Snapchat (runner.ts snapCall ← Live/api/digest-fetch.js)
      const job = runAll(key).then((r) => console.log('runner', JSON.stringify(r)))
        .catch((e) => console.error('runner failed', String(e && (e as Error).message || e).slice(0, 200)));
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) { EdgeRuntime.waitUntil(job); return reply(202, { accepted: true }, origin); }
      await job;
      return reply(200, { ok: true }, origin);
    }

    // تسجيل الدخول للأداة، وبعده كل العمليات محتاجة دخول مكتمل (كلمة المرور + الرمز) — فوق صلاحية Meta
    if (typeof action === 'string' && action.indexOf('login.') === 0) return await handleLogin(action, body, req, origin);
    const user = await requireLogin(req);
    if (!user) return reply(401, { error: 'login', code: 'LOGIN' }, origin);
    // ربط Meta المحفوظ على الجهاز — مربوط بحساب الدخول ده (metalink.ts)
    if (action === 'meta.seal' || action === 'meta.renew') return await handleMetaLink(action, body, user.id, origin);
    // إعدادات التنبيهات لكل مستخدم (settings.ts — قرار ٢٦ أكتوبر): سجل صاحب الدخول نفسه، من غير مفتاح أي منصة. وبريد الدخول للموافقة على
    // سجل لوحة «ما حققته» اللي في طلب انضمامه (٢٦ نوفمبر ٢٠٢٦)
    if (action === 'usettings.get' || action === 'usettings.set') return await handleUserSettings(action, body, user.id, origin, user.email);
    // حساب المتجر في المنصة (settings.ts — ٢٨ نوفمبر ٢٠٢٦، «مثل ثندر»): المالك بس، بإثبات من المنصة نفسها. جنب التحقق من المنصة عشان
    // stores.ts ميستوردش settings.ts (هي بتستورد منه)
    if (action === 'store.account') return await handleStoreAccount(body, user.id, origin);
    // المتجر وفريقه (stores.ts — ٢٧ نوفمبر ٢٠٢٦): الدور من قاعدة البيانات في كل طلب
    if (typeof action === 'string' && action.indexOf('store.') === 0) return await handleStores(action, body, user, origin);
    // سجل الحساب الإعلاني القديم (قراءة بس — النقل لإعدادات المستخدم) بإثبات الوصول للحساب في منصته
    if (action === 'settings.get') return await handleSettings(action, body, origin);
    // سجل مشكلات التنبيه لكل مستخدم على كل حساب إعلاني (episodes.ts — لوحة «ما حققته مع الأداة») بنفس إثبات الوصول؛
    // ومبالغ كل مشكلة بعد ما أيامها تكمل (episodes.amounts — قرار صاحب المنتج ٢٦ نوفمبر ٢٠٢٦: «على خادمنا بعد اكتمالها»)
    if (action === 'episodes.sync' || action === 'episodes.decide' || action === 'episodes.amounts') return await handleEpisodes(action, body, user.id, origin);
    // الملخص التلقائي لكل مستخدم (digest.ts — ٣١ أكتوبر): ملخصه هو، والعمليات اللي محتاجة مفتاح Meta بتتحقق منه جوه
    if (typeof action === 'string' && action.indexOf('digest.') === 0 && action !== 'digest.preview' && action !== 'digest.previewSummary') {
      return await handleDigest(action, body, origin, user.id);
    }

    if (typeof body.token !== 'string' || !TOKEN.test(body.token)) return reply(400, { error: 'token' }, origin);

    if (action === 'digest.preview' || action === 'digest.previewSummary') {
      const admin = await isAppAdmin(body.token);
      if (!admin) return reply(admin === null ? 503 : 403, { error: 'admins only' }, origin);
      if (typeof body.accountId !== 'string' || !META_ID.test(body.accountId)) return reply(400, { error: 'account' }, origin);
      const lang = body.lang === 'en' ? 'en' : 'ar';
      if (action === 'digest.preview') return reply(200, await preview(body.token, body.accountId, lang, user.id), origin);
      return reply(200, await previewSummary(body.token, body.accountId, lang, str(body.since, 10) || undefined, str(body.until, 10) || undefined, body.monthly === true, user.id), origin);
    }

    if (action === 'selfcheck' || action === 'testmail') {
      const admin = await isAppAdmin(body.token);
      if (admin === null) return reply(503, { error: 'meta app secret missing or invalid' }, origin);
      if (!admin) return reply(403, { error: 'admins only' }, origin);
      if (action === 'selfcheck') return reply(200, { ok: true, metaSecretValid: true, ...(await secretsStatus()) }, origin);
      const title = 'رسالة تجريبية: إرسال البريد في Ads Center يعمل';
      const lines = [
        'مرحباً،',
        'هذه رسالة تجريبية أرسلها نظام Ads Center عبر مزوّد البريد Resend.',
        'وصولها إلى بريدك يعني أن إرسال رسائل التفعيل والملخصات من support@adscenter.online يعمل بشكل صحيح. لا يلزم أي إجراء.'
      ];
      const id = await sendEmail(MAIL_REPLY_TO, title, mailHtml(title, lines), title + '\n\n' + lines.join('\n'));
      return reply(200, { ok: true, id }, origin);
    }

    if (action === 'seen') {
      const id = body.accountId;
      if (typeof id !== 'string' || !META_ID.test(id)) return reply(400, { error: 'account' }, origin);
      const a = await metaAccount(body.token, id);
      if (!a) return reply(403, { error: 'not verified' }, origin);
      await rpc('touch_account', {
        p_platform: 'meta', p_account_id: id, p_name: str(a.name, 200), p_currency: str(a.currency, 8), p_timezone: str(a.timezone_name, 64)
      });
      return reply(200, { ok: true }, origin);
    }

    if (action === 'list' || action === 'save') {
      const id = metaIdOf(body.viewKey);
      if (!id) return reply(400, { error: 'view' }, origin);
      if (!(await metaAccount(body.token, id))) return reply(403, { error: 'not verified' }, origin);

      if (action === 'list') {
        // إجابات المستخدم ده بس (من ٣١ أكتوبر — كانت مشتركة لكل من يفتح الحساب)
        const r = await db('feedback?select=block,since,until,verdict,reasons,note,answered_at&user_id=eq.' + user.id + '&view_key=eq.' +
          encodeURIComponent(body.viewKey) + '&order=answered_at.desc&limit=200', { method: 'GET' });
        const rows = await r.json();
        return reply(200, { entries: rows.map((x: any) => ({
          block: x.block, since: x.since, until: x.until, verdict: x.verdict, reasons: x.reasons || [], note: x.note || '', at: x.answered_at
        })) }, origin);
      }
      const row = cleanEntry(body.viewKey, body.entry, body.info);
      if (!row) return reply(400, { error: 'entry' }, origin);
      await db('feedback?on_conflict=user_id,view_key,block,since,until', {
        method: 'POST', headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...row, user_id: user.id })
      });
      return reply(200, { ok: true }, origin);
    }
    return reply(400, { error: 'action' }, origin);
  } catch (e) {
    // من غير التوكن ولا جسم الطلب — نوع العملية والخطأ بس
    console.error('sync failed', action, String(e && (e as Error).message || e).slice(0, 200));
    return reply(502, { error: 'upstream' }, origin);
  }
}
