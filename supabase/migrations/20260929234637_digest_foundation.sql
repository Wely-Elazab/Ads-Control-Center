-- الملخص والتنبيهات التلقائية بالبريد (اختيارية، لحسابات Meta بس) — الأساس
--
-- مفاتيح Meta المشفّرة في مخطط private: مش ظاهر لأي واجهة (Data API بتعرض public بس)، ومسحوب منه كل الصلاحيات.
-- الوصول الوحيد: دوال vault_* تحت (SECURITY DEFINER) ومسموحة لـ service_role بس — يعني دالة sync.
-- التشفير نفسه (AES-256-GCM) بيحصل جوه الدالة بمفتاح TOKEN_ENC_KEY اللي في أسرار الدوال، مش هنا:
-- لو حد وصل لقاعدة البيانات كلها، معاه نص مشفّر بس.
--
-- مفيش هنا محتوى ملخصات ولا أرقام إعلانات (سياسة الخصوصية، البند ٣).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.meta_tokens (
  account_id text primary key check (account_id ~ '^act_[0-9]{1,30}$'),
  ciphertext text not null,              -- AES-256-GCM، base64 — مربوط برقم الحساب (additional data) فمينفعش يتنقل لصف تاني
  iv text not null,                      -- ١٢ بايت عشوائية لكل تشفير، base64
  key_version smallint not null default 1,
  meta_user_id text,                     -- رقم صاحب الصلاحية عند Meta (خاص بتطبيقنا) — مش اسمه
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text check (char_length(last_error) <= 200)
);
alter table private.meta_tokens enable row level security;
revoke all on private.meta_tokens from public, anon, authenticated;

-- إعدادات الملخص لكل حساب. الأيام: ٠ = الأحد … ٦ = السبت (يومين على الأقل). الساعة بتوقيت الحساب
create table public.digest_settings (
  account_id text primary key check (account_id ~ '^act_[0-9]{1,30}$'),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  enabled boolean not null default true,
  summary_days smallint[] not null default '{0,3}'
    check (summary_days <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(summary_days) between 2 and 7),
  summary_hour smallint not null default 9 check (summary_hour between 0 and 23),
  timezone text not null check (char_length(timezone) <= 64),
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  consent_at timestamptz not null,
  consent_version text not null check (char_length(consent_version) <= 40),
  last_summary_until date,               -- آخر يوم غطّاه آخر ملخص (اللي بعده بيبدأ من اليوم التالي)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- «بصمة» كل تنبيه: نوعه والعنصر المعني (رقم مش اسم) وتواريخه — عشان منكررش التنبيه ونتابع «حُلّت / مستمرة»
create table public.alert_marks (
  account_id text not null check (account_id ~ '^act_[0-9]{1,30}$'),
  kind text not null check (char_length(kind) <= 40),
  object_id text not null default '' check (char_length(object_id) <= 64),
  first_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  times_sent integer not null default 1,
  resolved_at timestamptz,
  primary key (account_id, kind, object_id)
);

-- سجل الإرسال: الوقت والحالة بس
create table public.send_log (
  id bigint generated always as identity primary key,
  account_id text not null check (account_id ~ '^act_[0-9]{1,30}$'),
  type text not null check (type in ('urgent', 'summary', 'reminder', 'enabled', 'disabled', 'expiry')),
  sent_at timestamptz not null default now(),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text check (char_length(provider_id) <= 80),
  error text check (char_length(error) <= 200)
);
create index send_log_account_idx on public.send_log (account_id, sent_at desc);

alter table public.digest_settings enable row level security;
alter table public.alert_marks enable row level security;
alter table public.send_log enable row level security;
revoke all on public.digest_settings, public.alert_marks, public.send_log from anon, authenticated;

-- ---------- الخزنة: الطريق الوحيد لجدول المفاتيح ----------
create function public.vault_put_token(p_account text, p_cipher text, p_iv text, p_user text, p_expires timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.meta_tokens (account_id, ciphertext, iv, meta_user_id, expires_at)
  values (p_account, p_cipher, p_iv, p_user, p_expires)
  on conflict (account_id) do update
    set ciphertext = excluded.ciphertext, iv = excluded.iv, meta_user_id = excluded.meta_user_id,
        expires_at = excluded.expires_at, updated_at = now(), last_error = null;
$$;

create function public.vault_get_token(p_account text)
returns table (ciphertext text, iv text, key_version smallint, expires_at timestamptz)
language sql security definer set search_path = '' as $$
  update private.meta_tokens set last_used_at = now() where account_id = p_account;
  select t.ciphertext, t.iv, t.key_version, t.expires_at from private.meta_tokens t where t.account_id = p_account;
$$;

create function public.vault_token_status(p_account text)
returns table (expires_at timestamptz, updated_at timestamptz, last_error text)
language sql security definer set search_path = '' as $$
  select t.expires_at, t.updated_at, t.last_error from private.meta_tokens t where t.account_id = p_account;
$$;

create function public.vault_delete_token(p_account text)
returns void language sql security definer set search_path = '' as $$
  delete from private.meta_tokens where account_id = p_account;
$$;

create function public.vault_mark_error(p_account text, p_error text)
returns void language sql security definer set search_path = '' as $$
  update private.meta_tokens set last_error = left(p_error, 200), updated_at = now() where account_id = p_account;
$$;

revoke execute on function public.vault_put_token(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.vault_get_token(text) from public, anon, authenticated;
revoke execute on function public.vault_token_status(text) from public, anon, authenticated;
revoke execute on function public.vault_delete_token(text) from public, anon, authenticated;
revoke execute on function public.vault_mark_error(text, text) from public, anon, authenticated;
grant execute on function public.vault_put_token(text, text, text, text, timestamptz) to service_role;
grant execute on function public.vault_get_token(text) to service_role;
grant execute on function public.vault_token_status(text) to service_role;
grant execute on function public.vault_delete_token(text) to service_role;
grant execute on function public.vault_mark_error(text, text) to service_role;

-- ---------- مدة الاحتفاظ (سياسة الخصوصية، البند ٧) ----------
-- المفتاح اللي انتهت صلاحيته ومتجددش خلال ٣٠ يوم بيتمسح، والملخص بيتوقف لحد ما العميل يفعّله تاني
create function public.purge_expired_tokens()
returns void language sql security definer set search_path = '' as $$
  update public.digest_settings s set enabled = false, updated_at = now()
   where s.enabled and exists (
     select 1 from private.meta_tokens t where t.account_id = s.account_id and t.expires_at < now() - interval '30 days'
   );
  delete from private.meta_tokens where expires_at < now() - interval '30 days';
$$;
revoke execute on function public.purge_expired_tokens() from public, anon, authenticated;
select cron.schedule('purge-expired-tokens-daily', '47 3 * * *', $$select public.purge_expired_tokens()$$);

-- الحذف بعد ١٢ شهر من آخر استخدام بيشمل كمان إعدادات الملخص والبصمات وسجل الإرسال والمفتاح
create or replace function public.purge_stale()
returns void language sql security definer set search_path = '' as $$
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
  delete from public.ad_accounts where last_seen < now() - interval '12 months';
$$;
revoke execute on function public.purge_stale() from public, anon, authenticated;
