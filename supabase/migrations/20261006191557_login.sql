-- تسجيل الدخول للأداة (قرار صاحب المنتج ٦ أكتوبر ٢٠٢٦): بريد وكلمة مرور (Supabase Auth)، وبعدها رمز من ٦ أرقام
-- على البريد في كل دخول جديد — الخطوة التانية مش موجودة في Supabase للبريد، فهي هنا (sync: login.code / login.verify).
--
-- app_access = مين مسموح له يدخل أصلاً. التسجيل المفتوح ملوش لازمة: الحساب بيتعمل لما صاحب الأداة يضغط «أرسلت الدعوة»
--   (join.ts) أو لما العميل يطلب «أول دخول؟ أنشئ كلمة المرور» وبريده في القائمة. ولاحقاً الاشتراك المدفوع.
-- login_sessions = الخطوة التانية لكل جلسة دخول (session_id من مفتاح Supabase): الرمز (مشفّر بـ HMAC، مش هو نفسه)،
--   عدد المحاولات والإرسال، ووقت التأكيد. الجلسة اللي متأكدتش = مفيش دخول.
-- auth_mail_log = حد إرسال رسائل «إنشاء/تغيير كلمة المرور» لكل بريد (من غير محتواها)
-- session_ok = سؤال واحد بيسأله Cloudflare (بالمفتاح العام) قبل أي طلب للأداة: الجلسة دي مأكَّدة ولسه قايمة وصاحبها مسموح له؟
--   بترجّع نعم/لا بس. session_id وuser_id موجودين جوه مفتاح الدخول نفسه — فمحدش يقدر يسأل عن جلسة مش بتاعته من غير مفتاحها

create table public.app_access (
  email text primary key check (email = lower(email) and length(email) <= 254),
  role text not null default 'pilot' check (role in ('admin', 'pilot')),
  created_at timestamptz not null default now()
);

create table public.login_sessions (
  session_id uuid primary key,
  user_id uuid not null,
  code_hash text,
  code_expires_at timestamptz,
  attempts int not null default 0,
  sends int not null default 0,
  last_sent_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_sessions_user on public.login_sessions (user_id);

create table public.auth_mail_log (
  id bigserial primary key,
  email text not null,
  kind text not null check (kind in ('password')),
  sent_at timestamptz not null default now()
);
create index auth_mail_log_email on public.auth_mail_log (email, sent_at desc);

-- مقفولة على أي حد غير المفتاح السري (دالة sync)
alter table public.app_access enable row level security;
alter table public.login_sessions enable row level security;
alter table public.auth_mail_log enable row level security;

-- التأكيد بيفضل ٣٠ يوم، وبعدها دخول جديد (كلمة المرور + رمز)
create or replace function public.session_ok(p_session uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.login_sessions l
    join auth.sessions s on s.id = l.session_id and s.user_id = l.user_id
    join auth.users u on u.id = l.user_id
    join public.app_access a on a.email = lower(u.email)
    where l.session_id = p_session and l.user_id = p_user
      and l.verified_at is not null and l.verified_at > now() - interval '30 days'
  );
$$;
revoke all on function public.session_ok(uuid, uuid) from public;
grant execute on function public.session_ok(uuid, uuid) to anon, authenticated, service_role;

-- رقم حساب الدخول من البريد — لدالة sync بس (المفتاح السري): «أول دخول؟» بيعمل الحساب لو مش موجود
create or replace function public.auth_user_id(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.auth_user_id(text) from public, anon, authenticated;
grant execute on function public.auth_user_id(text) to service_role;

-- حساب صاحب الأداة (admin) بيتضاف مباشرة في قاعدة البيانات، مش هنا — المستودع عام والبريد مكانه مش فيه
