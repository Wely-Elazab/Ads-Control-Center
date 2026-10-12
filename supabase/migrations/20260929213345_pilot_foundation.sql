-- Ads Center — أساس التجربة على Supabase (مشروع «Ads Center»، فرانكفورت، الخطة المجانية)
--
-- قاعدة الأمان: المتصفح عمره ما بيقرا أو يكتب في الجداول مباشرة. كل الوصول بيعدّي على دالة
-- supabase/functions/sync اللي بتتأكد الأول من Meta إن صاحب الطلب عنده صلاحية على الحساب الإعلاني،
-- وبعدين بتكتب بالمفتاح السري. عشان كده: RLS مفعّل من غير ولا سياسة، والصلاحيات مسحوبة من anon وauthenticated.
--
-- مفيش هنا مفاتيح دخول المنصات (Tokens) ولا أرقام الإعلانات ولا صورها — دي بتفضل عند المنصات زي ما هي.

-- الحسابات الإعلانية اللي فتحت الأداة (سجل عملاء التجربة). الاسم والعملة والتوقيت من Meta نفسها، مش من المتصفح
create table public.ad_accounts (
  platform text not null check (platform in ('meta', 'google', 'snapchat', 'tiktok')),
  account_id text not null check (char_length(account_id) between 1 and 64),
  name text check (char_length(name) <= 200),
  currency text check (char_length(currency) <= 8),
  timezone text check (char_length(timezone) <= 64),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  opens integer not null default 0,
  primary key (platform, account_id)
);

-- إجابات «هل كان هذا التشخيص صحيحاً؟». view_key = العرض اللي اتجاوب فيه:
-- «meta:act_1» أو «all:meta:act_1,google:123» (كل المنصات). إجابة واحدة لكل بطاقة في كل فترة
create table public.feedback (
  id bigint generated always as identity primary key,
  view_key text not null check (char_length(view_key) <= 300),
  block text not null check (char_length(block) between 1 and 200),
  since date not null,
  until date not null check (until >= since),
  verdict text not null check (verdict in ('yes', 'no')),
  reasons text[] not null default '{}' check (cardinality(reasons) <= 12),
  note text not null default '' check (char_length(note) <= 500),
  -- نوع البطاقة وعنوانها ونوع الملخص وقت الإجابة — عشان نقيس الدقة لكل نوع تشخيص
  block_kind text check (block_kind in ('urgent', 'why', 'decision', 'watch', 'opportunity', 'follow', 'note')),
  block_title text check (char_length(block_title) <= 300),
  head_type text check (char_length(head_type) <= 40),
  lang text check (lang in ('ar', 'en')),
  answered_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (view_key, block, since, until)
);
create index feedback_view_key_idx on public.feedback (view_key);

-- نبض المشروع: الخطة المجانية بتوقف المشروع بعد أسبوع من غير نشاط. مصدرين مستقلين بيكتبوا هنا يومياً
-- (pg_cron من جوه، وCloudflare من برّه) — وآخر وقت لكل واحد بيقول لو فيه مشكلة
create table public.heartbeat (
  source text primary key check (source in ('pg_cron', 'cloudflare')),
  at timestamptz not null default now(),
  beats bigint not null default 1
);

alter table public.ad_accounts enable row level security;
alter table public.feedback enable row level security;
alter table public.heartbeat enable row level security;
revoke all on public.ad_accounts, public.feedback, public.heartbeat from anon, authenticated;

-- تسجيل فتح حساب للأداة (مرة لكل جلسة): أول مرة وآخر مرة وعدد المرات
create function public.touch_account(p_platform text, p_account_id text, p_name text, p_currency text, p_timezone text)
returns void language sql set search_path = '' as $$
  insert into public.ad_accounts (platform, account_id, name, currency, timezone, opens)
  values (p_platform, p_account_id, p_name, p_currency, p_timezone, 1)
  on conflict (platform, account_id) do update
    set name = coalesce(excluded.name, public.ad_accounts.name),
        currency = coalesce(excluded.currency, public.ad_accounts.currency),
        timezone = coalesce(excluded.timezone, public.ad_accounts.timezone),
        last_seen = now(),
        opens = public.ad_accounts.opens + 1;
$$;

create function public.beat(p_source text)
returns void language sql set search_path = '' as $$
  insert into public.heartbeat (source) values (p_source)
  on conflict (source) do update set at = now(), beats = public.heartbeat.beats + 1;
$$;

revoke execute on function public.touch_account(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.beat(text) from public, anon, authenticated;
grant execute on function public.touch_account(text, text, text, text, text) to service_role;
grant execute on function public.beat(text) to service_role;

-- دقة التشخيص لكل نوع بطاقة — للمراجعة من لوحة Supabase (Table Editor / SQL)
create view public.feedback_accuracy with (security_invoker = true) as
  select block_kind,
         count(*) as answers,
         count(*) filter (where verdict = 'yes') as correct,
         round(100.0 * count(*) filter (where verdict = 'yes') / nullif(count(*), 0), 1) as pct_correct,
         max(answered_at) as last_answer
  from public.feedback
  group by block_kind;
revoke all on public.feedback_accuracy from anon, authenticated;

-- النبض من جوه قاعدة البيانات: يومياً ٤:٢٣ UTC
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('keepalive-daily', '23 4 * * *', $$select public.beat('pg_cron')$$);
