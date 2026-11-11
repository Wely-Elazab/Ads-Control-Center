-- التدقيق الشامل ١١ نوفمبر ٢٠٢٦ — الاحتفاظ بالبيانات وتنظيف بقايا النظام القديم (النتائج ٣، ٢٥، ٢٧ في سجل التدقيق).
-- ملف لوحده عن قصد: فيه حذف بيانات (مفتاح Meta القديم المشفّر والبصمات القديمة)، فبيتطبّق بموافقة صريحة من صاحب المنتج.
-- الكود مش معتمد عليه: يتطبّق في أي وقت بعد 20261111120000_full_audit.sql

-- العدّاد اليومي بيتمسح بعد أسبوع (مع بيانات الدخول — نفس الدالة ونفس الميعاد)
create or replace function public.purge_login_data()
returns void language sql security definer set search_path = '' as $$
  delete from public.auth_mail_log where sent_at < now() - interval '7 days';
  delete from public.login_sessions l
   where not exists (select 1 from auth.sessions s where s.id = l.session_id)
      or coalesce(l.verified_at, l.created_at) < now() - interval '31 days'
      or (l.verified_at is null and l.created_at < now() - interval '1 day');
  delete from public.mail_budget where day < (now() at time zone 'utc')::date - 7;
$$;
revoke execute on function public.purge_login_data() from public, anon, authenticated;
grant execute on function public.purge_login_data() to service_role;

-- ---------- (٢٥) سجل الإرسال بيتمسح بمدة ----------
-- كان بيتمسح مع حساب Meta اللي متفتحش ١٢ شهر بس (ربط برقم الحساب في ad_accounts)، فصفوف حسابات Snapchat والصفوف اللي من غير حساب
-- مكانتش بتتمسح أبداً. سياسة الخصوصية (البند ٧): «يُحذف سجل الإرسال … مع بيانات الحساب»
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
  delete from public.alert_episodes where first_at < now() - interval '90 days';
  delete from public.ad_accounts where last_seen < now() - interval '12 months';
$$;
revoke execute on function public.purge_stale() from public, anon, authenticated;
grant execute on function public.purge_stale() to service_role;

-- ---------- (٢٧) بقايا النظام القديم (ملخص لكل حساب إعلاني — اتنقل لكل مستخدم ٣١ أكتوبر ٢٠٢٦) ----------
-- مفتاح Meta المشفّر القديم مبيقراهوش أي كود من يوم النقل (نسخة المستخدم في private.user_meta_tokens)، فمالوش سبب يفضل محفوظ
-- (OWASP ASVS 8.3.8: البيانات الحساسة متتحفظش بعد ما الحاجة ليها تخلص)، ودواله الست مالهاش استخدام. البصمات القديمة (alert_marks)
-- مبتتقريش كمان، والمفتوح منها مكانش بيتمسح أبداً. digest_settings بيفضل: رابط الإيقاف في الرسائل القديمة بيقرا منه صاحب الحساب
delete from private.meta_tokens;
delete from public.alert_marks;
update public.digest_settings set enabled = false, updated_at = now() where enabled;
drop function if exists public.vault_put_token(text, text, text, text, timestamptz);
drop function if exists public.vault_get_token(text);
drop function if exists public.vault_delete_token(text);
drop function if exists public.vault_token_status(text);
drop function if exists public.vault_mark_error(text, text);
drop function if exists public.vault_delete_user_tokens(text);
