-- إعدادات التنبيهات لكل حساب إعلاني (مراجعة الإعدادات ٢٤ أكتوبر ٢٠٢٦ — قرار صاحب المنتج): سجل واحد للحساب يقراه كل اللي
-- عندهم وصول للحساب في منصته، من أي جهاز، والبريد بيقراه هو كمان. أرقام الإعدادات بس (حدود ومستهدف وحد خسارة وتكلفة مقبولة)،
-- من غير أي أرقام إعلانات ولا بيانات أشخاص. الوصول من دالة sync بس (settings.ts — دخول الأداة + إثبات الوصول للحساب في المنصة)
create table if not exists public.account_settings (
  platform text not null check (platform in ('meta', 'snapchat', 'google')),
  account_id text not null check (char_length(account_id) between 1 and 64),
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (platform, account_id)
);
alter table public.account_settings enable row level security;
revoke all on public.account_settings from anon, authenticated;
comment on table public.account_settings is 'Alert settings per ad account (numbers only, no ad figures, no personal data) — settings review 2026-10-24';
