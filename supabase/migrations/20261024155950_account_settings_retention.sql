-- مدة الاحتفاظ بإعدادات الحسابات (سياسة الخصوصية، البند ٧ — نفس قاعدة بيانات الحسابات): السجل بيتمسح بعد ١٢ شهر من آخر مرة
-- حد فتح الحساب في الأداة (used_at — settings.ts بيحدّثه وقت القراءة والحفظ). مش updated_at: إعدادات بتتظبط مرة وبتفضل شغالة سنين،
-- فآخر تعديل مش معناه إن الحساب بطّل يستخدم الأداة
alter table public.account_settings add column if not exists used_at timestamptz not null default now();

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
  delete from public.ad_accounts where last_seen < now() - interval '12 months';
$$;
revoke execute on function public.purge_stale() from public, anon, authenticated;
