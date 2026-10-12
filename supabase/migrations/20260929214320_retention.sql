-- مدة الاحتفاظ اللي في سياسة الخصوصية (البند ٧): بيانات الحساب وتقييماته بتتمسح بعد ١٢ شهر من آخر مرة
-- الحساب فتح فيها الأداة. بتشتغل أول كل شهر. الحذف عند طلب العميل بيتعمل يدوياً (راجع supabase/README.md)
create function public.purge_stale()
returns void language sql set search_path = '' as $$
  delete from public.feedback f
   where f.updated_at < now() - interval '12 months'
     and not exists (
       select 1 from public.ad_accounts a
        where 'meta:' || a.account_id = f.view_key and a.last_seen >= now() - interval '12 months'
     );
  delete from public.ad_accounts where last_seen < now() - interval '12 months';
$$;
revoke execute on function public.purge_stale() from public, anon, authenticated;

select cron.schedule('purge-stale-monthly', '7 3 1 * *', $$select public.purge_stale()$$);
