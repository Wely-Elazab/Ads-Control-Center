-- لوحة «ما حققته مع الأداة» بثلاثة أرقام (قرار صاحب المنتج ٢٦ نوفمبر ٢٠٢٦: «مشكلات رصدناها · وفّرته بعد تنبيه Ads Center ·
-- ضاع قبل التصرّف»، والتوفير يبدأ بعد التصرّف حتى لو بعد يوم التنبيه، ولمدة ٧ أيام، والأرقام بتتبع فترة البيانات اللي العميل يختارها):
--  ١) Google يدخل السجل زي Meta وSnapchat (كان القسم بيحسب منصتين بس — التدقيق الشامل ١٣٢)
--  ٢) التصرّف بيتسجّل في أي وقت بعد التنبيه، مش في الـ ٢٤ ساعة بس: قبل كده المشكلة اللي اتعالجت في اليوم التاني كانت بتتقفل
--     «متعالجتش» وتختفي من الفلوس كلها. من غير حد أعلى (اقتراح ٣٠ يوم اترفض من صاحب المنتج: «لماذا لا يستمر لتكون الأرقام متوافقة
--     مع فترة كل تاريخ يحدده العميل») — الحد الطبيعي مدة الحفظ (٩٠ يوم)، وإن التصرّف يتحسب بس والمشكلة لسه قايمة (episodes.ts)
-- القيدين بيتوسّعوا بس — كل صف موجود صالح للقيد الجديد، والكود القديم شغّال زي ما هو
alter table public.alert_episodes drop constraint alert_episodes_platform_check;
alter table public.alert_episodes add constraint alert_episodes_platform_check check (platform in ('meta', 'snapchat', 'google'));
alter table public.alert_episodes drop constraint alert_episodes_check;
alter table public.alert_episodes add constraint alert_episodes_handled_after check (handled_at is null or handled_at >= first_at);
