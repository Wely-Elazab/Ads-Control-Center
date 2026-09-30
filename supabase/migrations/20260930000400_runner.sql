-- المُشغّل: فحص التنبيهات العاجلة كل ساعة لكل حساب مفعّل له الملخص التلقائي (دالة sync، action: run)
-- pg_cron بينادي الدالة عن طريق pg_net ومعاه مفتاح عشوائي محفوظ في Vault — محدش بيشوفه ولا بيتكتب في الكود،
-- والدالة بتتأكد منه بـ runner_key_ok. الدالة بترد فوراً وبتكمّل الشغل في الخلفية (EdgeRuntime.waitUntil)

create extension if not exists pg_net with schema extensions;

-- آخر مرة التنبيه اتشاف فعلاً: لو اختفى أقل من ٢٤ ساعة ورجع، هو نفس المشكلة (منبعتهوش تاني).
-- «اتحلّ» = مظهرش ٢٤ ساعة كاملة. مفيش أي أرقام هنا — نوع التنبيه والعنصر والتواريخ بس (سياسة الخصوصية، البند ٣)
alter table public.alert_marks add column last_seen_at timestamptz not null default now();
-- آخر فحص للحساب — الحسابات اللي مفحصتش من أطول وقت بتتفحص الأول لو الوقت مكفاش الكل في مرة
alter table public.digest_settings add column checked_at timestamptz;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'runner_key', 'sync action=run (pg_cron)');

create function public.runner_key_ok(p_key text)
returns boolean language sql security definer set search_path = '' as $$
  select coalesce(char_length(p_key) = 64, false)
     and exists (select 1 from vault.decrypted_secrets where name = 'runner_key' and decrypted_secret = p_key);
$$;
revoke execute on function public.runner_key_ok(text) from public, anon, authenticated;
grant execute on function public.runner_key_ok(text) to service_role;

-- الدقيقة ٥ من كل ساعة. الدالة نفسها بتسكت بالليل (١١ مساءً – ٧ صباحاً بتوقيت كل حساب)
select cron.schedule('runner-hourly', '5 * * * *', $$
  select net.http_post(
    url := 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-runner-key', (select decrypted_secret from vault.decrypted_secrets where name = 'runner_key')),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 10000)
$$);

-- البصمات اللي اتحلّت من أكتر من ٤٥ يوم مالهاش لازمة (الملخص بيحتاج اللي من آخر ملخص بس)
select cron.schedule('purge-old-marks-daily', '53 3 * * *', $$
  delete from public.alert_marks where resolved_at < now() - interval '45 days'
$$);
