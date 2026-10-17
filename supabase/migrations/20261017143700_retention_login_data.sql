-- المرحلة ٣ (١٧ أكتوبر ٢٠٢٦)، ملاحظة الاحتفاظ: جدولا الدخول مكانوش بيتمسحوا أبداً (نظام حماية البيانات الشخصية:
-- البيانات تُحذف لما الغرض منها يخلص). القاعدة:
--   auth_mail_log: سجل رسائل «إنشاء كلمة المرور» — لازم بس لحد الإرسال (٥ في اليوم، ومرة كل دقيقتين) → ٧ أيام
--   login_sessions: صف الجلسة لازم بس طول ما الجلسة نفسها قايمة عند Supabase وتأكيدها صالح (٣٠ يوم — session_ok)
--     → بيتمسح لما الجلسة تخلص (خروج أو انتهاء)، أو بعد ٣١ يوم من آخر تأكيد، أو لو متأكدتش خلال يوم
create or replace function public.purge_login_data()
returns void
language sql
security definer
set search_path to ''
as $$
  delete from public.auth_mail_log where sent_at < now() - interval '7 days';
  delete from public.login_sessions l
   where not exists (select 1 from auth.sessions s where s.id = l.session_id)
      or coalesce(l.verified_at, l.created_at) < now() - interval '31 days'
      or (l.verified_at is null and l.created_at < now() - interval '1 day');
$$;
revoke execute on function public.purge_login_data() from public, anon, authenticated;
select cron.schedule('purge-login-data-daily', '33 3 * * *', $$select public.purge_login_data()$$);
