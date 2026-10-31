-- الملخص التلقائي لكل المنصات — المرحلة ٢: Snapchat (قرار صاحب المنتج ٣١ أكتوبر ٢٠٢٦: «واجعل الملخص لكل المنصات وليس ميتا فقط»،
-- ووافق على حفظ صلاحية قراءة Snapchat وGoogle على الخادم مشفّرة مع تحديث سياسة الخصوصية).
--
-- صلاحية Snapchat: الأداة بتبعت النسخة المقفولة من مفتاح التجديد (Live/api/_seal.js — مقفولة بمفتاح مشتق من سر التطبيق اللي في
-- Cloudflare بس، ومربوطة بحساب الدخول للأداة)، ودالة sync بتشفّرها تاني بمفتاحها هي (TOKEN_ENC_KEY) قبل ما تتحفظ هنا. فقاعدة البيانات
-- لوحدها مبتفتحهاش، ولا دالة sync لوحدها: المُشغّل بيبعتها للـ Worker (Live/api/digest-fetch.js) يفتحها ويقرا الأرقام.
-- expires_at = ٦٠ يوم من آخر مرة المستخدم فتح الأداة بالحساب ده (زي Meta) — المُشغّل مبيمدّهاش. بعدها بـ ٣٠ يوم بتتمسح هي وحسابها.
--
-- runner_key_check: الـ Worker بيتأكد إن الطلب من المُشغّل (نفس مفتاح المُشغّل اللي في Vault — مفيش سر جديد). بالمفتاح العام (anon)
-- زي session_ok، وبتقارن بصمة SHA-256 بس (مش المفتاح حرف بحرف)، وبترجّع صح/غلط بس. المفتاح عشوائي ٣٢ بايت

alter table public.user_digest_accounts add column if not exists name text check (name is null or char_length(name) <= 200);

create table if not exists private.user_sealed_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('snapchat', 'google')),
  account_id text not null check (char_length(account_id) between 1 and 64),
  ciphertext text not null,
  iv text not null,
  key_version smallint not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text check (char_length(last_error) <= 200),
  primary key (user_id, platform, account_id)
);
alter table private.user_sealed_tokens enable row level security;
revoke all on private.user_sealed_tokens from public, anon, authenticated;

-- من الأداة (إضافة الحساب أو فتحه): نسخة جديدة وتاريخ انتهاء جديد
create or replace function public.vault_sealed_put(p_user uuid, p_platform text, p_account text, p_cipher text, p_iv text, p_expires timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.user_sealed_tokens (user_id, platform, account_id, ciphertext, iv, expires_at)
  values (p_user, p_platform, p_account, p_cipher, p_iv, p_expires)
  on conflict (user_id, platform, account_id) do update
    set ciphertext = excluded.ciphertext, iv = excluded.iv, expires_at = excluded.expires_at, updated_at = now(), last_error = null;
$$;
-- من المُشغّل: الـ Worker بيرجّع نسخة جديدة مع كل استخدام — النسخة بس، وتاريخ الانتهاء زي ما هو
create or replace function public.vault_sealed_rotate(p_user uuid, p_platform text, p_account text, p_cipher text, p_iv text)
returns void language sql security definer set search_path = '' as $$
  update private.user_sealed_tokens set ciphertext = p_cipher, iv = p_iv, updated_at = now(), last_error = null
   where user_id = p_user and platform = p_platform and account_id = p_account;
$$;
create or replace function public.vault_sealed_get(p_user uuid, p_platform text, p_account text)
returns table (ciphertext text, iv text, key_version smallint, expires_at timestamptz)
language sql security definer set search_path = '' as $$
  update private.user_sealed_tokens set last_used_at = now() where user_id = p_user and platform = p_platform and account_id = p_account;
  select t.ciphertext, t.iv, t.key_version, t.expires_at from private.user_sealed_tokens t
   where t.user_id = p_user and t.platform = p_platform and t.account_id = p_account;
$$;
create or replace function public.vault_sealed_status(p_user uuid)
returns table (platform text, account_id text, expires_at timestamptz, updated_at timestamptz, last_error text)
language sql security definer set search_path = '' as $$
  select t.platform, t.account_id, t.expires_at, t.updated_at, t.last_error from private.user_sealed_tokens t where t.user_id = p_user;
$$;
-- p_account null = كل حسابات المنصة، وp_platform null = كل المنصات
create or replace function public.vault_sealed_delete(p_user uuid, p_platform text, p_account text)
returns void language sql security definer set search_path = '' as $$
  delete from private.user_sealed_tokens
   where user_id = p_user and (p_platform is null or platform = p_platform) and (p_account is null or account_id = p_account);
$$;
create or replace function public.vault_sealed_mark_error(p_user uuid, p_platform text, p_account text, p_error text)
returns void language sql security definer set search_path = '' as $$
  update private.user_sealed_tokens set last_error = left(p_error, 200), updated_at = now()
   where user_id = p_user and platform = p_platform and account_id = p_account;
$$;
revoke execute on function public.vault_sealed_put(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.vault_sealed_rotate(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.vault_sealed_get(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.vault_sealed_status(uuid) from public, anon, authenticated;
revoke execute on function public.vault_sealed_delete(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.vault_sealed_mark_error(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.vault_sealed_put(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.vault_sealed_rotate(uuid, text, text, text, text) to service_role;
grant execute on function public.vault_sealed_get(uuid, text, text) to service_role;
grant execute on function public.vault_sealed_status(uuid) to service_role;
grant execute on function public.vault_sealed_delete(uuid, text, text) to service_role;
grant execute on function public.vault_sealed_mark_error(uuid, text, text, text) to service_role;

create or replace function public.runner_key_check(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(char_length(p_key) between 32 and 256, false)
     and exists (select 1 from vault.decrypted_secrets s
                  where s.name = 'runner_key' and extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(p_key, 'sha256'));
$$;
revoke execute on function public.runner_key_check(text) from public, authenticated;
grant execute on function public.runner_key_check(text) to anon, service_role;

-- الانتهاء: صلاحيات Snapchat (وGoogle بعدين) زي Meta — بعد ٣٠ يوم من انتهائها بتتمسح هي وحسابها من الملخص، وبصمات الحسابات اللي
-- خرجت من الملخص بتتمسح، والملخص اللي مبقاش فيه حسابات بيقف
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
  delete from public.user_digest_accounts a using private.user_sealed_tokens t
   where t.user_id = a.user_id and t.platform = a.platform and t.account_id = a.account_id and t.expires_at < now() - interval '30 days';
  delete from private.user_sealed_tokens where expires_at < now() - interval '30 days';
  delete from public.user_alert_marks m
   where not exists (select 1 from public.user_digest_accounts a where a.user_id = m.user_id and a.platform = m.platform and a.account_id = m.account_id);
  update public.user_digests u set enabled = false, updated_at = now()
   where u.enabled and not exists (select 1 from public.user_digest_accounts a where a.user_id = u.user_id);
$$;
revoke execute on function public.purge_expired_tokens() from public, anon, authenticated;
