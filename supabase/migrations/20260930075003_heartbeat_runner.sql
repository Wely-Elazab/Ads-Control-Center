-- نبض المُشغّل: «runner» كل ساعة بعد ما يخلص، و«runner-engine-outdated» لو ملفات المحرك على الموقع
-- بقت أحدث من ENGINE_COMMIT في supabase/functions/sync/runner.ts (يعني لازم يتحدّث وتتنشر الدالة)
alter table public.heartbeat drop constraint heartbeat_source_check;
alter table public.heartbeat add constraint heartbeat_source_check
  check (source in ('pg_cron', 'cloudflare', 'runner', 'runner-engine-outdated'));
