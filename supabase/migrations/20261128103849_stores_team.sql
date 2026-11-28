-- المتجر وفريقه — المرحلة ١ (قرارات صاحب المنتج ٢٦–٢٧ نوفمبر ٢٠٢٦: الأداة لصاحب المتجر؛ الأدوار مالك · مدير (بيدير الأعضاء كمان) ·
-- مشاهد؛ الدعوة بالبريد فوراً ومن غير حد). التصميم: Live/audit/2026-11-27-team-design.md. إضافة بس — الكود القديم بيفضل شغال بعدها
-- لحد ما الجديد يتنشر (سجل المشكلات بيتربط بمتجر صاحبه تلقائياً لو اتسجّل من غير متجر).

-- ١) الدخول: «member» = دخل بدعوة متجر (من غير تفعيل التجربة) — مبيعملش متجر لنفسه لحد ما يتفعّل
alter table public.app_access drop constraint app_access_role_check;
alter table public.app_access add constraint app_access_role_check check (role in ('admin', 'pilot', 'member'));

-- ٢) المتجر: المالك عمود (حذف حساب دخوله = حذف المتجر وكل ما تحته)، ونقل الملكية = تغييره
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index stores_owner on public.stores (owner_id);

-- ٣) الأعضاء غير المالك
create table public.store_members (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('manager', 'viewer')),
  added_by uuid,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_members_user on public.store_members (user_id);

-- ٤) الدعوات: الرمز نفسه مبيتحفظش (بصمته SHA-256 بس)، صالحة ٧ أيام، ودعوة مفتوحة واحدة لكل بريد في المتجر
create table public.store_invites (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  role text not null check (role in ('manager', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create unique index store_invites_open on public.store_invites (store_id, email) where accepted_at is null and revoked_at is null;

-- ٥) إعدادات التنبيهات للمتجر كله (نفس شكل سجل المستخدم: all / plat / acct) — التفضيلات الشخصية (العملة والموافقة و«شاف نافذة أول
-- مرة») بتفضل في user_settings
create table public.store_settings (
  store_id uuid primary key references public.stores (id) on delete cascade,
  settings jsonb not null default '{"all": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ٦) سجل تغييرات الفريق: من دعا ومن أزال ومن غيّر الدور ومتى — بيتمسح مع المتجر بس
create table public.store_audit (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  actor uuid,
  action text not null check (action in ('create', 'rename', 'invite', 'revoke', 'accept', 'remove', 'role', 'leave', 'transfer', 'settings')),
  target text check (char_length(target) <= 254),
  at timestamptz not null default now()
);
create index store_audit_store on public.store_audit (store_id, at desc);

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.store_invites enable row level security;
alter table public.store_settings enable row level security;
alter table public.store_audit enable row level security;
revoke all on public.stores, public.store_members, public.store_invites, public.store_settings, public.store_audit from anon, authenticated;

-- ٧) حفظ إعدادات المتجر وهو مقفول — نفس دمج سجل المستخدم (user_settings_merge)، من غير التفضيلات الشخصية ولا asked
create or replace function public.store_settings_apply(p_store uuid, p_base jsonb, p_changes jsonb, p_goals jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  cur jsonb;
begin
  insert into public.store_settings (store_id, settings) values (p_store, coalesce(p_base - 'prefs' - 'asked', '{"all": {}}'::jsonb))
    on conflict (store_id) do nothing;
  select settings into cur from public.store_settings where store_id = p_store for update;
  cur := public.user_settings_merge(cur, coalesce(p_changes, '{}'::jsonb) - 'prefs', p_goals, false);
  update public.store_settings set settings = cur, updated_at = now() where store_id = p_store;
  return cur;
end;
$$;
revoke execute on function public.store_settings_apply(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.store_settings_apply(uuid, jsonb, jsonb, jsonb) to service_role;

-- ٨) سجل «ما حققته» بالمتجر: user_id بقى «مين سجّلها» (حذف حسابه مبيمسحش سجل المتجر)، والمشكلة المفتوحة واحدة لكل متجر
alter table public.alert_episodes add column store_id uuid references public.stores (id) on delete cascade;
alter table public.alert_episodes alter column user_id drop not null;
alter table public.alert_episodes drop constraint alert_episodes_user_id_fkey;
alter table public.alert_episodes add constraint alert_episodes_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;
create unique index alert_episodes_store_open on public.alert_episodes (store_id, platform, account_id, ad_id, kind) where ended_at is null and store_id is not null;
create index alert_episodes_store on public.alert_episodes (store_id, platform, account_id, first_at desc);

-- مشكلة اتسجّلت من غير متجر (كود قبل النشر، أو أي مسار ينساه): بتتربط بأقدم متجر يملكه اللي سجّلها
create or replace function public.alert_episodes_store_default()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.store_id is null and new.user_id is not null then
    select id into new.store_id from public.stores where owner_id = new.user_id order by created_at limit 1;
  end if;
  return new;
end;
$$;
create trigger alert_episodes_store_default before insert on public.alert_episodes
  for each row execute function public.alert_episodes_store_default();

-- ٨ب) الفريق بالبريد (الخادم بس — الأدوار العامة ممنوعة): المالك والأعضاء ببريد حسابات دخولهم، وسجل التغييرات ببريد اللي عملها
create or replace function public.store_people(p_store uuid)
returns table (user_id uuid, email text, role text, since timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select s.owner_id, lower(u.email), 'owner'::text, s.created_at from public.stores s join auth.users u on u.id = s.owner_id where s.id = p_store
  union all
  select m.user_id, lower(u.email), m.role, m.created_at from public.store_members m join auth.users u on u.id = m.user_id where m.store_id = p_store
$$;
revoke execute on function public.store_people(uuid) from public, anon, authenticated;
grant execute on function public.store_people(uuid) to service_role;

create or replace function public.store_audit_view(p_store uuid, p_limit int)
returns table (action text, actor_email text, target text, at timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select a.action, lower(u.email), a.target, a.at from public.store_audit a left join auth.users u on u.id = a.actor
  where a.store_id = p_store order by a.at desc limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;
revoke execute on function public.store_audit_view(uuid, int) from public, anon, authenticated;
grant execute on function public.store_audit_view(uuid, int) to service_role;

-- ٨ج) نقل الملكية مرة واحدة (كله أو ولا حاجة): المالك الجديد لازم يكون عضو، وبيخرج من الأعضاء، والمالك القديم بيبقى مدير
create or replace function public.store_transfer(p_store uuid, p_from uuid, p_to uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform 1 from public.stores where id = p_store and owner_id = p_from for update;
  if not found or p_from = p_to then return false; end if;
  delete from public.store_members where store_id = p_store and user_id = p_to;
  if not found then return false; end if;
  update public.stores set owner_id = p_to where id = p_store;
  insert into public.store_members (store_id, user_id, role, added_by) values (p_store, p_from, 'manager', p_from)
    on conflict (store_id, user_id) do update set role = 'manager';
  return true;
end;
$$;
revoke execute on function public.store_transfer(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.store_transfer(uuid, uuid, uuid) to service_role;

-- ٩) الملخص بالبريد: كل حساب فيه تابع لمتجر (إعدادات التنبيهات منه)
alter table public.user_digest_accounts add column store_id uuid references public.stores (id) on delete set null;

-- ١٠) المستخدمين الحاليين: متجر لكل واحد عنده دخول، هو مالكه — اسمه من اسم النشاط في طلب انضمامه، وإلا «متجري»؛ وإعداداته لكل حساب
-- إعلاني بتتنسخ لمتجره (نسخة سجله بتفضل لحد ترحيل التنظيف)؛ وسجل مشكلاته وحسابات ملخصه بتتربط بمتجره. مفيش حاجة بتتمسح
insert into public.stores (owner_id, name)
select u.id, coalesce(nullif(btrim(left(p.business, 80)), ''), case when p.lang = 'en' then 'My store' else 'متجري' end)
from auth.users u
join public.app_access a on a.email = lower(u.email)
left join public.pilot_requests p on p.email = lower(u.email);

insert into public.store_settings (store_id, settings, updated_at)
select s.id, (us.settings - 'prefs' - 'asked'), us.updated_at
from public.stores s join public.user_settings us on us.user_id = s.owner_id;

update public.alert_episodes e set store_id = s.id from public.stores s where s.owner_id = e.user_id and e.store_id is null;
update public.user_digest_accounts d set store_id = s.id from public.stores s where s.owner_id = d.user_id and d.store_id is null;

insert into public.store_audit (store_id, actor, action) select id, owner_id, 'create' from public.stores;

-- ١١) الاحتفاظ (سياسة الخصوصية، البند ٧): الدعوة لازمة لحد ما تتقفل (تتقبل أو تتلغي أو تنتهي) — بتفضل ٣٠ يوم بعدها عشان اللي يفتح
-- الرابط تاني يشوف «اتقبلت» أو «انتهت» بدل «غير صالح»، وبعدين تتمسح (فيها بريد المدعو). وسجل تغييرات الفريق (الأداة بتعرض آخر ٣٠ بس)
-- → ١٢ شهر. يومياً مش مع purge_stale (شهرية) — عشان المدة المكتوبة في السياسة تبقى هي الحقيقية
create or replace function public.purge_store_data()
returns void
language sql
security definer
set search_path to ''
as $$
  delete from public.store_invites
   where accepted_at < now() - interval '30 days' or revoked_at < now() - interval '30 days' or expires_at < now() - interval '30 days';
  delete from public.store_audit where at < now() - interval '12 months';
$$;
revoke execute on function public.purge_store_data() from public, anon, authenticated;
select cron.schedule('purge-store-data-daily', '41 3 * * *', $$select public.purge_store_data()$$);
