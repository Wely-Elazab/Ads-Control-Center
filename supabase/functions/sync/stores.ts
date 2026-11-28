// المتجر وفريقه — المرحلة ١ (قرارات صاحب المنتج ٢٦–٢٧ نوفمبر ٢٠٢٦: الأداة لصاحب المتجر؛ الأدوار مالك · مدير (بيدير الأعضاء كمان) ·
// مشاهد؛ الدعوة بالبريد فوراً ومن غير حد). التصميم: Live/audit/2026-11-27-team-design.md، والجداول: الترحيل 20261128103849_stores_team.sql.
//
// كل عملية بدخول مكتمل (handler.ts requireLogin)، والدور من قاعدة البيانات في كل طلب — مش من المتصفح (OWASP ASVS، التحكم بالوصول:
// الرفض افتراضياً، ومنع الوصول لكائن غيرك برقمه). متجر مش عضو فيه = «not found» زي المتجر اللي مش موجود (مبنكشفش وجوده).
//   store.list          ← {} → { stores: [{ id, name, role }], canCreate }   المفعّل في التجربة اللي مالوش متجر بيتعمله واحد هو مالكه
//   store.create        ← { name } → { store }                        المفعّل بس (مش «member» — اللي دخل بدعوة)
//   store.rename        ← { store, name }                             المالك والمدير
//   store.team          ← { store } → { people, invites?, audit? }    الكل يشوف الفريق؛ الدعوات والسجل للمالك والمدير
//   store.invite        ← { store, email, role, lang }                المالك والمدير — رسالة برابط صالح ٧ أيام (دعوة مفتوحة لنفس البريد بتتلغي)
//   store.invite.revoke ← { store, id }                               المالك والمدير
//   store.remove        ← { store, user }                             المالك والمدير — مش المالك
//   store.role          ← { store, user, role }                       المالك والمدير — مش المالك
//   store.leave         ← { store }                                   أي عضو غير المالك (المالك بينقل الملكية الأول)
//   store.transfer      ← { store, user }                             المالك بس — لعضو موجود، والمالك القديم بيبقى مدير
//   store.delete        ← { store, name }                             المالك بس — بتأكيد اسم المتجر (كل اللي تحته بيتمسح)
//   store.account       ← { store, platform, accountId, platformToken, loginCustomerId? } → { accounts }   (settings.ts handleStoreAccount)
//                         المالك بس — حساب المتجر في المنصة (واحد لكل منصة — «مثل ثندر»)، بعد ما المنصة نفسها تأكد إنه شايفه.
//                         store.list بيرجّع حسابات كل متجر (accounts: { meta?, snapchat?, google? })
// من غير دخول (الرابط نفسه هو الإثبات — اتبعت لصاحب البريد، زي «نسيت كلمة المرور»):
//   invite.peek         ← { t } → { state, store, role, email }
//   invite.accept       ← { t } → { ok, reset? }   العضوية بتتضاف؛ والبريد اللي مالوش دخول في الأداة بياخد دور «member» ورابط إنشاء
//                         كلمة المرور (reset) — اللي دخل قبل كده بيدخل بكلمة مروره عادي
import { USER_ID, SITE, db, rpc, reply, sendEmail, mailHtml, esc, authAdmin, stripHidden } from './lib.ts';
import { cleanEmail } from './digest.ts';

export type StoreRole = 'owner' | 'manager' | 'viewer';
// الدعوات كانت مقفولة لحد «حسابات المتجر» (قرار صاحب المنتج ٢٨ نوفمبر ٢٠٢٦ — «الأساس الآن والدعوات بعد القائمة»): من غيرها العضو كان بيفتح
// أي حساب عنده صلاحية عليه وهو جوّه المتجر، فحسابات متاجر تانية بتتحسب بإعدادات المتجر وبتتسجّل في سجله ورقمها بيوصل لفريقه. دلوقتي
// المتجر ليه حساب واحد لكل منصة (store_accounts) والخادم مبيقبلش غيره، فاتفتحت. المفتاح فاضل لو احتجنا نقفلها تاني من غير ما نشيل الكود
export const TEAM = { invitesOpen: true };
// المنصات اللي ليها «حساب المتجر» (تيك توك لسه مش متاح في الأداة)
export const STORE_PLATFORMS = ['meta', 'snapchat', 'google'];
const MEMBER_ROLES = ['manager', 'viewer'];
const INVITE_MS = 7 * 86400000, INVITES_PER_HOUR = 20, AUDIT_LIMIT = 30, CLOSED_KEEP_MS = 30 * 86400000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const GET = { method: 'GET' };
const POST = (body: unknown) => ({ method: 'POST', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(body) });
const PATCH = (body: unknown) => ({ method: 'PATCH', headers: { 'prefer': 'return=minimal' }, body: JSON.stringify(body) });
const DELETE = { method: 'DELETE', headers: { 'prefer': 'return=minimal' } };

async function rows(path: string): Promise<any[]> {
  const r = await db(path, GET);
  const j = await r.json().catch(() => null);
  return Array.isArray(j) ? j : [];
}
// اسم المتجر: سطر واحد ١–٨٠ حرف من غير حروف مخفية
export function storeName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = stripHidden(v).replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= 80 ? s : null;
}
function isId(v: unknown): v is string { return typeof v === 'string' && USER_ID.test(v); }
export function canManage(r: StoreRole | null): boolean { return r === 'owner' || r === 'manager'; }

// دور المستخدم في المتجر — أو null (مش عضو، أو رقم غلط، أو المتجر مش موجود)
export async function roleIn(userId: string, storeId: unknown): Promise<StoreRole | null> {
  if (!isId(storeId) || !isId(userId)) return null;
  const s = await rows('stores?id=eq.' + storeId + '&select=owner_id');
  if (!s.length) return null;
  if (s[0].owner_id === userId) return 'owner';
  const m = await rows('store_members?store_id=eq.' + storeId + '&user_id=eq.' + userId + '&select=role');
  return m.length && MEMBER_ROLES.indexOf(m[0].role) > -1 ? m[0].role : null;
}
// متاجر المستخدم: اللي بيملكها (الأقدم الأول) وبعدها اللي هو عضو فيها
export async function storesOf(userId: string): Promise<{ id: string; name: string; role: StoreRole }[]> {
  const own = await rows('stores?owner_id=eq.' + userId + '&select=id,name&order=created_at.asc');
  const mem = await rows('store_members?user_id=eq.' + userId + '&select=role,stores(id,name)&order=created_at.asc');
  return own.map((s) => ({ id: s.id, name: s.name, role: 'owner' as StoreRole }))
    .concat(mem.filter((m) => m.stores && MEMBER_ROLES.indexOf(m.role) > -1).map((m) => ({ id: m.stores.id, name: m.stores.name, role: m.role as StoreRole })));
}
// المتجر اللي الطلب بيتكلم عنه (الإعدادات وسجل «ما حققته»): المبعوت لو عضو فيه — وإلا null؛ ومن غير رقم: أول متجر ليه
export async function storeFor(userId: string, storeId: unknown): Promise<{ id: string; role: StoreRole } | null> {
  if (storeId != null) {
    const r = await roleIn(userId, storeId);
    return r ? { id: storeId as string, role: r } : null;
  }
  const list = await storesOf(userId);
  return list.length ? { id: list[0].id, role: list[0].role } : null;
}
// حسابات المتجر: { meta?: 'act_…', snapchat?: '…', google?: '…' } — واحد لكل منصة (store_accounts). الإعدادات لكل حساب وسجل «ما حققته»
// (settings.ts / episodes.ts) مبيقبلوش غيرها
export async function storeAccounts(storeId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!isId(storeId)) return out;
  (await rows('store_accounts?store_id=eq.' + storeId + '&select=platform,account_id')).forEach((r) => {
    if (STORE_PLATFORMS.indexOf(r.platform) > -1 && typeof r.account_id === 'string') out[r.platform] = r.account_id;
  });
  return out;
}
// حسابات كذا متجر في طلب واحد (store.list)
async function accountsOfStores(ids: string[]): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  ids.forEach((id) => { out[id] = {}; });
  const ok = ids.filter(isId);
  if (!ok.length) return out;
  (await rows('store_accounts?store_id=in.(' + ok.join(',') + ')&select=store_id,platform,account_id')).forEach((r) => {
    if (out[r.store_id] && STORE_PLATFORMS.indexOf(r.platform) > -1 && typeof r.account_id === 'string') out[r.store_id][r.platform] = r.account_id;
  });
  return out;
}
// دور الدخول للأداة: admin / pilot (اتفعّل في التجربة) / member (دخل بدعوة متجر بس)
async function accessRole(email: string): Promise<string | null> {
  const r = await rows('app_access?select=role&email=eq.' + encodeURIComponent(email.toLowerCase()));
  return r.length ? String(r[0].role) : null;
}
export function audit(store: string, actor: string | null, action: string, target?: string | null): Promise<unknown> {
  return db('store_audit', POST({ store_id: store, actor, action, target: target ? target.slice(0, 254) : null })).catch(() => null);
}
// متجر جديد بقيم الأداة. نقل إعدادات المستخدمين الحاليين لمتاجرهم حصل مرة واحدة في الترحيل (20261128103849_stores_team.sql)، فأي متجر
// بيتعمل بعده (مستخدم جديد، أو بعد ما يحذف متجره، أو متجر تاني) بيبدأ فاضي: «حذف المتجر» بيمحي إعداداته فعلاً (من غير ما نسخة السجل
// القديمة ترجعها)، وإعدادات متجر تاني وحساباته ملهاش دعوة بيه
async function createStore(userId: string, name: string): Promise<{ id: string; name: string }> {
  const r = await db('stores', { method: 'POST', headers: { 'prefer': 'return=representation' }, body: JSON.stringify({ owner_id: userId, name }) });
  const s = (await r.json())[0];
  await db('store_settings', POST({ store_id: s.id, settings: { all: {} } }));
  await audit(s.id, userId, 'create');
  return { id: s.id, name: s.name };
}
// اسم أول متجر: اسم النشاط في طلب الانضمام، وإلا «متجري» / «My store»
async function firstName(email: string, en: boolean): Promise<string> {
  const p = await rows('pilot_requests?select=business,lang&email=eq.' + encodeURIComponent(email.toLowerCase()) + '&limit=1');
  return storeName(p.length ? p[0].business : null) || ((p.length ? p[0].lang === 'en' : en) ? 'My store' : 'متجري');
}

// ---------- رمز الدعوة ----------
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function newInviteToken(): string { return b64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function tokenHash(t: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- رسالة الدعوة ----------
const BTN = 'display:inline-block;background:#0E7A63;color:#ffffff;font-weight:700;padding:11px 20px;border-radius:8px;text-decoration:none';
export function inviteMail(store: string, role: string, inviter: string, url: string, en: boolean) {
  const roleName = en ? (role === 'manager' ? 'manager' : 'viewer') : (role === 'manager' ? 'مدير' : 'مشاهد');
  const subject = en ? 'Join the ' + store + ' team on Ads Center' : 'دعوة للانضمام إلى فريق ' + store + ' في Ads Center';
  const btn = '<div style="margin:0 0 16px"><a href="' + esc(url) + '" style="' + BTN + '">' + (en ? 'Accept the invitation' : 'قبول الدعوة') + '</a></div>';
  const lines = en ? [
    'Hello,',
    esc(inviter) + ' invited you to join the <strong>' + esc(store) + '</strong> team on Ads Center as a ' + roleName + '.',
    role === 'manager' ? 'As a manager you change the store\'s alert settings and manage its team.' : 'As a viewer you see the store\'s alert settings and team without changing anything.',
    'To see its ad figures, connect in the tool the platform accounts you have access to.',
    btn,
    'The link works for 7 days.',
    'If you weren\'t expecting this invitation, ignore this email — your address is not added to any store.'
  ] : [
    'مرحباً،',
    'دعاك ' + esc(inviter) + ' للانضمام إلى فريق متجر <strong>' + esc(store) + '</strong> في Ads Center بصفة ' + roleName + '.',
    role === 'manager' ? 'بصفتك مديراً تغيّر إعدادات تنبيهات المتجر وتدير فريقه.' : 'بصفتك مشاهداً تطّلع على إعدادات تنبيهات المتجر وفريقه دون أن تغيّر شيئاً.',
    'ولترى أرقام إعلاناته، اربط في الأداة حسابات المنصات التي لديك صلاحية عليها.',
    btn,
    'الرابط صالح ٧ أيام.',
    'إن لم تكن تتوقع هذه الدعوة، فتجاهل الرسالة؛ لن يُضاف بريدك إلى أي متجر.'
  ];
  return { subject, html: mailHtml(esc(subject), lines, en ? 'en' : 'ar'), text: subject + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n') + '\n\n' + url };
}

// ---------- العمليات بدخول ----------
export async function handleStores(action: string, body: any, user: { id: string; email: string }, origin: string | null): Promise<Response> {
  if (!isId(user.id)) return reply(401, { error: 'login', code: 'LOGIN' }, origin);
  const en = body && body.lang === 'en';

  if (action === 'store.list') {
    let list = await storesOf(user.id);
    const access = await accessRole(user.email);
    const canCreate = access === 'admin' || access === 'pilot';
    // المفعّل في التجربة لازم يبقى له متجر (أول فتح بعد التحديث، أو مستخدم جديد)
    if (!list.length && canCreate) {
      await createStore(user.id, await firstName(user.email, en));
      list = await storesOf(user.id);
    }
    const accounts = await accountsOfStores(list.map((s) => s.id));
    return reply(200, { stores: list.map((s) => ({ ...s, accounts: accounts[s.id] || {} })), canCreate }, origin);
  }
  if (action === 'store.create') {
    const access = await accessRole(user.email);
    if (access !== 'admin' && access !== 'pilot') return reply(403, { error: 'role' }, origin);
    const name = storeName(body && body.name);
    if (!name) return reply(400, { error: 'name' }, origin);
    const s = await createStore(user.id, name);
    return reply(200, { store: { id: s.id, name: s.name, role: 'owner', accounts: {} } }, origin);
  }

  const store = body && body.store;
  const role = await roleIn(user.id, store);
  if (!role) return reply(404, { error: 'store' }, origin);

  if (action === 'store.team') {
    const people = ((await rpc('store_people', { p_store: store })) || []).map((p: any) => ({ id: p.user_id, email: p.email, role: p.role, since: p.since }));
    if (!canManage(role)) return reply(200, { role, people }, origin);
    const invites = (await rows('store_invites?store_id=eq.' + store + '&accepted_at=is.null&revoked_at=is.null&expires_at=gt.' +
      encodeURIComponent(new Date().toISOString()) + '&select=id,email,role,created_at,expires_at&order=created_at.desc'))
      .map((i) => ({ id: i.id, email: i.email, role: i.role, at: i.created_at, expires: i.expires_at }));
    const log = ((await rpc('store_audit_view', { p_store: store, p_limit: AUDIT_LIMIT })) || [])
      .map((a: any) => ({ action: a.action, by: a.actor_email || null, target: a.target || null, at: a.at }));
    return reply(200, { role, people, invites, audit: log, invitesOpen: TEAM.invitesOpen }, origin);
  }
  if (action === 'store.leave') {
    if (role === 'owner') return reply(409, { error: 'owner' }, origin);
    await db('store_members?store_id=eq.' + store + '&user_id=eq.' + user.id, DELETE);
    await audit(store, user.id, 'leave', user.email);
    return reply(200, { ok: true }, origin);
  }
  if (!canManage(role)) return reply(403, { error: 'role' }, origin);

  if (action === 'store.rename') {
    const name = storeName(body.name);
    if (!name) return reply(400, { error: 'name' }, origin);
    await db('stores?id=eq.' + store, PATCH({ name }));
    await audit(store, user.id, 'rename', name);
    return reply(200, { ok: true, name }, origin);
  }
  if (action === 'store.invite') {
    if (!TEAM.invitesOpen) return reply(403, { error: 'invites' }, origin);
    const email = cleanEmail(body.email), inviteRole = body.role;
    if (!email) return reply(400, { error: 'email' }, origin);
    if (MEMBER_ROLES.indexOf(inviteRole) === -1) return reply(400, { error: 'role' }, origin);
    const people = (await rpc('store_people', { p_store: store })) || [];
    if (people.some((p: any) => p.email === email)) return reply(409, { error: 'member' }, origin);
    const now = Date.now();
    // حماية من استخدامنا في إرسال رسائل لأي حد: ٢٠ دعوة في الساعة لكل اللي بيدعي (مش لكل متجر — اللي عنده كذا متجر كان بياخد ٢٠ لكل
    // واحد). ده مش حد لحجم الفريق («فوراً بلا حد»)
    const recent = await rows('store_invites?invited_by=eq.' + user.id + '&created_at=gte.' + encodeURIComponent(new Date(now - 3600000).toISOString()) +
      '&select=id&limit=' + (INVITES_PER_HOUR + 1));
    if (recent.length >= INVITES_PER_HOUR) return reply(429, { error: 'busy' }, origin);
    // دعوة مفتوحة لنفس البريد بتتلغي (الإرسال من جديد = رابط جديد)، والدعوات المقفولة من أكتر من ٣٠ يوم بتتمسح (فيها بريد)
    await db('store_invites?store_id=eq.' + store + '&email=eq.' + encodeURIComponent(email) + '&accepted_at=is.null&revoked_at=is.null',
      PATCH({ revoked_at: new Date(now).toISOString() }));
    const old = encodeURIComponent(new Date(now - CLOSED_KEEP_MS).toISOString());
    await db('store_invites?store_id=eq.' + store + '&or=(accepted_at.lt.' + old + ',revoked_at.lt.' + old + ',expires_at.lt.' + old + ')', DELETE).catch(() => null);
    const t = newInviteToken();
    const r = await db('store_invites', { method: 'POST', headers: { 'prefer': 'return=representation' }, body: JSON.stringify({
      store_id: store, email, role: inviteRole, token_hash: await tokenHash(t), invited_by: user.id, expires_at: new Date(now + INVITE_MS).toISOString() }) });
    const inv = (await r.json())[0];
    const s = await rows('stores?id=eq.' + store + '&select=name');
    const mail = inviteMail(s.length ? s[0].name : '', inviteRole, user.email, SITE + '/invite?t=' + t + (en ? '&lang=en' : ''), en);
    try { await sendEmail(email, mail.subject, mail.html, mail.text); } catch (e) {
      // الرسالة موصلتش: الدعوة بتتلغي عشان متفضلش «مفتوحة» من غير رابط عند حد
      await db('store_invites?id=eq.' + inv.id, PATCH({ revoked_at: new Date().toISOString() })).catch(() => null);
      console.error('invite mail failed', String((e as Error).message || e).slice(0, 160));
      return reply(502, { error: 'mail' }, origin);
    }
    await audit(store, user.id, 'invite', email + ' (' + inviteRole + ')');
    return reply(200, { invite: { id: inv.id, email, role: inviteRole, at: inv.created_at, expires: inv.expires_at } }, origin);
  }
  if (action === 'store.invite.revoke') {
    if (!isId(body.id)) return reply(400, { error: 'id' }, origin);
    const inv = await rows('store_invites?id=eq.' + body.id + '&store_id=eq.' + store + '&accepted_at=is.null&revoked_at=is.null&select=email');
    if (!inv.length) return reply(404, { error: 'invite' }, origin);
    await db('store_invites?id=eq.' + body.id + '&store_id=eq.' + store, PATCH({ revoked_at: new Date().toISOString() }));
    await audit(store, user.id, 'revoke', inv[0].email);
    return reply(200, { ok: true }, origin);
  }
  if (action === 'store.remove' || action === 'store.role') {
    const target = body.user;
    if (!isId(target)) return reply(400, { error: 'user' }, origin);
    const people = (await rpc('store_people', { p_store: store })) || [];
    const p = people.find((x: any) => x.user_id === target);
    if (!p) return reply(404, { error: 'user' }, origin);
    if (p.role === 'owner') return reply(409, { error: 'owner' }, origin);
    if (action === 'store.remove') {
      await db('store_members?store_id=eq.' + store + '&user_id=eq.' + target, DELETE);
      await audit(store, user.id, 'remove', p.email);
      return reply(200, { ok: true }, origin);
    }
    if (MEMBER_ROLES.indexOf(body.role) === -1) return reply(400, { error: 'role' }, origin);
    await db('store_members?store_id=eq.' + store + '&user_id=eq.' + target, PATCH({ role: body.role }));
    await audit(store, user.id, 'role', p.email + ' (' + body.role + ')');
    return reply(200, { ok: true }, origin);
  }
  if (role !== 'owner') return reply(403, { error: 'role' }, origin);

  if (action === 'store.transfer') {
    if (!isId(body.user)) return reply(400, { error: 'user' }, origin);
    const ok = await rpc('store_transfer', { p_store: store, p_from: user.id, p_to: body.user });
    if (ok !== true) return reply(409, { error: 'member' }, origin);
    const people = (await rpc('store_people', { p_store: store })) || [];
    const p = people.find((x: any) => x.user_id === body.user);
    await audit(store, user.id, 'transfer', p ? p.email : null);
    return reply(200, { ok: true }, origin);
  }
  if (action === 'store.delete') {
    const s = await rows('stores?id=eq.' + store + '&select=name');
    const name = storeName(body.name);
    if (!s.length || !name || name !== s[0].name) return reply(400, { error: 'name' }, origin);
    await db('stores?id=eq.' + store + '&owner_id=eq.' + user.id, DELETE);
    return reply(200, { ok: true }, origin);
  }
  return reply(400, { error: 'action' }, origin);
}

// ---------- قبول الدعوة (من غير دخول — الرابط هو الإثبات) ----------
async function openInvite(t: unknown): Promise<{ inv: any; state: 'open' | 'used' | 'expired' | 'gone' }> {
  if (typeof t !== 'string' || !TOKEN_SHAPE.test(t)) return { inv: null, state: 'gone' };
  const r = await rows('store_invites?token_hash=eq.' + (await tokenHash(t)) + '&select=id,store_id,email,role,invited_by,expires_at,accepted_at,revoked_at,stores(name)');
  const inv = r[0] || null;
  if (!inv || inv.revoked_at || !inv.stores) return { inv: null, state: 'gone' };
  if (inv.accepted_at) return { inv, state: 'used' };
  if (Date.parse(inv.expires_at) <= Date.now()) return { inv, state: 'expired' };
  return { inv, state: 'open' };
}
export async function handleInvite(action: string, body: any, origin: string | null): Promise<Response> {
  const { inv, state } = await openInvite(body && body.t);
  if (action === 'invite.peek') {
    if (!inv) return reply(200, { state }, origin);
    return reply(200, { state, store: inv.stores.name, role: inv.role, email: inv.email }, origin);
  }
  if (action !== 'invite.accept') return reply(400, { error: 'action' }, origin);
  if (state !== 'open') return reply(409, { error: state }, origin);
  const email = inv.email;
  // حساب الدخول: لو مش موجود بيتعمل (البريد مأكَّد — الرابط وصل له)، والدخول للأداة لو مالوش: «member»
  let uid: string | null = await rpc('auth_user_id', { p_email: email });
  const fresh = !uid;
  if (!uid) {
    // طلبين في نفس اللحظة: التاني بيلاقي الحساب اتعمل (Supabase بيرد ٤٢٢) — بنقرا تاني بدل ما نقف
    await authAdmin('admin/users', { method: 'POST', body: JSON.stringify({ email, email_confirm: true }) }).catch(() => null);
    uid = await rpc('auth_user_id', { p_email: email });
  }
  if (!isId(uid)) return reply(502, { error: 'account' }, origin);
  const hadAccess = !!(await accessRole(email));
  if (!hadAccess) await db('app_access?on_conflict=email', { method: 'POST', headers: { 'prefer': 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ email, role: 'member' }) });
  // المالك نفسه مبيبقاش عضو (اتدعى ببريده بالغلط): الدعوة بتتقفل من غير عضوية
  const s = await rows('stores?id=eq.' + inv.store_id + '&select=owner_id');
  if (s.length && s[0].owner_id !== uid) {
    await db('store_members?on_conflict=store_id,user_id', { method: 'POST', headers: { 'prefer': 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ store_id: inv.store_id, user_id: uid, role: inv.role, added_by: inv.invited_by }) });
  }
  // مرة واحدة: لو طلبين بنفس الرابط في نفس اللحظة، التاني ملوش أثر زيادة (العضوية «ignore-duplicates»)
  await db('store_invites?id=eq.' + inv.id + '&accepted_at=is.null', PATCH({ accepted_at: new Date().toISOString(), accepted_by: uid }));
  await audit(inv.store_id, uid, 'accept', email);
  // اللي مالوش كلمة مرور (حساب جديد، أو حساب من غير دخول للأداة): رابط إنشائها على طول — زي رسالة «نسيت كلمة المرور» بالظبط
  if (fresh || !hadAccess) {
    const link = await authAdmin('admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'recovery', email }) });
    const hashed = link && ((link.properties && link.properties.hashed_token) || link.hashed_token);
    if (typeof hashed === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(hashed)) return reply(200, { ok: true, reset: hashed }, origin);
  }
  return reply(200, { ok: true }, origin);
}
