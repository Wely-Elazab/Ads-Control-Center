-- لوحة «ما حققته مع الأداة» (٢) — قرارات صاحب المنتج ٢٦ نوفمبر ٢٠٢٦:
--  ١) سجل المشكلات بيفضل طول عمر حساب العميل، مش ٩٠ يوم («لتبقى قيمة الأداة ظاهرة منذ تسجيل العميل»): بيتمسح مع حسابه
--     (on delete cascade على user_id) أو بطلبه. purge_stale نفس الدالة بالظبط (بصمة النص الحالي = 20261111121000_retention_cleanup.sql)
--     ناقص سطر alert_episodes بس
--  ٢) مبالغ كل مشكلة على خادمنا («على خادمنا بعد اكتمالها»): baseline_daily = خسارة الإعلان اليومية وقت التنبيه (متوسط آخر ٣ أيام كاملة
--     قبله — نفس المحرك)، وsaved/lost = ما وفّره العميل بعد تصرّفه وما ضاع قبله، بعد ما أيام المشكلة تكمل. أرقام بس، بعملة الحساب
alter table public.alert_episodes
  add column if not exists baseline_daily numeric check (baseline_daily is null or (baseline_daily >= 0 and baseline_daily < 1e12)),
  add column if not exists amount_currency text check (amount_currency is null or amount_currency ~ '^[A-Z]{3}$'),
  add column if not exists saved_amount numeric check (saved_amount is null or (saved_amount >= 0 and saved_amount < 1e12)),
  add column if not exists lost_amount numeric check (lost_amount is null or (lost_amount >= 0 and lost_amount < 1e12)),
  add column if not exists amounts_at timestamptz;
comment on table public.alert_episodes is 'Alert episodes per ad (ad id, alert kind, times, follow-up action kind, daily loss at the alert, final saved/lost amounts) — kept for the account''s lifetime — value panel 2026-11-26';

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
  delete from public.send_log where sent_at < now() - interval '12 months';
  delete from private.user_meta_tokens t using public.ad_accounts a
   where a.account_id = t.account_id and a.last_seen < now() - interval '12 months';
  delete from public.user_digest_accounts x using public.ad_accounts a
   where x.platform = 'meta' and a.account_id = x.account_id and a.last_seen < now() - interval '12 months';
  delete from public.user_alert_marks m using public.ad_accounts a
   where m.platform = 'meta' and a.account_id = m.account_id and a.last_seen < now() - interval '12 months';
  delete from public.account_settings where used_at < now() - interval '12 months';
  delete from public.user_settings where used_at < now() - interval '12 months';
  delete from public.ad_accounts where last_seen < now() - interval '12 months';
$$;
revoke execute on function public.purge_stale() from public, anon, authenticated;
grant execute on function public.purge_stale() to service_role;
