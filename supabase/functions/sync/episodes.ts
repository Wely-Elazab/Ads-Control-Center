// سجل مشكلات التنبيه لكل متجر على كل حساب إعلاني (لوحة «ما حققته مع الأداة» — قرار صاحب المنتج ٢٥ أكتوبر ٢٠٢٦: «سجل على
// خادمنا… وحدث سياسة الخصوصية»). صف لكل مشكلة على إعلان (جدول alert_episodes): من أول ما الأداة نبّهت عليها لحد ما اختفت، ونوع
// التعديل اللي اتعمل بعدها ووقته. كان لكل مستخدم (٢٦ أكتوبر — الإعدادات كانت لكل مستخدم)، ومن ٢٧ نوفمبر ٢٠٢٦ للمتجر كله (الإعدادات بقت
// للمتجر، فالتنبيهات واحدة لصاحبه وفريقه — stores.ts)، بالشرطين: دخول الأداة وعضوية المتجر، ومفتاح المنصة بيثبت إن صاحبه شايف الحساب.
//
// ثلاثة أرقام (قرارات صاحب المنتج ٢٦ نوفمبر ٢٠٢٦ — «مشكلات رصدناها · وفّرته بعد تنبيه Ads Center · ضاع قبل التصرّف»):
//  - Meta وSnapchat وGoogle (كان القسم بيحسب منصتين بس — التدقيق الشامل ١٣٢)
//  - التصرّف بيتسجّل في أي وقت بعد التنبيه والمشكلة لسه قايمة (مش في الـ ٢٤ ساعة بس): «لم تُعالج بعد» مش قرار نهائي
//  - السجل بيفضل طول عمر حساب العميل، ومبالغ كل مشكلة بتتحفظ هنا بعد ما أيامها تكمل: ما وفّره العميل بعد تصرّفه، وما ضاع قبله —
//    رقمين بس بعملة الحساب (اللي بتتسجّل مع المشكلة). الخسارة اليومية وقت التنبيه (baseline_daily) مبقتش بتتحفظ من ٢٧ نوفمبر ٢٠٢٦:
//    «وفّرته» بقى من الأيام قبل التصرّف (قرار صاحب المنتج)، فمبقاش ليها لازمة — والعمود فاضي من غير ما يتمسح (مفيش صف فيه قيمة)
//
//   episodes.sync    ← { platform, accountId, platformToken, open: [{ ad, kind, cur? }] | null } → { episodes }
//                       open = مشكلات الحساب دلوقتي (الأداة شايفة أرقامه كاملة): الجديد بيتسجّل (ومعاه عملة الحساب لو اتبعتت)،
//                       والقديم اللي اختفى بيخلص. null = قراءة بس (قبل موافقة المستخدم). المشكلات كلها من أول يوم (اللوحة بتحسب
//                       الفترة المختارة والإجمالي من أول ما بدأ). «daily» من جهاز قديم بيتجاهل
//   episodes.decide  ← { …, decisions: [{ id, handledAt | null, action | null }] } → { ok, saved }
//                       التصرّف (وقته ونوعه) بعد التنبيه والمشكلة قايمة — مرة واحدة، وبيتسجّل حتى لو المشكلة اتقال عليها قبل كده
//                       «لم تُعالج بعد». وnull = لسه مفيش تصرّف (بعد يوم من التنبيه)
//   episodes.amounts ← { …, amounts: [{ id, saved, lost, cur }] } → { ok, saved }   («daily» من جهاز قديم بيتجاهل)
//                       مبالغ المشكلة بعد ما أيامها تكمل (اتعالجت من ٨ أيام أو أكتر، أو خلصت من غير تصرّف من يوم أو أكتر) — مرة واحدة
import { USER_ID, db, reply } from './lib.ts';
import { verifyAccount } from './settings.ts';
import { storeFor, storeAccounts } from './stores.ts';

const AD_ID: Record<string, RegExp> = { meta: /^\d{1,30}$/, snapchat: /^[A-Za-z0-9-]{1,64}$/, google: /^\d{1,30}$/ };
const KINDS = ['waste', 'loss'];
const ACTIONS = ['pause', 'budget', 'targeting', 'creative', 'bid'];
const CURRENCY = /^[A-Z]{3}$/;
const MAX_OPEN = 500, MAX_DECIDE = 100, MAX_AMOUNTS = 100, CHUNK = 150, MAX_ROWS = 5000;
const DAY = 86400000, SKEW = 5 * 60000, MAX_MONEY = 1e11;
// المشكلة اللي اتعالجت: ٧ أيام توفير كاملة بعد يوم التصرّف = ٨ أيام من وقته. واللي خلصت من غير تصرّف: يوم آخرها لازم يكمل
const FINAL_HANDLED = 8 * DAY, FINAL_ENDED = DAY;

// مبلغ صالح: رقم موجب أقل من الحد، لأقرب قرش — وإلا null
export function moneyOf(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) && v >= 0 && v < MAX_MONEY ? Math.round(v * 100) / 100 : null;
}
// مشكلات الحساب دلوقتي: إعلان ونوع معروفين، من غير تكرار. أي شكل تاني = null (الطلب بيترفض بدل ما يخلّص مشكلات بالغلط).
// العملة اختيارية (الأجهزة القديمة مبتبعتهاش) — قيمة غلط بتتشال بس، مبترفضش الطلب. وأي «daily» بيتجاهل (مبقتش بتتحفظ)
export type OpenProblem = { ad: string; kind: string; cur: string | null };
export function cleanOpen(v: unknown, platform: string): OpenProblem[] | null {
  if (!Array.isArray(v) || v.length > MAX_OPEN || !AD_ID[platform]) return null;
  const seen: Record<string, boolean> = {}, out: OpenProblem[] = [];
  for (const x of v) {
    const ad = x && (x as any).ad, kind = x && (x as any).kind;
    if (typeof ad !== 'string' || !AD_ID[platform].test(ad) || KINDS.indexOf(kind) === -1) return null;
    if (seen[ad + '|' + kind]) continue;
    seen[ad + '|' + kind] = true;
    const rawCur = (x as any).cur;
    out.push({ ad, kind, cur: typeof rawCur === 'string' && CURRENCY.test(rawCur) ? rawCur : null });
  }
  return out;
}
// القرارات: رقم صف، ووقت ونوع التعديل مع بعض أو ولا واحد (= لسه مفيش تصرّف)
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
// القرار مقبول؟ التصرّف بعد التنبيه، ومش في المستقبل، وقبل ما المشكلة تخلص (بعد ما اختفت مبقاش ردّ على التنبيه)؛
// و«لسه مفيش تصرّف» بعد يوم من التنبيه بس
export function decisionOk(firstAt: string, d: { handledAt: string | null }, now: number, endedAt?: string | null): boolean {
  const first = Date.parse(firstAt);
  if (isNaN(first)) return false;
  if (d.handledAt == null) return now >= first + DAY;
  const t = Date.parse(d.handledAt);
  if (!(t >= first) || t > now + SKEW) return false;
  const end = endedAt ? Date.parse(endedAt) : NaN;
  return isNaN(end) || t <= end;
}
// المبالغ: رقم صف، والموفَّر والضايع والعملة. أي غلط = رفض الطلب كله. و«daily» من جهاز قديم بيتجاهل (مبقتش بتتحفظ)
export type EpisodeAmount = { id: number; saved: number; lost: number; cur: string };
export function cleanAmounts(v: unknown): EpisodeAmount[] | null {
  if (!Array.isArray(v) || !v.length || v.length > MAX_AMOUNTS) return null;
  const out: EpisodeAmount[] = [];
  for (const x of v) {
    const id = x && (x as any).id, cur = x && (x as any).cur;
    const saved = moneyOf(x && (x as any).saved), lost = moneyOf(x && (x as any).lost);
    if (!Number.isSafeInteger(id) || id <= 0 || saved == null || lost == null || typeof cur !== 'string' || !CURRENCY.test(cur)) return null;
    out.push({ id, saved, lost, cur });
  }
  return out;
}
// أيام المشكلة كملت؟ اتعالجت من ٨ أيام أو أكتر، أو خلصت من غير تصرّف من يوم أو أكتر. غير كده المبلغ لسه بيتغيّر — مبيتحفظش
export function amountsFinal(row: { handled_at: string | null; ended_at: string | null }, now: number): boolean {
  if (row.handled_at) return now >= Date.parse(row.handled_at) + FINAL_HANDLED;
  return !!row.ended_at && now >= Date.parse(row.ended_at) + FINAL_ENDED;
}
function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}
function numOrNull(v: unknown): number | null { return v == null ? null : (isFinite(Number(v)) ? Number(v) : null); }
const GET = { method: 'GET' };
const PATCH = (body: unknown) => ({ method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(body) });

// السجل للمتجر كله من ٢٧ نوفمبر ٢٠٢٦ (المتجر وفريقه — stores.ts): اللي يفتح الأداة من الفريق (أي دور) بيسجّل في سجل المتجر اللي فاتحه، فصاحب
// المتجر بيشوف اللي عمله فريقه بعد التنبيه. user_id = مين سجّلها. body.store = المتجر (من غيره: أول متجر ليه — الصفحات القديمة)
export async function handleEpisodes(action: string, body: any, userId: string, origin: string | null): Promise<Response> {
  if (typeof userId !== 'string' || !USER_ID.test(userId)) return reply(401, { error: 'login', code: 'LOGIN' }, origin);
  const store = await storeFor(userId, body && body.store);
  if (!store) return reply(404, { error: 'store' }, origin);
  const acc = await verifyAccount(body, origin);
  if (acc instanceof Response) return acc;
  // حساب المتجر في المنصة بس («مثل ثندر» — ٢٨ نوفمبر ٢٠٢٦): حساب متجر تاني عند عضو مبيتسجّلش في سجل المتجر ده ولا بيتقري منه
  if ((await storeAccounts(store.id))[acc.platform] !== acc.id) return reply(409, { error: 'account' }, origin);
  const base = 'alert_episodes?store_id=eq.' + store.id + '&platform=eq.' + acc.platform + '&account_id=eq.' + encodeURIComponent(acc.id);
  const now = new Date().toISOString();

  if (action === 'episodes.sync') {
    const open = body.open == null ? null : cleanOpen(body.open, acc.platform);
    if (body.open != null && !open) return reply(400, { error: 'open' }, origin);
    if (open) {
      const r = await db(base + '&ended_at=is.null&select=id,ad_id,kind', GET);
      const rows: { id: number; ad_id: string; kind: string }[] = (await r.json().catch(() => null)) || [];
      const want: Record<string, boolean> = {}, have: Record<string, boolean> = {};
      open.forEach((x) => { want[x.ad + '|' + x.kind] = true; });
      const still: number[] = [], gone: number[] = [];
      rows.forEach((row) => { have[row.ad_id + '|' + row.kind] = true; (want[row.ad_id + '|' + row.kind] ? still : gone).push(row.id); });
      for (const ids of chunks(still)) await db(base + '&id=in.(' + ids.join(',') + ')', PATCH({ last_seen_at: now }));
      for (const ids of chunks(gone)) await db(base + '&id=in.(' + ids.join(',') + ')', PATCH({ ended_at: now }));
      const fresh = open.filter((x) => !have[x.ad + '|' + x.kind]).map((x) => {
        const row: Record<string, unknown> = { store_id: store.id, user_id: userId, platform: acc.platform, account_id: acc.id, ad_id: x.ad, kind: x.kind };
        if (x.cur) row.amount_currency = x.cur;
        return row;
      });
      if (fresh.length) {
        // جهاز تاني سجّل نفس المشكلة في نفس اللحظة: الفهرس الفريد بيرفض الدفعة، فبنسجّل واحدة واحدة ونسيب المكررة
        await db('alert_episodes', { method: 'POST', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(fresh) }).catch(async () => {
          for (const row of fresh) {
            await db('alert_episodes', { method: 'POST', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(row) }).catch(() => null);
          }
        });
      }
    }
    const r = await db(base + '&select=id,ad_id,kind,first_at,ended_at,decided_at,handled_at,action,amount_currency,saved_amount,lost_amount,amounts_at' +
      '&order=first_at.desc&limit=' + MAX_ROWS, GET);
    const rows = (await r.json().catch(() => null)) || [];
    return reply(200, {
      episodes: rows.map((x: any) => ({ id: x.id, ad: x.ad_id, kind: x.kind, firstAt: x.first_at, endedAt: x.ended_at,
        decided: !!x.decided_at, handledAt: x.handled_at, action: x.action, cur: x.amount_currency || null,
        saved: numOrNull(x.saved_amount), lost: numOrNull(x.lost_amount), amountsAt: x.amounts_at || null }))
    }, origin);
  }

  if (action === 'episodes.decide') {
    const list = cleanDecisions(body.decisions);
    if (!list) return reply(400, { error: 'decisions' }, origin);
    const byId: Record<number, { handledAt: string | null; action: string | null }> = {};
    list.forEach((d) => { byId[d.id] = d; });
    const r = await db(base + '&id=in.(' + Object.keys(byId).join(',') + ')&select=id,first_at,ended_at,decided_at,handled_at', GET);
    const rows: { id: number; first_at: string; ended_at: string | null; decided_at: string | null; handled_at: string | null }[] = (await r.json().catch(() => null)) || [];
    const t = Date.now(), none: number[] = [];
    let saved = 0;
    for (const row of rows) {
      const d = byId[row.id];
      if (!d) continue;
      if (d.handledAt == null) {
        if (!row.decided_at && decisionOk(row.first_at, d, t)) none.push(row.id);
        continue;
      }
      // التصرّف مرة واحدة — حتى لو اتقال قبل كده «لسه مفيش تصرّف» (decided_at من غير handled_at)
      if (row.handled_at || !decisionOk(row.first_at, d, t, row.ended_at)) continue;
      await db(base + '&id=eq.' + row.id + '&handled_at=is.null', PATCH({ decided_at: now, handled_at: d.handledAt, action: d.action }));
      saved++;
    }
    if (none.length) {
      await db(base + '&decided_at=is.null&id=in.(' + none.join(',') + ')', PATCH({ decided_at: now }));
      saved += none.length;
    }
    return reply(200, { ok: true, saved }, origin);
  }

  if (action === 'episodes.amounts') {
    const list = cleanAmounts(body.amounts);
    if (!list) return reply(400, { error: 'amounts' }, origin);
    const byId: Record<number, EpisodeAmount> = {};
    list.forEach((a) => { byId[a.id] = a; });
    const r = await db(base + '&amounts_at=is.null&id=in.(' + Object.keys(byId).join(',') + ')&select=id,handled_at,ended_at,amount_currency', GET);
    const rows: { id: number; handled_at: string | null; ended_at: string | null; amount_currency: string | null }[] = (await r.json().catch(() => null)) || [];
    const t = Date.now();
    let saved = 0;
    for (const row of rows) {
      const a = byId[row.id];
      // أيامها لسه بتتحسب، أو عملة غير عملتها وقت التنبيه = مبيتحفظش
      if (!a || !amountsFinal(row, t) || (row.amount_currency && row.amount_currency !== a.cur)) continue;
      const patch: Record<string, unknown> = { saved_amount: a.saved, lost_amount: a.lost, amount_currency: a.cur, amounts_at: now };
      await db(base + '&id=eq.' + row.id + '&amounts_at=is.null', PATCH(patch));
      saved++;
    }
    return reply(200, { ok: true, saved }, origin);
  }
  return reply(400, { error: 'action' }, origin);
}
