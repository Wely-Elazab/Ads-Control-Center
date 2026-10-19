-- حساسية التنبيهات اللي العميل اختارها في الأداة (المرحلة ٥ ق٥، ١٩ أكتوبر ٢٠٢٦): أرقام بس بمفاتيح الإعدادات المعروفة
-- (digest.ts cleanSens)، والمُشغّل بيمرّرها لمحرك الأداة (runner.ts urgentAlerts). null = لسه مبعتهاش: الإعدادات الافتراضية
alter table public.digest_settings add column if not exists alert_settings jsonb;
comment on column public.digest_settings.alert_settings is 'Alert sensitivity numbers chosen in the tool (no personal data) — Phase 5 Q5';
