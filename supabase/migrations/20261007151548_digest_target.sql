-- العائد المستهدف وحد الخسارة مع إعدادات الملخص التلقائي (قرار صاحب المنتج ٧ أكتوبر ٢٠٢٦).
-- قبل كده كانوا في متصفح العميل بس (إعدادات التنبيهات)، فرسالة الملخص بالبريد مكانش فيها سطر «العائد أقل من المستهدف…»
-- والتنبيهات العاجلة بالبريد كانت بحد الخسارة الافتراضي (١). الأداة بتبعتهم مع التفعيل والتحديث وفتح الحساب (digest.ts).
-- رقمين إعدادات بس — مش أرقام أداء. فاضيين = زي قبل كده (من غير سطر الهدف، وبالقيم الافتراضية)
alter table public.digest_settings
  add column if not exists roas_target numeric,
  add column if not exists roas_break_even numeric;

-- نفس حدود الأداة (js/alerts.js): من ٠٫١ لـ ٥٠، وحد الخسارة مش أكبر من المستهدف
alter table public.digest_settings
  add constraint digest_roas_target_range check (roas_target is null or (roas_target >= 0.1 and roas_target <= 50)),
  add constraint digest_roas_be_range check (roas_break_even is null or (roas_break_even >= 0.1 and roas_break_even <= 50)),
  add constraint digest_roas_order check (roas_target is null or roas_break_even is null or roas_break_even <= roas_target);
