# Supabase — قاعدة بيانات التجربة

المشروع: **Ads Center** (`rhrrnxsgodiideqeollo`) — فرانكفورت، الخطة المجانية.
المجلد ده مش بيتنشر على الموقع (Cloudflare بينشر `Live/` بس).

## إيه اللي بيتحفظ هنا
| الجدول | فيه إيه | مصدره |
|---|---|---|
| `ad_accounts` | حسابات Meta اللي فتحت الأداة: المعرّف، الاسم، العملة، التوقيت، أول/آخر فتح، عدد المرات | `seen` من الأداة — الاسم والعملة من Meta نفسها |
| `feedback` | إجابات «هل كان التشخيص صحيحاً؟» لعروض Meta بس: الإجابة، الأسباب، الملاحظة، نوع البطاقة وعنوانها | `save` من الأداة |
| `heartbeat` | آخر نبض من pg_cron ومن Cloudflare | يومياً |
| `private.meta_tokens` | مفتاح Meta **مشفّر** (AES-256-GCM بـ `TOKEN_ENC_KEY` + رقم الحساب) لمن فعّل الملخص التلقائي بس، وتاريخ انتهائه | `digest.enable` / `digest.refresh` — schema `private` مش ظاهرة للـ API، الوصول بدوال `vault_*` للـ service_role بس |
| `digest_settings` | البريد، أيام الملخص (الافتراضي الأحد والأربعاء)، الساعة (٩ صباحاً)، توقيت الحساب، اللغة، وقت الموافقة ونسختها | `digest.enable` / `digest.update` |
| `alert_marks` | بصمة كل تنبيه اتبعت (نوعه + العنصر + أول/آخر إرسال + آخر ظهور + اتحلّ إمتى) — عشان منكررش ونقول «حُلّت/مستمرة» | المُشغّل (`runner.ts`) |
| `send_log` | كل رسالة: نوعها وحالتها ورقمها عند Resend — **من غير محتوى** | كل إرسال |
| `pilot_requests` | طلبات الانضمام من نموذج `/join`: الصفة (`role`: مسؤول إعلانات / وكالة / صاحب متجر بيدير إعلاناته / صاحب متجر عنده مسؤول إعلانات)، الاسم، النشاط، المتجر، البلد، المنصات، رابط فيسبوك، بريد Google، البريد، واتساب، وقت الموافقة على بند التجربة، والحالة (`new` / `activated`) | `join` (عام، من غير دخول) — صف واحد لكل بريد |
| `app_access` | مين مسموح له يدخل الأداة: البريد والدور (`pilot` / `admin`) | «أرسلت الدعوة» (`join.activate`) بيضيف `pilot`. الـ `admin` بـ SQL بس |
| `login_sessions` | جلسات الدخول: الرمز **مشفّر** (HMAC)، وقت انتهائه، عدد المحاولات والإرسال، ووقت التأكيد | `login.code` / `login.verify` (`auth.ts`) |
| `auth_mail_log` | وقت كل رابط «أنشئ/غيّر كلمة المرور» (حد المرات) | `login.forgot` |
| `user_settings` | إعدادات التنبيهات لكل مستخدم (من ٢٦ أكتوبر ٢٠٢٦): `{ all, plat, asked }` — «كل الحسابات» ومجموعة لكل منصة اتخصّصت، فيها المستهدف وحد الخسارة والحدود وأقصى تكلفة لكل نتيجة (وعملتها `maxCostCur`) ولكل حملة (بمعرّف الحملة بس) — أرقام ومعرّفات، من غير أرقام إعلانات. `used_at` = آخر فتح (الحذف بعد ١٢ شهر — `purge_stale`، ومع حذف حساب الدخول) | `usettings.get` / `usettings.set` (`settings.ts`) — سجل صاحب الدخول بس. الحفظ من ٣١ أكتوبر بالمجموعات اللي اتغيّرت بس عن طريق `user_settings_apply` (دمج وهو مقفول — `SELECT … FOR UPDATE`) و`user_settings_merge` (دالة صافية بتتجرّب بـ SELECT)، فجهاز فاتح من بدري ميمسحش تعديل جهاز تاني |
| `account_settings` | قديم (٢٤–٢٦ أكتوبر ٢٠٢٦): إعدادات كل حساب إعلاني (Meta وSnapchat) قبل ما تبقى لكل مستخدم. بيتقري بس — الأداة بتنقله مرة واحدة لإعدادات المستخدم، والبريد بيرجعله لو الملخص لسه مالوش صاحب. بيتمسح بعد ١٢ شهر من آخر استخدام | `settings.get` (`settings.ts`) — بعد إثبات الوصول للحساب من المنصة نفسها |
| `alert_episodes` | سجل مشكلات التنبيه لكل مستخدم على كل إعلان (لوحة «ما حققته مع الأداة»): رقم الإعلان، النوع (`waste` / `loss`)، الأوقات، ونوع التعديل بعدها خلال ٢٤ ساعة — من غير أي أرقام إنفاق أو مبيعات. الحذف بعد ٩٠ يوم | `episodes.sync` / `episodes.decide` (`episodes.ts`) — سجل صاحب الدخول، بعد إثبات الوصول للحساب |

`digest_settings` فيها كمان آخر ملخص شهري اتبعت (`last_monthly`). أعمدة `roas_target` و`roas_break_even` و`alert_settings` قديمة: مبقتش بتتكتب ولا بتتقري من ٢٤ أكتوبر ٢٠٢٦ (البريد بيقرا إعدادات صاحب الملخص)، وقيمها اتمسحت نفس اليوم بموافقة صاحب المنتج. `user_id` = صاحب الملخص (من فعّله أو عدّله، والقديم بياخده أول مستخدم يفتحه) — البريد بيقرا `user_settings` بتاعته، ومن غيره `account_settings`.
حسابات الدخول نفسها (البريد وكلمة المرور) في Supabase Auth (`auth.users`).

**مش بيتحفظ:** محتوى الملخصات والتنبيهات، أرقام الإعلانات، الصور، أي بيانات Google، وأي بيانات Snapchat غير رقم الحساب (في سجل المشكلات وسجل الإعدادات القديم)، ومفاتيح Meta لغير من فعّل الملخص.

## الأمان
- كل الجداول: RLS مفعّل من غير سياسات + الصلاحيات مسحوبة من `anon` و`authenticated` — المتصفح مبيوصلش لأي جدول.
- الوصول الوحيد: الدالة `functions/sync` بالمفتاح السري، وبعد ما تتأكد من المنصة (Meta، أو Snapchat لإعدادات الحساب) إن مفتاح صاحب الطلب له صلاحية على الحساب.
- الدالة `verify_jwt = false` لأن فيها عمليات عامة (النبض، رابط الإيقاف، طلب الانضمام، `login.*`). من ٦ أكتوبر ٢٠٢٦ كل العمليات التانية
  محتاجة دخول مكتمل للأداة (كلمة المرور + الرمز — `requireLogin` في `auth.ts`)، وفوقه التحقق من Meta.
- `session_ok` الوحيدة المتاحة بالمفتاح العام (خادم Cloudflare بيسألها قبل `/api`) — محتاجة رقمين عشوائيين وبترجّع نعم/لا بس (مقصود).
- المفتاح المحفوظ عمره ما بيرجع للمتصفح. الإيقاف (من الأداة، أو «فصل» Meta، أو رابط `/stop` الموقّع في آخر كل رسالة) بيمسح المفتاح والإعدادات فوراً.

## النشر
- الجداول: `migrations/` — أسماء الملفات بنفس أرقام الإصدار المسجّلة في القاعدة (من ١٢ أكتوبر ٢٠٢٦)، فأدوات Supabase بتطابقها.
  أي ترحيل جديد: اسمه بنفس الرقم اللي القاعدة سجّلته (`list_migrations`).
- الدالة: `functions/sync/` — **الملفات السبعة كلها** (`index.ts` + `lib.ts` + `digest.ts` + `runner.ts` + `join.ts` + `auth.ts` + `metalink.ts`)،
  `verify_jwt = false`. من ١٩ أكتوبر ٢٠٢٦ بتتنشر **تلقائياً** لما تغيير في `functions/sync/` يوصل `main`
  (`.github/workflows/deploy-sync.yml` — Supabase CLI، بسر `SUPABASE_ACCESS_TOKEN` في GitHub). و`main` مبيوصلوش غير إيداع نجحت
  اختباراته على staging (`.github/scripts/ship.sh`). النشر اليدوي (Supabase MCP أو لوحة Supabase) احتياطي بس — النسخة ٥٤ مقدرتش
  تتبعت بيه (الملفات السبعة أكبر من طلب واحد).
  بعد النشر: رقم الإصدار اتغيّر فعلاً (`list_edge_functions` — النشر ممكن يرجّع خطأ من غير ما يتم)، ومقارنة كل ملف حرفاً بحرف مع المستودع.
- الاختبارات: `functions/tests/sync-test.ts` (Deno، من غير شبكة ولا قاعدة) — بتتشغّل في التكامل المستمر مع كل push
  (`.github/workflows/tests.yml`). محلياً: `deno test --allow-env --no-check supabase/functions/tests/sync-test.ts`.

## المُشغّل (التنبيهات العاجلة بالبريد)
- `runner-10min` (pg_cron كل ١٠ دقايق) → `sync` بـ `action: run` ومفتاح عشوائي من Vault (`runner_key`) في الهيدر. مفيش مفتاح في الكود.
  الفحص العاجل مرة في الساعة لكل حساب (`checked_at`)، والملخصات اللي ميعادها جه الأول — كل تشغيل حدّه ~١١٠ ثانية والملخص ~٣٠ ثانية للحساب.
- الملخص: في الأيام والساعة اللي العميل اختارها بتوقيت الحساب، ويغطي الأيام من آخر ملخص (`last_summary_until`) لحد أمس،
  مقارنةً بالفترة اللي قبلها مباشرةً بنفس الطول + التعديلات ونتيجتها (سجل Meta) + «حُلّت/مستمرة» للتنبيهات العاجلة. التفعيل بيسجّل أمس
  كآخر ملخص، فأول ملخص في ميعاده الجاي. معاينة من غير إرسال: `action: digest.previewSummary` (`{ token, accountId, lang, since?, until? }`).
- بيشغّل **نفس محرك الأداة** (`Live/js/i18n.js` و`alerts.js` و`core.js` و`diagnosis.js` و`meta.js`) من GitHub على commit ثابت: `ENGINE_COMMIT` في `runner.ts`.
- **أي تعديل في الملفات الخمسة دي** = حدّث `ENGINE_COMMIT` لآخر commit وانشر الدالة تاني. لو نسيت، المُشغّل بيكمّل بالنسخة القديمة
  وبيسجّل `runner-engine-outdated` في `heartbeat` (الاستعلام تحت).
- بيسكت من ١١ مساءً لـ ٧ صباحاً بتوقيت كل حساب. العاجل بس (critical) — بصمة لكل تنبيه، تذكير واحد بعد يومين، و«اتحلّ» بعد ٢٤ ساعة من غير ما يظهر.
- العاجل = محرك الأداة (`analyze`) + تلات فحوص بتحتاج بيانات زيادة (قواعدها في `alerts.js`، والجلب في `runner.ts` → `extraAlerts`):
  - الموقع (`siteAlerts`): التتبّع وقف، أو الضغطات مبتوصلش للصفحة، أو الشراء وقف — أمس مقابل الأيام اللي قبله.
  - التعديل الكبير (`editAlerts`): ميزانية اتضاعفت/اتنصّت أو إيقاف عنصر مؤثر، من سجل Meta **من آخر فحص بس** (كل تعديل بيتقيّم مرة).
  - الروابط (`linkAlerts`): أكبر ١٠ صفحات هبوط بالإنفاق (إعلانات شغّالة صرفت امبارح أو النهارده). ٤٠٤/٤١٠ = معطّل فوراً، 5xx أو مفيش رد = مرتين
    ورا بعض، والحجب الأمني مش عطل. البصمة `u:` + جزء من SHA-1 للرابط (من غير الرابط نفسه).
  - «التعديل الكبير» حدث لحظي: مبيظهرش في «حُلّت/مستمرة» في الملخص، ومبيتكررش لو نفس العنصر عليه «أكبر مصدر وقف».
- معاينة من غير إرسال (لمدير تطبيق Meta بس): `action: digest.preview` بـ `{ token, accountId, lang }` — التعديلات فيها من آخر ٢٤ ساعة.
- إعدادات حساسية التنبيهات بتاعة العميل محفوظة في متصفحه بس، فالمُشغّل بيستخدم الإعدادات الافتراضية — إلا العائد المستهدف
  وحد الخسارة: الأداة بتبعتهم مع `digest.refresh` و`digest.enable` و`digest.update`، والمُشغّل بيستخدمهم.
- **عقد المحرك:** المُشغّل بيستخدم أسماء عامة من الملفات الخمسة (`g.اسم`). اختبار «عقد المُشغّل» في `Live/tests/tests.js` بيحمّل الملفات
  الخمسة لوحدها وبيتأكد إن كل اسم موجود، والتكامل المستمر بيفشل لو `ENGINE_COMMIT` أقدم من ملفات المحرك.

## طلبات الانضمام (نموذج `/join` — `join.ts`)
- العميل بيملا النموذج → الطلب بيتحفظ في `pilot_requests` → يوصل إشعار على support@ فيه البيانات وخطوات إضافته على Meta وGoogle
  وزرار «أرسلت الدعوة». الرد على الإشعار بيروح للعميل نفسه.
- بعد ما تضيفه: الزرار بيفتح `/invited` (رابط موقّع) → «أرسل رسالة التفعيل» → رسالة للعميل بلغته فيها قبول دعوة فيسبوك
  من الموبايل (من جوه التطبيق بالبحث — رابط الإعدادات مبيوصلش للدعوات على الموبايل) ومن الكمبيوتر، وخطوات Google وSnapchat.
- **مفيش أي رسالة للعميل قبل الزرار**: اللي يكتب بريد حد تاني ميقدرش يخلّينا نبعتله. الحماية: حقل مخفي، ووقت ملء النموذج،
  و٣٠ طلب في الساعة كحد أقصى، ونفس البريد خلال ١٠ دقايق بيتحدّث من غير إشعار جديد.
- لو الإشعار ماوصلش، الطلب موجود في الجدول (الاستعلام تحت). الرابط الموقّع مش بيتعمل من SQL — اطلبه من Claude أو ابعت الرسالة يدوياً.
- **الوعد: التفعيل خلال ٢٤ ساعة (أي يوم).** طلب لسه `new` عدّى عليه ١٨ ساعة = تذكير واحد على support@ (نفس الإشعار بعنوان «تذكير: باقٍ …»)
  من المُشغّل كل ١٠ دقايق (`joinReminders` في `join.ts`)، ووقته في `reminded_at`. الطلبات الأقدم من أسبوع مبيجيلهاش تذكير.

## متابعة يومية
```sql
-- دقة التشخيص لكل نوع بطاقة
select * from feedback_accuracy;
-- آخر الإجابات «لا» ومعاها السبب
select view_key, block_title, reasons, note, answered_at from feedback where verdict = 'no' order by answered_at desc limit 20;
-- عملاء التجربة
select account_id, name, currency, opens, first_seen, last_seen from ad_accounts order by last_seen desc;
-- المشروع شغال؟ (pg_cron وcloudflare خلال آخر ٢٤ ساعة، وrunner خلال آخر ساعة)
-- لو ظهر runner-engine-outdated بعد آخر نشر: ENGINE_COMMIT محتاج يتحدّث
select source, at, now() - at as since_last from heartbeat;
-- آخر فحص لكل حساب، والتنبيهات العاجلة المفتوحة (من غير أي أرقام)
select account_id, checked_at from digest_settings order by checked_at nulls first;
select account_id, kind, object_id, first_at, times_sent, resolved_at from alert_marks order by first_at desc limit 30;
-- الملخص التلقائي: مين مفعّله، وحالة المفتاح (من غير المفتاح نفسه)
select s.account_id, s.summary_days, s.summary_hour, s.timezone, t.expires_at, t.last_used_at, t.last_error
  from digest_settings s left join private.meta_tokens t using (account_id);
-- رسائل فشلت آخر أسبوع
select account_id, type, error, sent_at from send_log where status = 'failed' and sent_at > now() - interval '7 days' order by sent_at desc;
-- طلبات الانضمام اللي لسه متفعّلتش
select created_at, role, name, business, email, platforms, fb_profile, google_email, submissions from pilot_requests where status = 'new' order by created_at desc;
-- مين اللي بيطلب الانضمام (الصفة × البلد)
select role, country, count(*) from pilot_requests group by 1, 2 order by 3 desc;
```

## حذف بيانات عميل عند طلبه (سياسة الخصوصية: خلال ٣٠ يوم)
```sql
delete from feedback where view_key = 'meta:act_XXXX';
delete from ad_accounts where platform = 'meta' and account_id = 'act_XXXX';
delete from private.meta_tokens where account_id = 'act_XXXX';
delete from digest_settings where account_id = 'act_XXXX';
delete from alert_marks where account_id = 'act_XXXX';
delete from send_log where account_id = 'act_XXXX';
-- طلب الانضمام (بالبريد اللي أرسل بيه)
delete from pilot_requests where email = 'name@example.com';
-- الدخول للأداة (من ٦ أكتوبر ٢٠٢٦): جلساته وسجل روابط كلمة المرور وإذن الدخول، وبعدهم حسابه في Supabase Auth
delete from login_sessions where user_id = (select id from auth.users where email = 'name@example.com');
delete from auth_mail_log where email = 'name@example.com';
delete from app_access where email = 'name@example.com';
-- وبعدها: لوحة Supabase ← Authentication ← Users ← المستخدم ← Delete user
```
**ملاحظة (١٢ أكتوبر ٢٠٢٦):** سطور الدخول التلاتة اتضافت في مراجعة المرحلة ٢ — قبلها خطوات الحذف كانت بتسيب بيانات الدخول.
**المرحلة ٣ (١٧ أكتوبر ٢٠٢٦):** اتراجعت الجداول الـ١١ كلها — الخطوات دي بتغطي كل جدول فيه بيانات شخصية (`heartbeat` ملوش بيانات أشخاص).

## مدة الاحتفاظ
`purge_stale()` أول كل شهر: بيمسح الحساب وتقييماته وإعدادات الملخص وبصماته وسجل رسائله بعد ١٢ شهر من آخر فتح للأداة.
`purge_expired_tokens()` يومياً: مفاتيح Meta المنتهية.
`purge-join-requests-monthly` أول كل شهر: طلبات الانضمام بعد ١٢ شهر من آخر تحديث.
`purge-old-marks-daily` يومياً: بصمات التنبيهات اللي اتحلّت من أكتر من ٤٥ يوم.
`purge_login_data()` يومياً (من ١٧ أكتوبر ٢٠٢٦ — المرحلة ٣): سجل رسائل كلمة المرور بعد ٧ أيام، وصف جلسة الدخول لما الجلسة
تخلص عند Supabase أو بعد ٣١ يوم من آخر تأكيد أو لو متأكدتش خلال يوم. حساب الدخول نفسه (`auth.users` و`app_access`) بيفضل
طول ما الوصول قايم، ويتمسح بالطلب (فوق).

## النسخ الاحتياطي
الخطة المجانية **مفيهاش نسخ احتياطي تلقائي**. التقييمات ليها نسخة على أجهزة العملاء (localStorage)،
لكن لما البيانات تكبر لازم نسخة خارجية دورية (مش في المستودع ده — المستودع عام).
