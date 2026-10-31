-- الملخص التلقائي لكل مستخدم (قرار صاحب المنتج ٣١ أكتوبر ٢٠٢٦: «اجعلها لكل مستخدم ملخص خاص به، وكل ما هو مناسب مثلهم اجعلها
-- منفصل لكل مستخدم»، و«اجعل الملخص لكل المنصات وليس ميتا فقط»): ملخص واحد لكل حساب دخول في الأداة — بريده ومواعيده ولغته وتوقيته —
-- وقائمة الحسابات الإعلانية اللي اختارها (المرحلة ١: Meta، وبعدها Snapchat وGoogle بنفس الجداول). البصمات («حُلّت/مستمرة») وصلاحية
-- القراءة وسجل الإرسال لكل مستخدم كمان، فمستخدمين على نفس الحساب الإعلاني كل واحد رسائله بإعداداته وعلى بريده.
--
-- الجداول القديمة (digest_settings وalert_marks وprivate.meta_tokens ودوال vault_*) بتفضل زي ما هي: المُشغّل القديم شغّال عليها لحد
-- ما النسخة الجديدة تتنشر وتتأكد، وبعدها بتتشال في ترحيل لوحده. بياناتها اتنسخت هنا لصاحب كل ملخص (digest_settings.user_id).
-- مفيش أرقام إعلانات ولا محتوى رسائل (سياسة الخصوصية، البند ٣)

create table if not exists public.user_digests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  enabled boolean not null default true,
  summary_days smallint[] not null default '{0,3}'
    check (summary_days <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(summary_days) between 2 and 7),
  summary_hour smallint not null default 9 check (summary_hour between 0 and 23),
  timezone text not null check (char_length(timezone) <= 64),   -- مواعيد الملخص وساعات الهدوء بتوقيت المستخدم (أول حساب أضافه)
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  consent_at timestamptz not null,
  consent_version text not null check (char_length(consent_version) <= 40),
  last_summary_until date,
  last_monthly text check (last_monthly is null or last_monthly ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- الحسابات اللي في ملخص المستخدم. checked_at = آخر فحص عاجل للحساب ده عند المستخدم ده (مرة في الساعة)
create table if not exists public.user_digest_accounts (
  user_id uuid not null references public.user_digests (user_id) on delete cascade,
  platform text not null check (platform in ('meta', 'snapchat', 'google', 'tiktok')),
  account_id text not null check (char_length(account_id) between 1 and 64),
  added_at timestamptz not null default now(),
  checked_at timestamptz,
  primary key (user_id, platform, account_id)
);

-- «بصمة» كل تنبيه اتبعت للمستخدم: نوعه والعنصر (رقم مش اسم) وتواريخه
create table if not exists public.user_alert_marks (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'meta' check (platform in ('meta', 'snapchat', 'google', 'tiktok')),
  account_id text not null check (char_length(account_id) between 1 and 64),
  kind text not null check (char_length(kind) <= 40),
  object_id text not null default '' check (char_length(object_id) <= 64),
  first_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times_sent integer not null default 1,
  resolved_at timestamptz,
  last_code text check (char_length(last_code) <= 40),
  primary key (user_id, platform, account_id, kind, object_id)
);

-- صلاحية قراءة Meta لكل مستخدم ولكل حساب (مشفّرة في الدالة بـ TOKEN_ENC_KEY ومربوطة برقم الحساب — زي القديم بالظبط، فالصف القديم
-- اتنسخ من غير فك تشفير). مخطط private مش ظاهر لأي واجهة، والوصول بدوال vault_user_* تحت بس
create table if not exists private.user_meta_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id text not null check (account_id ~ '^act_[0-9]{1,30}$'),
  ciphertext text not null,
  iv text not null,
  key_version smallint not null default 1,
  meta_user_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text check (char_length(last_error) <= 200),
  primary key (user_id, account_id)
);

alter table public.user_digests enable row level security;
alter table public.user_digest_accounts enable row level security;
alter table public.user_alert_marks enable row level security;
alter table private.user_meta_tokens enable row level security;
revoke all on public.user_digests, public.user_digest_accounts, public.user_alert_marks from anon, authenticated;
revoke all on private.user_meta_tokens from public, anon, authenticated;

-- سجل الإرسال لكل مستخدم، والحساب ممكن يبقى من أي منصة (رقم Snapchat مش act_…)
alter table public.send_log add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.send_log drop constraint if exists send_log_account_id_check;
alter table public.send_log add constraint send_log_account_id_check check (char_length(account_id) between 1 and 64);
create index if not exists send_log_user_idx on public.send_log (user_id, sent_at desc);

-- «هل كان التشخيص صحيحاً؟» لكل مستخدم (كانت مشتركة لكل من يفتح الحساب). الجدول فاضي وقت الترحيل (اتأكد ٣١ أكتوبر)
alter table public.feedback add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.feedback drop constraint if exists feedback_view_key_block_since_until_key;
create unique index if not exists feedback_user_view_block on public.feedback (user_id, view_key, block, since, until);

-- ---------- الخزنة: الطريق الوحيد لصلاحيات المستخدمين ----------
create or replace function public.vault_user_put(p_user uuid, p_account text, p_cipher text, p_iv text, p_meta_user text, p_expires timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.user_meta_tokens (user_id, account_id, ciphertext, iv, meta_user_id, expires_at)
  values (p_user, p_account, p_cipher, p_iv, p_meta_user, p_expires)
  on conflict (user_id, account_id) do update
    set ciphertext = excluded.ciphertext, iv = excluded.iv, meta_user_id = excluded.meta_user_id,
        expires_at = excluded.expires_at, updated_at = now(), last_error = null;
$$;
create or replace function public.vault_user_get(p_user uuid, p_account text)
returns table (ciphertext text, iv text, key_version smallint, expires_at timestamptz)
language sql security definer set search_path = '' as $$
  update private.user_meta_tokens set last_used_at = now() where user_id = p_user and account_id = p_account;
  select t.ciphertext, t.iv, t.key_version, t.expires_at from private.user_meta_tokens t where t.user_id = p_user and t.account_id = p_account;
$$;
create or replace function public.vault_user_status(p_user uuid)
returns table (account_id text, expires_at timestamptz, updated_at timestamptz, last_error text)
language sql security definer set search_path = '' as $$
  select t.account_id, t.expires_at, t.updated_at, t.last_error from private.user_meta_tokens t where t.user_id = p_user;
$$;
create or replace function public.vault_user_delete(p_user uuid, p_account text)
returns void language sql security definer set search_path = '' as $$
  delete from private.user_meta_tokens where user_id = p_user and (p_account is null or account_id = p_account);
$$;
create or replace function public.vault_user_mark_error(p_user uuid, p_account text, p_error text)
returns void language sql security definer set search_path = '' as $$
  update private.user_meta_tokens set last_error = left(p_error, 200), updated_at = now() where user_id = p_user and account_id = p_account;
$$;
revoke execute on function public.vault_user_put(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.vault_user_get(uuid, text) from public, anon, authenticated;
revoke execute on function public.vault_user_status(uuid) from public, anon, authenticated;
revoke execute on function public.vault_user_delete(uuid, text) from public, anon, authenticated;
revoke execute on function public.vault_user_mark_error(uuid, text, text) from public, anon, authenticated;
grant execute on function public.vault_user_put(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.vault_user_get(uuid, text) to service_role;
grant execute on function public.vault_user_status(uuid) to service_role;
grant execute on function public.vault_user_delete(uuid, text) to service_role;
grant execute on function public.vault_user_mark_error(uuid, text, text) to service_role;

-- ---------- نسخ البيانات لصاحب كل ملخص ----------
insert into public.user_digests (user_id, email, enabled, summary_days, summary_hour, timezone, lang, consent_at, consent_version,
  last_summary_until, last_monthly, created_at, updated_at)
select d.user_id, d.email, d.enabled, d.summary_days, d.summary_hour, d.timezone, d.lang, d.consent_at, d.consent_version,
  d.last_summary_until, d.last_monthly, d.created_at, d.updated_at
from public.digest_settings d where d.user_id is not null
on conflict (user_id) do nothing;
insert into public.user_digest_accounts (user_id, platform, account_id, added_at, checked_at)
select d.user_id, 'meta', d.account_id, d.created_at, d.checked_at
from public.digest_settings d where d.user_id is not null
on conflict do nothing;
insert into public.user_alert_marks (user_id, platform, account_id, kind, object_id, first_at, last_sent_at, last_seen_at, times_sent, resolved_at, last_code)
select d.user_id, 'meta', m.account_id, m.kind, m.object_id, m.first_at, m.last_sent_at, m.last_seen_at, m.times_sent, m.resolved_at, m.last_code
from public.alert_marks m join public.digest_settings d on d.account_id = m.account_id
where d.user_id is not null
on conflict do nothing;
insert into private.user_meta_tokens (user_id, account_id, ciphertext, iv, key_version, meta_user_id, expires_at, created_at, updated_at, last_used_at, last_error)
select d.user_id, t.account_id, t.ciphertext, t.iv, t.key_version, t.meta_user_id, t.expires_at, t.created_at, t.updated_at, t.last_used_at, t.last_error
from private.meta_tokens t join public.digest_settings d on d.account_id = t.account_id
where d.user_id is not null
on conflict do nothing;
update public.send_log l set user_id = d.user_id
from public.digest_settings d where d.account_id = l.account_id and l.user_id is null and d.user_id is not null;

-- ---------- مدة الاحتفاظ (سياسة الخصوصية، البند ٧) ----------
-- صلاحية انتهت ومتجددتش ٣٠ يوم: الحساب بيخرج من ملخص صاحبه، وملخص من غير حسابات بيتوقف
create or replace function public.purge_expired_tokens()
returns void language sql security definer set search_path = '' as $$
  update public.digest_settings s set enabled = false, updated_at = now()
   where s.enabled and exists (
     select 1 from private.meta_tokens t where t.account_id = s.account_id and t.expires_at < now() - interval '30 days'
   );
  delete from private.meta_tokens where expires_at < now() - interval '30 days';
  delete from public.user_digest_accounts a using private.user_meta_tokens t
   where a.platform = 'meta' and t.user_id = a.user_id and t.account_id = a.account_id and t.expires_at < now() - interval '30 days';
  delete from private.user_meta_tokens where expires_at < now() - interval '30 days';
  update public.user_digests u set enabled = false, updated_at = now()
   where u.enabled and not exists (select 1 from public.user_digest_accounts a where a.user_id = u.user_id);
$$;
revoke execute on function public.purge_expired_tokens() from public, anon, authenticated;

create or replace function public.purge_stale()
returns void
language sql
security definer
set search_path to ''
as $$
  delete from public.feedback f
   where f.updated_at < now() - interval '12 months'
     and not exists (
       select 1 from public.ad_accounts a
        where 'meta:' || a.account_id = f.view_key and a.last_seen >= now() - interval '12 months'
     );
  delete from private.meta_tokens t using public.ad_accounts a
   where a.account_id = t.account_id and a.last_seen < now() - interval '12 months';
  delete from public.digest_settings d using public.ad_accounts a
   where a.account_id = d.account_id and a.last_seen < now() - interval '12 months';
  delete from public.alert_marks m using public.ad_accounts a
   where a.account_id = m.account_id and a.last_seen < now() - interval '12 months';
  delete from public.send_log l using public.ad_accounts a
   where a.account_id = l.account_id and a.last_seen < now() - interval '12 months';
  delete from private.user_meta_tokens t using public.ad_accounts a
   where a.account_id = t.account_id and a.last_seen < now() - interval '12 months';
  delete from public.user_digest_accounts x using public.ad_accounts a
   where x.platform = 'meta' and a.account_id = x.account_id and a.last_seen < now() - interval '12 months';
  delete from public.user_alert_marks m using public.ad_accounts a
   where m.platform = 'meta' and a.account_id = m.account_id and a.last_seen < now() - interval '12 months';
  delete from public.account_settings where used_at < now() - interval '12 months';
  delete from public.user_settings where used_at < now() - interval '12 months';
  delete from public.alert_episodes where first_at < now() - interval '90 days';
  delete from public.ad_accounts where last_seen < now() - interval '12 months';
$$;
revoke execute on function public.purge_stale() from public, anon, authenticated;

-- البصمات اللي اتحلّت من أكتر من ٤٥ يوم (زي الجدول القديم)
select cron.schedule('purge-old-user-marks-daily', '55 3 * * *', $$
  delete from public.user_alert_marks where resolved_at < now() - interval '45 days'
$$);

-- تفضيلات المستخدم في سجل إعداداته (prefs — بتتدمج، مش بتاخد مكان القديمة): عملة الأرقام المجمّعة، وموافقته على ملاحظة سجل لوحة
-- «ما حققته مع الأداة» — كانوا على كل جهاز لوحده، والسجل نفسه لكل مستخدم من ٢٦ أكتوبر
create or replace function public.user_settings_merge(cur jsonb, p_changes jsonb, p_goals jsonb, p_asked boolean)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $$
declare
  k text;
  v jsonb;
  res jsonb := coalesce(cur, '{}'::jsonb);
begin
  if jsonb_typeof(res -> 'all') is distinct from 'object' then res := res || '{"all": {}}'::jsonb; end if;
  for k, v in select key, value from jsonb_each(coalesce(p_changes, '{}'::jsonb)) loop
    if k = 'all' then
      if jsonb_typeof(v) = 'object' then res := jsonb_set(res, '{all}', v); end if;
    elsif k = 'prefs' then
      if jsonb_typeof(v) = 'object' then
        res := jsonb_set(res, '{prefs}', (case when jsonb_typeof(res -> 'prefs') = 'object' then res -> 'prefs' else '{}'::jsonb end) || v);
      end if;
    elsif jsonb_typeof(v) = 'object' then
      if jsonb_typeof(res -> 'plat') is distinct from 'object' then res := res || '{"plat": {}}'::jsonb; end if;
      res := jsonb_set(res, array['plat', k], v);
    elsif jsonb_typeof(v) = 'null' then
      res := res #- array['plat', k];
    end if;
  end loop;
  if jsonb_typeof(p_goals) = 'object' then res := jsonb_set(res, '{all}', (res -> 'all') || p_goals); end if;
  if p_asked then res := res || '{"asked": true}'::jsonb; end if;
  if res -> 'plat' = '{}'::jsonb then res := res - 'plat'; end if;
  return res;
end;
$$;
revoke execute on function public.user_settings_merge(jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.user_settings_merge(jsonb, jsonb, jsonb, boolean) to service_role;
