-- حسابات المتجر (قرارات صاحب المنتج ٢٨ نوفمبر ٢٠٢٦ — «مثل ثندر»): حساب إعلاني واحد لكل منصة لكل متجر، المالك بس اللي بيختاره ويغيّره
-- (من «الإعدادات» ← «المتجر وفريقه»). جوّه المتجر الكل — والمالك نفسه — بيشتغلوا على الحسابات دي بس: الإعدادات لكل حساب وسجل «ما حققته»
-- مبيقبلوش غيرها، وقراءة الإعدادات بتتفلتر عليها (settings.ts / episodes.ts). فحساب متجر تاني عند عضو (مسؤول إعلانات بيشتغل مع كذا متجر)
-- مبيتحسبش بإعدادات المتجر، ومبيتسجّلش في سجله، ورقمه مبيوصلش لفريقه — وده اللي بيفتح الدعوات (stores.ts TEAM.invitesOpen)
create table public.store_accounts (
  store_id uuid not null references public.stores (id) on delete cascade,
  platform text not null check (platform in ('meta', 'snapchat', 'google')),
  account_id text not null check (char_length(account_id) between 1 and 64),
  chosen_by uuid,
  chosen_at timestamptz not null default now(),
  primary key (store_id, platform)
);
create index store_accounts_account on public.store_accounts (platform, account_id);
alter table public.store_accounts enable row level security;
revoke all on public.store_accounts from anon, authenticated;

-- سجل التغييرات: «غيّر حساب Meta للمتجر» — المنصة بس، من غير رقم الحساب
alter table public.store_audit drop constraint store_audit_action_check;
alter table public.store_audit add constraint store_audit_action_check
  check (action in ('create', 'rename', 'invite', 'revoke', 'accept', 'remove', 'role', 'leave', 'transfer', 'settings', 'account'));

-- التعبئة (قرار صاحب المنتج «المتاجر الحالية تملأ تلقائياً»): المتجر اللي الخادم يعرف له حساب واحد بس في المنصة — من إعداداته لكل حساب،
-- أو سجل مشكلاته، أو ملخص صاحبه بالبريد — بياخده. اللي له أكتر من حساب في المنصة أو مالوش بيتملا أول ما صاحبه يفتح الأداة، بالحساب
-- المفتوح عنده (ui.js — بعد ما المنصة تأكد إنه شايفه)
with known as (
  select ss.store_id, split_part(k, ':', 1) as platform, substr(k, length(split_part(k, ':', 1)) + 2) as account_id
    from public.store_settings ss, jsonb_object_keys(coalesce(ss.settings -> 'acct', '{}'::jsonb)) k
  union
  select e.store_id, e.platform, e.account_id from public.alert_episodes e where e.store_id is not null
  union
  select d.store_id, d.platform, d.account_id from public.user_digest_accounts d where d.store_id is not null
), one as (
  select store_id, platform, min(account_id) as account_id from known
   where platform in ('meta', 'snapchat', 'google') and char_length(account_id) between 1 and 64
   group by store_id, platform having count(distinct account_id) = 1
)
insert into public.store_accounts (store_id, platform, account_id, chosen_by)
select one.store_id, one.platform, one.account_id, s.owner_id from one join public.stores s on s.id = one.store_id;
