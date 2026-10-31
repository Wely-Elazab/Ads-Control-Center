-- الملخص بحسابات كتير (قرار صاحب المنتج ٣١ أكتوبر ٢٠٢٦: «اجعلها اكبر عدد ممكن للحسابات لكل منصة... المهم انه لا يحصل بينهم تعارض»).
-- قبل كده كل حسابات المستخدم كانت بتتفحص ورا بعض في تشغيل واحد كل ١٠ دقايق (حدّه دقيقتين)، فيوم الملخص مكانش بيساع غير ~٣ حسابات.
-- دلوقتي (supabase/functions/sync/runner.ts):
--   - المُشغّل كل دقيقتين، وكل تشغيل بيحجز حساب واحد في المرة (digest_claim): الحساب المحجوز (claimed_until) محدش تاني بياخده،
--     وحسابات Snapchat للمستخدم الواحد ورا بعض (دخول واحد)، والعطل المؤقت ليه مهلة لوحدها (retry_after)
--   - الملخص: التخطيط بيعلّم حسابات المستخدم إنها محتاجة قسمها للفترة (need_summary / need_monthly)، وكل قسم بيتحفظ مؤقتاً في
--     digest_outbox لحد ما الرسالة الواحدة تتبعت، وبعدها بيتمسح (والعاجل كمان). اللي فضل بالغلط بيتمسح بعد يومين
--   - الإرسال محجوز لتشغيل واحد (sending_until)، فمفيش رسالة بتتبعت مرتين

alter table public.user_digest_accounts
  add column if not exists claimed_until timestamptz,
  add column if not exists retry_after timestamptz,
  add column if not exists need_summary text check (need_summary is null or char_length(need_summary) <= 40),
  add column if not exists need_monthly text check (need_monthly is null or char_length(need_monthly) <= 40);
alter table public.user_digests
  add column if not exists summary_pending text check (summary_pending is null or char_length(summary_pending) <= 40),
  add column if not exists summary_pending_at timestamptz,
  add column if not exists monthly_pending text check (monthly_pending is null or char_length(monthly_pending) <= 40),
  add column if not exists monthly_pending_at timestamptz,
  add column if not exists sending_until timestamptz;

create table if not exists public.digest_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.user_digests (user_id) on delete cascade,
  platform text not null check (platform in ('meta', 'snapchat', 'google', 'tiktok')),
  account_id text not null check (char_length(account_id) between 1 and 64),
  kind text not null check (kind in ('urgent', 'summary', 'monthly')),
  period text not null default '' check (char_length(period) <= 40),
  payload jsonb not null,
  marks jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, platform, account_id, kind, period)
);
alter table public.digest_outbox enable row level security;
revoke all on public.digest_outbox from anon, authenticated;

-- حساب واحد مستحق دلوقتي: قسم ملخص مستني، أو فحص عاجل (مرة في الساعة، ومش بالليل بتوقيت المستخدم — زي QUIET_FROM/QUIET_UNTIL في
-- runner.ts). بيتحجز p_secs ثانية. صف المستخدم بيتقفل مع الحساب (skip locked) فطلبين في نفس اللحظة مبياخدوش حسابين Snapchat لنفس المستخدم
create or replace function public.digest_claim(p_secs integer, p_platforms text[])
returns table (user_id uuid, platform text, account_id text, name text, checked_at timestamptz, need_summary text, need_monthly text, urgent_due boolean)
language sql security definer set search_path = '' as $$
  with c as (
    select a.user_id, a.platform, a.account_id
      from public.user_digest_accounts a
      join public.user_digests d on d.user_id = a.user_id and d.enabled
     where a.platform = any (p_platforms)
       and (a.claimed_until is null or a.claimed_until < now())
       and (a.retry_after is null or a.retry_after < now())
       and (a.need_summary is not null or a.need_monthly is not null
         or ((a.checked_at is null or a.checked_at < now() - interval '50 minutes')
           and extract(hour from now() at time zone d.timezone) between 7 and 22))
       and not (a.platform = 'snapchat' and exists (
         select 1 from public.user_digest_accounts b
          where b.user_id = a.user_id and b.platform = 'snapchat' and b.claimed_until > now()))
     order by (a.need_summary is not null or a.need_monthly is not null) desc, a.checked_at asc nulls first
     limit 1
     for update of a, d skip locked
  )
  update public.user_digest_accounts u set claimed_until = now() + make_interval(secs => p_secs)
    from c join public.user_digests d on d.user_id = c.user_id
   where u.user_id = c.user_id and u.platform = c.platform and u.account_id = c.account_id
  returning u.user_id, u.platform, u.account_id, u.name, u.checked_at, u.need_summary, u.need_monthly,
    ((u.checked_at is null or u.checked_at < now() - interval '50 minutes') and extract(hour from now() at time zone d.timezone) between 7 and 22);
$$;
revoke execute on function public.digest_claim(integer, text[]) from public, anon, authenticated;
grant execute on function public.digest_claim(integer, text[]) to service_role;

select cron.schedule('purge-digest-outbox-daily', '35 3 * * *', $$
  delete from public.digest_outbox where created_at < now() - interval '2 days'
$$);

select cron.unschedule('runner-10min');
select cron.schedule('runner-2min', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-runner-key', (select decrypted_secret from vault.decrypted_secrets where name = 'runner_key')),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 10000)
$$);
