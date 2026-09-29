# Supabase — قاعدة بيانات التجربة

المشروع: **Ads Center** (`rhrrnxsgodiideqeollo`) — فرانكفورت، الخطة المجانية.
المجلد ده مش بيتنشر على الموقع (Cloudflare بينشر `Live/` بس).

## إيه اللي بيتحفظ هنا
| الجدول | فيه إيه | مصدره |
|---|---|---|
| `ad_accounts` | حسابات Meta اللي فتحت الأداة: المعرّف، الاسم، العملة، التوقيت، أول/آخر فتح، عدد المرات | `seen` من الأداة — الاسم والعملة من Meta نفسها |
| `feedback` | إجابات «هل كان التشخيص صحيحاً؟» لعروض Meta بس: الإجابة، الأسباب، الملاحظة، نوع البطاقة وعنوانها | `save` من الأداة |
| `heartbeat` | آخر نبض من pg_cron ومن Cloudflare | يومياً |

**مش بيتحفظ:** مفاتيح دخول المنصات، أرقام الإعلانات، الصور، أي بيانات Google أو Snapchat.

## الأمان
- كل الجداول: RLS مفعّل من غير سياسات + الصلاحيات مسحوبة من `anon` و`authenticated` — المتصفح مبيوصلش لأي جدول.
- الوصول الوحيد: الدالة `functions/sync` بالمفتاح السري، وبعد ما تتأكد من Meta إن مفتاح صاحب الطلب له صلاحية على الحساب.
- الدالة `verify_jwt = false` (مفيش حسابات Supabase للمستخدمين) — التحقق جوّاها من Meta.

## النشر
- الجداول: `migrations/` (اتطبّقت على المشروع بنفس الترتيب).
- الدالة: `functions/sync/index.ts` — بتتنشر من Claude (Supabase MCP) أو من لوحة Supabase. **مش** بتتنشر تلقائياً مع push.

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
```

## حذف بيانات عميل عند طلبه (سياسة الخصوصية: خلال ٣٠ يوم)
```sql
delete from feedback where view_key = 'meta:act_XXXX';
delete from ad_accounts where platform = 'meta' and account_id = 'act_XXXX';
```

## مدة الاحتفاظ
`purge_stale()` أول كل شهر: بيمسح الحساب وتقييماته بعد ١٢ شهر من آخر فتح للأداة.

## النسخ الاحتياطي
الخطة المجانية **مفيهاش نسخ احتياطي تلقائي**. التقييمات ليها نسخة على أجهزة العملاء (localStorage)،
لكن لما البيانات تكبر لازم نسخة خارجية دورية (مش في المستودع ده — المستودع عام).
