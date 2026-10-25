-- بريد Snapchat في طلب الانضمام (طلب صاحب المنتج ٢٦ أكتوبر ٢٠٢٦): زي بريد Google Ads، لو اختار Snapchat — بيوصلنا مع إشعار الطلب
-- ومبيستخدمش في التفعيل. فاضي = نفس بريده الأساسي (join.ts)
alter table public.pilot_requests add column if not exists snap_email text check (snap_email is null or char_length(snap_email) <= 254);
