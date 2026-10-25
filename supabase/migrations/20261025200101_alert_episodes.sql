-- سجل مشكلات التنبيه (لوحة «قيمة الأداة» — قرار صاحب المنتج ٢٥ أكتوبر ٢٠٢٦: «سجل على خادمنا… وحدث سياسة الخصوصية»): صف لكل
-- مشكلة على إعلان من أول ما الأداة نبّهت عليها لحد ما اختفت — رقم الإعلان ونوع المشكلة ووقتها، ونوع التعديل اللي اتعمل بعدها
-- ووقته. من غير أي أرقام إنفاق أو مبيعات (المبلغ بيتحسب من المنصة وقت العرض). الوصول من دالة sync بس (episodes.ts — دخول
-- الأداة + إثبات الوصول للحساب في المنصة)، ومدة الاحتفاظ ٩٠ يوماً (purge_stale تحت)
create table if not exists public.alert_episodes (
  id bigint generated always as identity primary key,
  platform text not null check (platform in ('meta', 'snapchat')),
  account_id text not null check (char_length(account_id) between 1 and 64),
  ad_id text not null check (char_length(ad_id) between 1 and 64),
  kind text not null check (kind in ('waste', 'loss')),
  first_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  decided_at timestamptz,
  handled_at timestamptz,
  action text check (action in ('pause', 'budget', 'targeting', 'creative', 'bid')),
  check (handled_at is null or (handled_at >= first_at and handled_at <= first_at + interval '24 hours')),
  check ((handled_at is null) = (action is null))
);
-- مشكلة مفتوحة واحدة بس لكل إعلان ونوع (جهازين بيسجّلوا في نفس اللحظة = واحد بيترفض)
create unique index if not exists alert_episodes_open on public.alert_episodes (platform, account_id, ad_id, kind) where ended_at is null;
create index if not exists alert_episodes_account on public.alert_episodes (platform, account_id, first_at desc);
alter table public.alert_episodes enable row level security;
revoke all on public.alert_episodes from anon, authenticated;
comment on table public.alert_episodes is 'Alert episodes per ad (ad id, alert kind, times, follow-up action kind) — no spend or sales figures; kept 90 days — value panel 2026-10-25';

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
  delete from public.alert_episodes where first_at < now() - interval '90 days';
  delete from public.ad_accounts where last_seen < now() - interval '12 months';
$$;
revoke execute on function public.purge_stale() from public, anon, authenticated;
