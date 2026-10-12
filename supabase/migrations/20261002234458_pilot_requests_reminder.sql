-- تذكير الطلبات المتأخرة: وعدنا العميل بالتفعيل خلال ٢٤ ساعة (أي يوم، مش أيام عمل بس). لو عدّت ١٨ ساعة
-- والطلب لسه new، المُشغّل (runner.ts ← joinReminders في join.ts) بيبعت تذكير واحد على support@ ويسجّل وقته هنا.
-- null = متبعتش تذكير لسه.
alter table public.pilot_requests add column reminded_at timestamptz;
