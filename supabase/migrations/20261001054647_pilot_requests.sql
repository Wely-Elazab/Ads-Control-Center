-- طلبات الانضمام للتجربة (نموذج /join) — بدل رسالة البريد الجاهزة (mailto) اللي كانت بتضيع لو مفيش برنامج بريد على الجهاز.
--
-- بيانات تواصل بس (سياسة الخصوصية، البند ٣): الاسم والنشاط والمتجر والبلد والمنصات ورابط فيسبوك وبريد Google
-- وواتساب. الكتابة والقراءة من دالة sync بس (join.ts) — الجدول مقفول على أي حد غيرها زي باقي الجداول.
-- طلب واحد لكل بريد: لو نفس البريد بعت تاني بنحدّث نفس الصف (submissions بيزيد).
-- status: new = مستني نراجعه ونضيفه، activated = بعتنا له رسالة التفعيل (من زرار «أرسلت الدعوة» في إشعارنا).
-- بتتمسح تلقائياً بعد ١٢ شهر من آخر تحديث (البند ٧)، أو يدوياً عند الطلب (supabase/README.md).

create table public.pilot_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  name text not null check (char_length(name) between 1 and 100),
  business text not null check (char_length(business) between 1 and 120),
  store_url text not null check (char_length(store_url) between 4 and 300),
  country text not null check (char_length(country) between 2 and 60),
  platforms text[] not null check (platforms <@ '{meta,google,snapchat,tiktok}'::text[] and cardinality(platforms) between 1 and 4),
  fb_profile text check (char_length(fb_profile) <= 300),
  google_email text check (char_length(google_email) <= 254),
  whatsapp text check (char_length(whatsapp) <= 30),
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  consent_at timestamptz not null,
  consent_version text not null check (char_length(consent_version) <= 40),
  status text not null default 'new' check (status in ('new', 'activated')),
  submissions integer not null default 1,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pilot_requests_updated_idx on public.pilot_requests (updated_at desc);
alter table public.pilot_requests enable row level security;
revoke all on public.pilot_requests from anon, authenticated;

select cron.schedule('purge-join-requests-monthly', '17 3 1 * *', $$
  delete from public.pilot_requests where updated_at < now() - interval '12 months'
$$);
