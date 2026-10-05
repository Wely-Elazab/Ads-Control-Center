-- «أنت:» في نموذج الانضمام (قرار صاحب المنتج ٥ أكتوبر ٢٠٢٦): الأداة الحالية لمسؤول الإعلانات، والسؤال ده بيقولنا
-- مين اللي بيطلب فعلاً بدل التخمين. القيم لازم تطابق ROLES في join.ts والاختيارات في join.html.
-- فاضي (null) = طلب قديم قبل السؤال — join.ts بيرفض أي طلب جديد من غيره.
alter table public.pilot_requests add column role text
  check (role in ('media_buyer', 'agency', 'owner_self', 'owner_managed'));
