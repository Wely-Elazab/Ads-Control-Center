-- إعدادات التنبيهات لكل مستخدم (قرار صاحب المنتج ٢٦ أكتوبر ٢٠٢٦: «نعم اجعلها لكل مستخدم»، والافتراضي «لكل الحسابات المتصلة»
-- مع اختيار تخصيص منصة): سجل واحد لحساب الدخول في الأداة، بيتقري من أي جهاز يدخل بيه. فيه مجموعة «كل الحسابات» (all)
-- ومجموعة لكل منصة اتخصّصت (plat). أرقام الإعدادات بس — من غير أي أرقام إعلانات. الوصول من دالة sync بس (settings.ts —
-- دخول الأداة، والسجل بتاع صاحب الدخول نفسه). بيتمسح مع حساب الدخول، أو بعد ١٢ شهر من غير استخدام (purge_stale تحت)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  used_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;
comment on table public.user_settings is 'Alert settings per tool user: one set for all connected accounts plus optional per-platform sets (numbers only, no ad figures) — 2026-10-26';

-- سجل المشكلات (لوحة «ما حققته مع الأداة») لكل مستخدم: التنبيهات بتطلع من إعداداته هو، فمستخدمين على نفس الحساب بإعدادات
-- مختلفة ليهم مشكلات مختلفة. الجدول فاضي وقت الترحيل (اتأكد ٢٦ أكتوبر)، فالعمود من غير قيمة افتراضية
alter table public.alert_episodes add column if not exists user_id uuid not null references auth.users (id) on delete cascade;
drop index if exists public.alert_episodes_open;
create unique index if not exists alert_episodes_open on public.alert_episodes (user_id, platform, account_id, ad_id, kind) where ended_at is null;
drop index if exists public.alert_episodes_account;
create index if not exists alert_episodes_user on public.alert_episodes (user_id, platform, account_id, first_at desc);

-- صاحب الملخص التلقائي (البريد بيقرا إعداداته): اللي فعّله أو عدّله، والملخص القديم بياخد أول مستخدم يفتحه بعد التحديث.
-- من غيره (null) البريد بيفضل على سجل الحساب القديم (account_settings) زي ما كان
alter table public.digest_settings add column if not exists user_id uuid references auth.users (id) on delete set null;

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
  delete from public.account_settings where used_at < now() - interval '12 months';
  delete from public.user_settings where used_at < now() - interval '12 months';
  delete from public.alert_episodes where first_at < now() - interval '90 days';
  delete from public.ad_accounts where last_seen < now() - interval '12 months';
$$;
revoke execute on function public.purge_stale() from public, anon, authenticated;
