-- المُشغّل كل ١٠ دقايق بدل كل ساعة: الملخص بياخد ~٣٠ ثانية للحساب، والمواعيد الافتراضية واحدة لكل العملاء
-- (الأحد والأربعاء ٩ الصبح)، وكل تشغيل حدّه ~١٥٠ ثانية — مرة في الساعة كانت هتأخّر آخر الملخصات ساعات.
-- الفحص العاجل لسه مرة في الساعة لكل حساب (URGENT_EVERY_MS في runner.ts)، واللي مفيش عليه حاجة بيتخطّى من غير أي طلب
select cron.unschedule('runner-hourly');
select cron.schedule('runner-10min', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-runner-key', (select decrypted_secret from vault.decrypted_secrets where name = 'runner_key')),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 10000)
$$);
