// Ads Center — مزامنة التجربة (Supabase Edge Function: sync)
// https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync — POST بجسم JSON فيه action:
//   ping  ← نبض يومي من Cloudflare (الخطة المجانية بتوقف المشروع بعد أسبوع من غير نشاط). مفيش بيانات
//   seen  ← { token, accountId } الحساب فتح الأداة (سجل عملاء التجربة)
//   list  ← { token, viewKey } إجابات «هل كان التشخيص صحيحاً؟» للعرض ده
//   save  ← { token, viewKey, entry, info } حفظ إجابة واحدة
//
// الأمان: الدالة عامة (verify_jwt = false) لأن الأداة مفيهاش حسابات دخول خاصة بيها. بدل كده كل طلب فيه
// مفتاح Meta بتاع صاحب المتجر، والدالة بتسأل Meta نفسها إن المفتاح ده عنده صلاحية على الحساب الإعلاني
// قبل ما تقرا أو تكتب أي حاجة. المفتاح بيتستخدم في الطلب ده بس — مبيتحفظش ومبيتكتبش في السجلات.
// viewKey = «meta:act_123» بس: عرض «كل المنصات» فيه بيانات Google (أسماء حملات وأرقام حسابات)، وسياسة
// الخصوصية بتقول إننا مش بنحفظ أي بيانات Google — فهو وعروض Google وSnapchat بيفضلوا على جهاز العميل.

const ORIGINS = ['https://adscenter.online'];
const GRAPH = 'https://graph.facebook.com/v26.0';
const MAX_BODY = 16 * 1024;
const REASONS = ['offer', 'stock', 'price', 'site', 'shipping', 'ads', 'season', 'tracking', 'other'];
const KINDS = ['urgent', 'why', 'decision', 'watch', 'opportunity', 'follow', 'note'];
const META_ID = /^act_\d{1,30}$/;
const META_VIEW = /^meta:(act_\d{1,30})$/;
const TOKEN = /^[A-Za-z0-9._|-]{20,2048}$/;

// المفتاح السري الجديد (sb_secret_...)، والقديم (service_role) احتياطي — القديم بيتوقف آخر ٢٠٢٦
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (keys && keys.default) return keys.default;
  } catch (_) { /* نكمل بالقديم */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Vary': 'Origin' };
  if (origin && ORIGINS.indexOf(origin) > -1) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'content-type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function reply(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

// PostgREST بالمفتاح السري (بيتخطى RLS — الجداول مقفولة على أي حد غيره)
async function db(path: string, init: RequestInit): Promise<Response> {
  const key = secretKey();
  const headers: Record<string, string> = { 'apikey': key, 'content-type': 'application/json' };
  if (key.indexOf('eyJ') === 0) headers['authorization'] = 'Bearer ' + key;   // المفتاح القديم JWT
  Object.assign(headers, (init.headers || {}) as Record<string, string>);
  const r = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/' + path, { ...init, headers });
  if (!r.ok) throw new Error('db ' + r.status + ' ' + (await r.text()).slice(0, 120));
  return r;
}

// Meta: صاحب المفتاح يقدر يشوف الحساب ده؟ (بيرجع اسمه وعملته وتوقيته من Meta نفسها)
async function metaAccount(token: string, id: string): Promise<Record<string, string> | null> {
  const url = GRAPH + '/' + id + '?fields=id,name,currency,timezone_name&access_token=' + encodeURIComponent(token);
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j && j.id === id ? j : null;
}

// «meta:act_1» → «act_1» (الحساب اللي لازم نتحقق منه). أي شكل تاني = مرفوض
function metaIdOf(viewKey: unknown): string | null {
  const m = typeof viewKey === 'string' ? META_VIEW.exec(viewKey) : null;
  return m ? m[1] : null;
}

function validDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v ? v.slice(0, max) : null;
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
    note: typeof e.note === 'string' ? e.note.slice(0, 500) : '',
    block_kind: KINDS.indexOf(i.kind) > -1 ? i.kind : null,
    block_title: str(i.title, 300),
    head_type: typeof i.head === 'string' && /^[A-Za-z]{1,40}$/.test(i.head) ? i.head : null,
    lang: i.lang === 'ar' || i.lang === 'en' ? i.lang : null,
    // وقت الإجابة من جهاز العميل — لو غريب (مستقبل أو فاضي) بنستخدم وقت الاستلام
    answered_at: new Date(isFinite(at) && at <= now + 5 * 60000 ? at : now).toISOString(),
    updated_at: new Date(now).toISOString()
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, origin);

  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return reply(413, { error: 'too large' }, origin);
    body = JSON.parse(text);
  } catch (_) {
    return reply(400, { error: 'json' }, origin);
  }
  const action = body && body.action;

  try {
    if (action === 'ping') {
      await db('rpc/beat', { method: 'POST', body: JSON.stringify({ p_source: 'cloudflare' }) });
      return reply(200, { ok: true }, origin);
    }
    if (typeof body.token !== 'string' || !TOKEN.test(body.token)) return reply(400, { error: 'token' }, origin);

    if (action === 'seen') {
      const id = body.accountId;
      if (typeof id !== 'string' || !META_ID.test(id)) return reply(400, { error: 'account' }, origin);
      const a = await metaAccount(body.token, id);
      if (!a) return reply(403, { error: 'not verified' }, origin);
      await db('rpc/touch_account', { method: 'POST', body: JSON.stringify({
        p_platform: 'meta', p_account_id: id, p_name: str(a.name, 200), p_currency: str(a.currency, 8), p_timezone: str(a.timezone_name, 64)
      }) });
      return reply(200, { ok: true }, origin);
    }

    if (action === 'list' || action === 'save') {
      const id = metaIdOf(body.viewKey);
      if (!id) return reply(400, { error: 'view' }, origin);
      if (!(await metaAccount(body.token, id))) return reply(403, { error: 'not verified' }, origin);

      if (action === 'list') {
        const r = await db('feedback?select=block,since,until,verdict,reasons,note,answered_at&view_key=eq.' +
          encodeURIComponent(body.viewKey) + '&order=answered_at.desc&limit=200', { method: 'GET' });
        const rows = await r.json();
        return reply(200, { entries: rows.map((x: any) => ({
          block: x.block, since: x.since, until: x.until, verdict: x.verdict, reasons: x.reasons || [], note: x.note || '', at: x.answered_at
        })) }, origin);
      }
      const row = cleanEntry(body.viewKey, body.entry, body.info);
      if (!row) return reply(400, { error: 'entry' }, origin);
      await db('feedback?on_conflict=view_key,block,since,until', {
        method: 'POST', headers: { 'prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row)
      });
      return reply(200, { ok: true }, origin);
    }
    return reply(400, { error: 'action' }, origin);
  } catch (e) {
    // من غير التوكن ولا جسم الطلب — نوع العملية والخطأ بس
    console.error('sync failed', action, String(e && (e as Error).message || e).slice(0, 200));
    return reply(502, { error: 'upstream' }, origin);
  }
});
