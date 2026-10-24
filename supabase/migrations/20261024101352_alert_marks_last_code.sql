-- المراجعة الثانية للمرحلة ٥: بصمة التنبيه العاجل بقت بعيلة المشكلة (أداء الإعلان كله بصمة واحدة — runner.ts familyOf)،
-- فالنوع نفسه (آخر واحد ظهر) بيتسجّل هنا لعنوان سطر «حُلّت/مستمرة» في الملخص. الصفوف القديمة من غيره: العنوان من kind زي الأول.
-- مفيش أي أرقام إعلانات هنا — اسم نوع التنبيه بس (زي kind)
alter table public.alert_marks add column if not exists last_code text;
comment on column public.alert_marks.last_code is 'آخر نوع تنبيه ظهر لنفس البصمة (عنوان سطر الملخص). kind = العيلة.';
