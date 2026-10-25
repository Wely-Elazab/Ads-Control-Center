// سجل مشكلات التنبيه لكل حساب إعلاني (لوحة «قيمة الأداة» — قرار صاحب المنتج ٢٥ أكتوبر ٢٠٢٦: «سجل على خادمنا… وحدث سياسة
// الخصوصية»). صف لكل مشكلة على إعلان (جدول alert_episodes): من أول ما الأداة نبّهت عليها لحد ما اختفت، ونوع التعديل اللي اتعمل
// بعدها خلال ٢٤ ساعة. من غير أي أرقام إنفاق أو مبيعات — المبلغ بيتحسب من المنصة وقت العرض (ui.js). مشترك لكل اللي عندهم وصول
// للحساب زي الإعدادات (settings.ts)، بنفس الشرطين: دخول الأداة، ومفتاح المنصة بيثبت إن صاحبه شايف الحساب.
//
//   episodes.sync   ← { platform, accountId, platformToken, open: [{ ad, kind }] | null, since?: 'YYYY-MM-DD' } → { episodes }
//                      open = مشكلات الحساب دلوقتي (الأداة شايفة أرقامه كاملة): الجديد بيتسجّل، والقديم اللي اختفى بيخلص.
//                      null = قراءة بس (قبل ما المستخدم يشوف ملاحظة التسجيل). since = أول يوم في فترة البيانات المختارة (اللوحة
//                      بتتبعها — قرار صاحب المنتج ٢٥ أكتوبر)، بيوم زيادة لفرق التوقيت ولحد مدة الحفظ (٩٠ يوم)؛ من غيره آخر ٤٥ يوم
//   episodes.decide ← { platform, accountId, platformToken, decisions: [{ id, handledAt | null, action | null }] } → { ok, saved }
//                      مرة واحدة لكل مشكلة: اتعالجت (وقت التعديل ونوعه، خلال ٢٤ ساعة من التنبيه) أو لا (بعد ما الـ ٢٤ ساعة تعدّي)
import { db, reply } from './lib.ts';
import { verifyAccount } from './settings.ts';

const AD_ID: Record<string, RegExp> = { meta: /^\d{1,30}$/, snapchat: /^[A-Za-z0-9-]{1,64}$/ };
const KINDS = ['waste', 'loss'];
const ACTIONS = ['pause', 'budget', 'targeting', 'creative', 'bid'];
const MAX_OPEN = 500, MAX_DECIDE = 100, CHUNK = 150;
const DAY = 86400000, WINDOW = DAY, RETURN_DAYS = 45, KEEP_DAYS = 91;

// مشكلات الحساب دلوقتي: إعلان ونوع معروفين، من غير تكرار. أي شكل تاني = null (الطلب بيترفض بدل ما يخلّص مشكلات بالغلط)
export function cleanOpen(v: unknown, platform: string): { ad: string; kind: string }[] | null {
  if (!Array.isArray(v) || v.length > MAX_OPEN || !AD_ID[platform]) return null;
  const seen: Record<string, boolean> = {}, out: { ad: string; kind: string }[] = [];
  for (const x of v) {
    const ad = x && (x as any).ad, kind = x && (x as any).kind;
    if (typeof ad !== 'string' || !AD_ID[platform].test(ad) || KINDS.indexOf(kind) === -1) return null;
    if (seen[ad + '|' + kind]) continue;
    seen[ad + '|' + kind] = true;
    out.push({ ad, kind });
  }
  return out;
}
// القرارات: رقم صف، ووقت ونوع التعديل مع بعض أو ولا واحد (= متعالجتش)
export function cleanDecisions(v: unknown): { id: number; handledAt: string | null; action: string | null }[] | null {
  if (!Array.isArray(v) || !v.length || v.length > MAX_DECIDE) return null;
  const out: { id: number; handledAt: string | null; action: string | null }[] = [];
  for (const x of v) {
    const id = x && (x as any).id, at = x && (x as any).handledAt, action = x && (x as any).action;
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    if (at == null && action == null) { out.push({ id, handledAt: null, action: null }); continue; }
    if (typeof at !== 'string' || at.length > 40 || isNaN(Date.parse(at)) || ACTIONS.indexOf(action) === -1) return null;
    out.push({ id, handledAt: new Date(Date.parse(at)).toISOString(), action });
  }
  return out;
}
// القرار مقبول؟ التعديل جوه الـ ٢٤ ساعة بعد التنبيه، و«متعالجتش» بعد ما الـ ٢٤ ساعة تخلص بس
export function decisionOk(firstAt: string, d: { handledAt: string | null }, now: number): boolean {
  const first = Date.parse(firstAt);
  if (isNaN(first)) return false;
  if (d.handledAt == null) return now >= first + WINDOW;
  const t = Date.parse(d.handledAt);
  return t >= first && t <= first + WINDOW;
}
// من إمتى نرجّع المشكلات: أول يوم الفترة (YYYY-MM-DD) ناقص يوم لفرق التوقيت، ومش أقدم من مدة الحفظ؛ أي شكل تاني = آخر ٤٥ يوم
export function sinceOf(v: unknown, now: number): string {
  const floor = now - KEEP_DAYS * DAY;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z'))) {
    return new Date(Math.min(now, Math.max(floor, Date.parse(v + 'T00:00:00Z') - DAY))).toISOString();
  }
  return new Date(now - RETURN_DAYS * DAY).toISOString();
}
function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

export async function handleEpisodes(action: string, body: any, origin: string | null): Promise<Response> {
  const acc = await verifyAccount(body, origin);
  if (acc instanceof Response) return acc;
  const base = 'alert_episodes?platform=eq.' + acc.platform + '&account_id=eq.' + encodeURIComponent(acc.id);
  const now = new Date().toISOString();

  if (action === 'episodes.sync') {
    const open = body.open == null ? null : cleanOpen(body.open, acc.platform);
    if (body.open != null && !open) return reply(400, { error: 'open' }, origin);
    if (open) {
      const r = await db(base + '&ended_at=is.null&select=id,ad_id,kind', { method: 'GET' });
      const rows: { id: number; ad_id: string; kind: string }[] = (await r.json().catch(() => null)) || [];
      const want: Record<string, boolean> = {}, have: Record<string, boolean> = {};
      open.forEach((x) => { want[x.ad + '|' + x.kind] = true; });
      const still: number[] = [], gone: number[] = [];
      rows.forEach((row) => { have[row.ad_id + '|' + row.kind] = true; (want[row.ad_id + '|' + row.kind] ? still : gone).push(row.id); });
      for (const ids of chunks(still)) {
        await db(base + '&id=in.(' + ids.join(',') + ')', { method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify({ last_seen_at: now }) });
      }
      for (const ids of chunks(gone)) {
        await db(base + '&id=in.(' + ids.join(',') + ')', { method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify({ ended_at: now }) });
      }
      const fresh = open.filter((x) => !have[x.ad + '|' + x.kind]).map((x) => ({ platform: acc.platform, account_id: acc.id, ad_id: x.ad, kind: x.kind }));
      if (fresh.length) {
        // جهاز تاني سجّل نفس المشكلة في نفس اللحظة: الفهرس الفريد بيرفض الدفعة، فبنسجّل واحدة واحدة ونسيب المكررة
        await db('alert_episodes', { method: 'POST', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(fresh) }).catch(async () => {
          for (const row of fresh) {
            await db('alert_episodes', { method: 'POST', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(row) }).catch(() => null);
          }
        });
      }
    }
    const since = sinceOf(body.since, Date.now());
    const r = await db(base + '&first_at=gte.' + encodeURIComponent(since) +
      '&select=id,ad_id,kind,first_at,ended_at,decided_at,handled_at,action&order=first_at.desc&limit=2000', { method: 'GET' });
    const rows = (await r.json().catch(() => null)) || [];
    return reply(200, {
      episodes: rows.map((x: any) => ({ id: x.id, ad: x.ad_id, kind: x.kind, firstAt: x.first_at, endedAt: x.ended_at,
        decided: !!x.decided_at, handledAt: x.handled_at, action: x.action }))
    }, origin);
  }

  if (action === 'episodes.decide') {
    const list = cleanDecisions(body.decisions);
    if (!list) return reply(400, { error: 'decisions' }, origin);
    const byId: Record<number, { handledAt: string | null; action: string | null }> = {};
    list.forEach((d) => { byId[d.id] = d; });
    const r = await db(base + '&decided_at=is.null&id=in.(' + Object.keys(byId).join(',') + ')&select=id,first_at', { method: 'GET' });
    const rows: { id: number; first_at: string }[] = (await r.json().catch(() => null)) || [];
    const t = Date.now(), none: number[] = [];
    let saved = 0;
    for (const row of rows) {
      const d = byId[row.id];
      if (!d || !decisionOk(row.first_at, d, t)) continue;
      if (d.handledAt == null) { none.push(row.id); continue; }
      await db(base + '&id=eq.' + row.id + '&decided_at=is.null', { method: 'PATCH', headers: { 'prefer': 'return=minimal' },
        body: JSON.stringify({ decided_at: now, handled_at: d.handledAt, action: d.action }) });
      saved++;
    }
    if (none.length) {
      await db(base + '&decided_at=is.null&id=in.(' + none.join(',') + ')', { method: 'PATCH', headers: { 'prefer': 'return=minimal' },
        body: JSON.stringify({ decided_at: now }) });
      saved += none.length;
    }
    return reply(200, { ok: true, saved }, origin);
  }
  return reply(400, { error: 'action' }, origin);
}
