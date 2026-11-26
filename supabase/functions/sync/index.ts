// Ads Center — دالة المزامنة (Supabase Edge Function: sync)
// https://rhrrnxsgodiideqeollo.supabase.co/functions/v1/sync — POST بجسم JSON فيه action:
//   ping  ← نبض يومي من Cloudflare (الخطة المجانية بتوقف المشروع بعد أسبوع من غير نشاط). مفيش بيانات
//   seen  ← { token, accountId } الحساب فتح الأداة (سجل عملاء التجربة)
//   list  ← { token, viewKey } إجابات «هل كان التشخيص صحيحاً؟» للعرض ده
//   save  ← { token, viewKey, entry, info } حفظ إجابة واحدة
//   digest.* و stop ← الملخص والتنبيهات التلقائية بالبريد (digest.ts)
//   selfcheck ← { token } لمدير تطبيق Meta بس: الأسرار موجودة وسليمة؟ (حالة بس — عمره ما بيرجّع قيمة سر)
//   testmail  ← { token } لمدير التطبيق بس: رسالة تجريبية لـ support@adscenter.online (العنوان ثابت — مش بياخد مستلم)
//   run       ← pg_cron كل دقيقتين (الفحص العاجل لكل حساب مرة في الساعة تقريباً)، بهيدر x-runner-key (مفتاح عشوائي في Vault): فحص التنبيهات العاجلة (runner.ts)
//   digest.preview ← { token, accountId, lang } لمدير التطبيق بس: الرسالة العاجلة اللي كانت هتتبعت دلوقتي، من غير إرسال
//   digest.previewSummary ← { token, accountId, lang, since?, until?, monthly? } لمدير التطبيق بس: رسالة الملخص (أو الشهري)، من غير إرسال
//   join و join.peek و join.activate ← طلبات الانضمام للتجربة من نموذج /join، وزرار «أرسلت الدعوة» في إشعارنا (join.ts)
//   login.* ← تسجيل الدخول للأداة: كلمة المرور + رمز على البريد (auth.ts)
//   meta.seal و meta.renew ← ربط Meta المحفوظ على الجهاز، عشان الهاتف ميفصلش الحسابات كل مرة (metalink.ts)
//   usettings.get و usettings.set ← إعدادات التنبيهات لصاحب الدخول (settings.ts)، وsettings.get ← سجل الحساب القديم (للنقل)
//   episodes.sync و episodes.decide و episodes.amounts ← سجل مشكلات التنبيه للوحة «ما حققته مع الأداة» ومبالغها (episodes.ts)
//
// الأمان: الدالة عامة (verify_jwt = false) لأن فيها عمليات من غير دخول (النبض، رابط الإيقاف، طلب الانضمام، login.*).
// من ٦ أكتوبر ٢٠٢٦ كل العمليات التانية محتاجة دخول مكتمل للأداة (هيدر authorization: كلمة المرور + الرمز — requireLogin)،
// وفوقه كل طلب فيه مفتاح Meta بتاع صاحب المتجر، والدالة بتسأل Meta نفسها إن المفتاح ده عنده صلاحية على الحساب
// الإعلاني قبل ما تقرا أو تكتب أي حاجة. مفتاح Meta بيتستخدم في الطلب ده بس — مبيتحفظش (إلا لو العميل فعّل الملخص
// التلقائي، وساعتها مشفّر — digest.ts) ومبيتكتبش في السجلات.
// viewKey = «meta:act_123» بس: عرض «كل المنصات» فيه بيانات Google (أسماء حملات وأرقام حسابات)، وسياسة
// الخصوصية بتقول إننا مش بنحفظ أي بيانات Google — فهو وعروض Google وSnapchat بيفضلوا على جهاز العميل.

import { handle } from './handler.ts';

// المعالج نفسه في handler.ts (التدقيق الشامل ٢٥ نوفمبر ٢٠٢٦، ١١٦): هنا التشغيل بس، عشان الاختبار يستورد المعالج من غير ما يشغّل خادم
Deno.serve(handle);
