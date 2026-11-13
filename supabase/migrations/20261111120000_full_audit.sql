-- التدقيق الشامل ١١ نوفمبر ٢٠٢٦ (طلب صاحب المنتج: «قسم الأداة لأقسام رئيسية ثم اقسام فرعية ثم ادق التفاصيل، وارجع كل تفصيلة منهم من
-- حيث الثغرات والأمان، ومن حيث المنطق، ومن حيث النمطية والتكاملية»). كل بند هنا نتيجة مرقّمة في سجل التدقيق.

-- ---------- (١٩) منطقة زمنية تقبلها دالة sync وترفضها قاعدة البيانات كانت توقف طابور البريد للجميع ----------
-- digest.ts بيتحقق من المنطقة بـ Intl (V8/ICU)، وده بيقبل أسماء قديمة زي AET وCTT وUS/Pacific-New وSystemV/AST4. PostgreSQL مبيعرفهاش،
-- وdigest_claim بيحسب «now() at time zone» لكل الصفوف — فصف واحد بمنطقة زي دي كان بيوقّع الدالة كلها بخطأ «time zone not recognized»:
-- لا فحص عاجل ولا ملخصات لأي مستخدم لحد ما الصف يتصلّح بالإيد. tz_hour بترجّع الساعة بتوقيت UTC بدل الخطأ، وtz_ok للتحقق وقت الحفظ
create or replace function public.tz_hour(p_tz text)
returns integer language plpgsql stable set search_path = '' as $$
begin
  return extract(hour from now() at time zone p_tz)::integer;
exception when others then
  return extract(hour from now() at time zone 'UTC')::integer;
end $$;
revoke execute on function public.tz_hour(text) from public, anon, authenticated;
grant execute on function public.tz_hour(text) to service_role;

create or replace function public.tz_ok(p_tz text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where lower(name) = lower(p_tz));
$$;
revoke execute on function public.tz_ok(text) from public, anon, authenticated;
grant execute on function public.tz_ok(text) to service_role;

-- ---------- (٢٠) «تعديل كبير» كان بيضيع لو فحص الساعة فشل مؤقتاً ----------
-- الفحص بيقرا التعديلات الأحدث من «آخر فحص» (checked_at)، والفشل المؤقت نفسه (أو سجل تعديلات مرجعش) بيحرّك checked_at — فالتعديلات اللي
-- قبله مكانتش بتتقيّم أبداً. edits_at = آخر مرة سجل التعديلات اتقرا بنجاح (runner.ts editsSince)
alter table public.user_digest_accounts add column if not exists edits_at timestamptz;

-- نفس الدالة (20261031200000_digest_queue.sql) + tz_hour بدل «at time zone» المباشر + edits_at في الرد. نوع الرد اتغيّر فلازم تتشال الأول
drop function if exists public.digest_claim(integer, text[]);
create function public.digest_claim(p_secs integer, p_platforms text[])
returns table (user_id uuid, platform text, account_id text, name text, checked_at timestamptz, need_summary text, need_monthly text, urgent_due boolean, edits_at timestamptz)
language sql security definer set search_path = '' as $$
  with c as (
    select a.user_id, a.platform, a.account_id
      from public.user_digest_accounts a
      join public.user_digests d on d.user_id = a.user_id and d.enabled
     where a.platform = any (p_platforms)
       and (a.claimed_until is null or a.claimed_until < now())
       and (a.retry_after is null or a.retry_after < now())
       and (a.need_summary is not null or a.need_monthly is not null
         or ((a.checked_at is null or a.checked_at < now() - interval '50 minutes')
           and public.tz_hour(d.timezone) between 7 and 22))
       and not (a.platform = 'snapchat' and exists (
         select 1 from public.user_digest_accounts b
          where b.user_id = a.user_id and b.platform = 'snapchat' and b.claimed_until > now()))
     order by (a.need_summary is not null or a.need_monthly is not null) desc, a.checked_at asc nulls first
     limit 1
     for update of a, d skip locked
  )
  update public.user_digest_accounts u set claimed_until = now() + make_interval(secs => p_secs)
    from c join public.user_digests d on d.user_id = c.user_id
   where u.user_id = c.user_id and u.platform = c.platform and u.account_id = c.account_id
  returning u.user_id, u.platform, u.account_id, u.name, u.checked_at, u.need_summary, u.need_monthly,
    ((u.checked_at is null or u.checked_at < now() - interval '50 minutes') and public.tz_hour(d.timezone) between 7 and 22),
    u.edits_at;
$$;
revoke execute on function public.digest_claim(integer, text[]) from public, anon, authenticated;
grant execute on function public.digest_claim(integer, text[]) to service_role;

-- ---------- (١) رمز الدخول: العدّادات كانت بتتقري وبعدين تتكتب، ومفيش حد لكل مستخدم ----------
-- طلبات في نفس اللحظة كانت بتعدّي حد ٥ محاولات للرمز و٥ إرسالات للجلسة، وجلسة جديدة بكلمة المرور = عدّاد جديد — فاللي معاه كلمة المرور
-- يقدر يخمّن الرمز بلا حد ويغرّق بريد صاحب الحساب (NIST SP 800-63B §5.2.2، OWASP ASVS 2.2.1). دلوقتي المحاولة والإرسال بيتخصموا
-- في قاعدة البيانات قبل أي حاجة (قفل لكل مستخدم — pg_advisory_xact_lock)، ومعاهم حد لكل مستخدم في ٢٤ ساعة عبر كل جلساته.
-- tries_total = مجموع محاولات الجلسة (attempts بيتصفّر مع كل رمز جديد).
-- نافذة الـ٢٤ ساعة بوقت آخر رمز اتبعت للجلسة (مش بوقت إنشائها): المحاولة محتاجة رمز لسه صالح (١٠ دقايق)، فأي جلسة عليها محاولة أو
-- إرسال النهارده آخر إرسال ليها النهارده. بوقت الإنشاء، جلسات اتعملت أمس (بتفضل لحد يومين قبل ما تتمسح — purge_login_data) كان باقي
-- إرسالاتها ومحاولاتها بيتستخدم النهارده من غير ما يتعدّ: نحو ٧٥ رمز و٣٣٠ محاولة في اليوم بدل ١٥ و٣٠ (مرور المختبِر ١٢ نوفمبر ٢٠٢٦)
alter table public.login_sessions add column if not exists tries_total integer not null default 0;

-- حجز إرسال رمز. -1 = حد اليوم للمستخدم، null = حد الجلسة أو المهلة بين رمزين لسه مخلصتش، غير كده إرسالات الجلسة بعد الزيادة
create or replace function public.login_send(p_session uuid, p_user uuid, p_max integer, p_gap_secs integer, p_day_max integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_day bigint;
  v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ads-center/login:' || p_user::text, 0));
  select coalesce(sum(s.sends), 0) into v_day from public.login_sessions s
   where s.user_id = p_user and coalesce(s.last_sent_at, s.created_at) > now() - interval '24 hours';
  if v_day >= p_day_max then return -1; end if;
  insert into public.login_sessions as l (session_id, user_id, sends, last_sent_at)
  values (p_session, p_user, 1, now())
  on conflict (session_id) do update set sends = l.sends + 1, last_sent_at = now()
    where l.user_id = excluded.user_id and l.sends < p_max
      and (l.last_sent_at is null or l.last_sent_at < now() - make_interval(secs => p_gap_secs))
  returning l.sends into v_n;
  return v_n;
end $$;
revoke execute on function public.login_send(uuid, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.login_send(uuid, uuid, integer, integer, integer) to service_role;

-- محاولة رمز: بتتخصم قبل المقارنة. -1 = حد اليوم للمستخدم، null = مفيش محاولات باقية للرمز ده (أو مفيش جلسة)، غير كده محاولات الرمز بعد الزيادة
create or replace function public.login_try(p_session uuid, p_user uuid, p_max integer, p_day_max integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_day bigint;
  v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ads-center/login:' || p_user::text, 0));
  select coalesce(sum(s.tries_total), 0) into v_day from public.login_sessions s
   where s.user_id = p_user and coalesce(s.last_sent_at, s.created_at) > now() - interval '24 hours';
  if v_day >= p_day_max then return -1; end if;
  update public.login_sessions l set attempts = l.attempts + 1, tries_total = l.tries_total + 1
   where l.session_id = p_session and l.user_id = p_user and l.attempts < p_max
  returning l.attempts into v_n;
  return v_n;
end $$;
revoke execute on function public.login_try(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.login_try(uuid, uuid, integer, integer) to service_role;

-- ---------- (٣) سقف يومي لرسائل نموذج الانضمام العام ----------
-- النموذج من غير دخول: ٣٠ طلب في الساعة = ٧٢٠ إشعار في اليوم، وتذكير لكل واحد بعد ١٨ ساعة — يكفي لاستنزاف حصة خدمة البريد اليومية،
-- فرموز الدخول والتنبيهات العاجلة تقف عند كل المستخدمين. mail_budget_take: عدّاد يومي لكل نوع، بيرجّع true لو لسه فيه مكان (ذرّي)
create table if not exists public.mail_budget (
  day date not null,
  kind text not null check (char_length(kind) between 1 and 40),
  n integer not null default 0,
  primary key (day, kind)
);
alter table public.mail_budget enable row level security;
revoke all on public.mail_budget from anon, authenticated;

create or replace function public.mail_budget_take(p_kind text, p_max integer)
returns boolean language sql security definer set search_path = '' as $$
  with up as (
    insert into public.mail_budget as b (day, kind, n) values ((now() at time zone 'utc')::date, p_kind, 1)
    on conflict (day, kind) do update set n = b.n + 1 where b.n < p_max
    returning 1
  )
  select exists (select 1 from up);
$$;
revoke execute on function public.mail_budget_take(text, integer) from public, anon, authenticated;
grant execute on function public.mail_budget_take(text, integer) to service_role;

-- ---------- (١٣) بريد الملخص اتغيّر: إشعار للعنوان القديم — نوع جديد في سجل الإرسال ----------
-- digest.ts mailMoved (OWASP ASVS 2.5.5: صاحب الحساب يعرف لما وجهة رسائله تتغيّر). السجل نفسه من غير محتوى الرسالة زي الباقي
alter table public.send_log drop constraint if exists send_log_type_check;
alter table public.send_log add constraint send_log_type_check
  check (type in ('urgent', 'summary', 'monthly', 'reminder', 'enabled', 'disabled', 'expiry', 'moved'));
