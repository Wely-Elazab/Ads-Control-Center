-- مراجعة أمان (١١ أكتوبر ٢٠٢٦): جداول الدخول (app_access وlogin_sessions وauth_mail_log) كانت عليها صلاحيات كاملة لـ anon
-- وauthenticated (الصلاحيات الافتراضية لأي جدول جديد في public) — منها TRUNCATE اللي RLS مبيغطيهاش. RLS من غير سياسات كان
-- بيمنع القراءة والكتابة، بس قائمة الدخول نفسها (app_access) لازم متكونش قابلة للتعديل بالمفتاح العام حتى لو سياسة اتضافت
-- بالغلط بعدين. زي باقي الجداول: المفتاح السري بس (دالة sync)، والمفتاح العام يسأل session_ok وبس
revoke all on table public.app_access from anon, authenticated;
revoke all on table public.login_sessions from anon, authenticated;
revoke all on table public.auth_mail_log from anon, authenticated;
