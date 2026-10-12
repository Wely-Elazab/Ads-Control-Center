-- الملخص الشهري بالبريد (ملاحظة صاحب المنتج ١٠ أكتوبر ٢٠٢٦): أول أحد في كل شهر، للشهر اللي فات كله (runner.ts monthlyDue).
-- المحفوظ هو الشهر اللي اتبعت ملخصه بس ('2026-09') عشان ميتبعتش مرتين — مش أرقام، زي last_summary_until
alter table public.digest_settings
  add column if not exists last_monthly text check (last_monthly is null or last_monthly ~ '^[0-9]{4}-[0-9]{2}$');

-- نوع رسالة جديد في سجل الإرسال
alter table public.send_log drop constraint if exists send_log_type_check;
alter table public.send_log
  add constraint send_log_type_check check (type in ('urgent', 'summary', 'monthly', 'reminder', 'enabled', 'disabled', 'expiry'));
