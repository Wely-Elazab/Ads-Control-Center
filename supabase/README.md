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
| `alert_marks` | بصمة كل تنبيه اتبعت (نوعه + العنصر + أول/آخر إرسال + اتحلّ إمتى) — عشان منكررش ونقول «حُلّت/مستمرة» | المُشغّل (لسه) |
| `send_log` | كل رسالة: نوعها وحالتها ورقمها عند Resend — **من غير محتوى** | كل إرسال |

**مش بيتحفظ:** محتوى الملخصات والتنبيهات، أرقام الإعلانات، الصور، أي بيانات Google أو Snapchat، ومفاتيح Meta لغير من فعّل الملخص.

## الأمان
- كل الجداول: RLS مفعّل من غير سياسات + الصلاحيات مسحوبة من `anon` و`authenticated` — المتصفح مبيوصلش لأي جدول.
- الوصول الوحيد: الدالة `functions/sync` بالمفتاح السري، وبعد ما تتأكد من Meta إن مفتاح صاحب الطلب له صلاحية على الحساب.
- الدالة `verify_jwt = false` (مفيش حسابات Supabase للمستخدمين) — التحقق جوّاها من Meta.
- المفتاح المحفوظ عمره ما بيرجع للمتصفح. الإيقاف (من الأداة، أو «فصل» Meta، أو رابط `/stop` الموقّع في آخر كل رسالة) بيمسح المفتاح والإعدادات فوراً.

## النشر
- الجداول: `migrations/` (اتطبّقت على المشروع بنفس الترتيب).
- الدالة: `functions/sync/` (`index.ts` + `lib.ts` + `digest.ts`) — بتتنشر من Claude (Supabase MCP) أو من لوحة Supabase. **مش** بتتنشر تلقائياً مع push.

## متابعة يومية
```sql
-- دقة التشخيص لكل نوع بطاقة
select * from feedback_accuracy;
-- آخر الإجابات «لا» ومعاها السبب
select view_key, block_title, reasons, note, answered_at from feedback where verdict = 'no' order by answered_at desc limit 20;
-- عملاء التجربة
select account_id, name, currency, opens, first_seen, last_seen from ad_accounts order by last_seen desc;
-- المشروع شغال؟ (النبض لازم يكون خلال آخر ٢٤ ساعة)
select source, at, now() - at as since_last from heartbeat;
-- الملخص التلقائي: مين مفعّله، وحالة المفتاح (من غير المفتاح نفسه)
select s.account_id, s.summary_days, s.summary_hour, s.timezone, t.expires_at, t.last_used_at, t.last_error
  from digest_settings s left join private.meta_tokens t using (account_id);
-- رسائل فشلت آخر أسبوع
select account_id, type, error, sent_at from send_log where status = 'failed' and sent_at > now() - interval '7 days' order by sent_at desc;
```

## حذف بيانات عميل عند طلبه (سياسة الخصوصية: خلال ٣٠ يوم)
```sql
delete from feedback where view_key = 'meta:act_XXXX';
delete from ad_accounts where platform = 'meta' and account_id = 'act_XXXX';
delete from private.meta_tokens where account_id = 'act_XXXX';
delete from digest_settings where account_id = 'act_XXXX';
delete from alert_marks where account_id = 'act_XXXX';
delete from send_log where account_id = 'act_XXXX';
```

## مدة الاحتفاظ
`purge_stale()` أول كل شهر: بيمسح الحساب وتقييماته وإعدادات الملخص وبصماته وسجل رسائله بعد ١٢ شهر من آخر فتح للأداة.
`purge_expired_tokens()` يومياً: مفاتيح Meta المنتهية.

## النسخ الاحتياطي
الخطة المجانية **مفيهاش نسخ احتياطي تلقائي**. التقييمات ليها نسخة على أجهزة العملاء (localStorage)،
لكن لما البيانات تكبر لازم نسخة خارجية دورية (مش في المستودع ده — المستودع عام).
