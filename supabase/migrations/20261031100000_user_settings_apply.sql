-- حفظ إعدادات المستخدم بالجزء اللي اتغيّر بس (مراجعة الإعدادات لكل مستخدم — ٣١ أكتوبر ٢٠٢٦، طلب صاحب المنتج «دقق جيداً»):
-- قبل كده الحفظ كان بيكتب السجل كله من نسخة الجهاز، فجهاز فاتح من بدري كان بيمسح تعديل اتعمل من جهاز تاني (تخصيص منصة أو حد
-- حملة) من غير ما حد يعرف — «التحديث المفقود». دلوقتي الطلب فيه المجموعات اللي اتغيّرت بس، والدمج هنا على السجل الحالي وهو مقفول
-- (SELECT … FOR UPDATE — PostgreSQL «Explicit Locking»)، فحفظين في نفس اللحظة مبيمسحوش بعض.
--
-- user_settings_merge: دالة صافية (من غير جداول) — بتتجرّب بـ SELECT لوحدها:
--   p_changes = { all: {…}, meta: {…} | null, … } — مجموعة كاملة بتاخد مكان القديمة، وnull = إلغاء تخصيص المنصة
--   p_goals   = { roasTarget, roasBreakEven } بيتدمجوا في «كل الحسابات» (نافذة أول مرة — من غير ما تلمس باقي القيم)
--   p_asked   = نافذة أول مرة اتعرضت
-- user_settings_apply: السجل لو مش موجود بيبدأ بـ p_base (نقل الإعدادات القديمة — «إنشاء لو مش موجود» بس، فجهازين بينقلوا في نفس
-- الوقت = الأول بيكسب والتاني بياخد اللي اتحفظ)، وبعدين الدمج. القيم متنضّفة قبلها في settings.ts (cleanUserWrite)
create or replace function public.user_settings_merge(cur jsonb, p_changes jsonb, p_goals jsonb, p_asked boolean)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $$
declare
  k text;
  v jsonb;
  res jsonb := coalesce(cur, '{}'::jsonb);
begin
  if jsonb_typeof(res -> 'all') is distinct from 'object' then res := res || '{"all": {}}'::jsonb; end if;
  for k, v in select key, value from jsonb_each(coalesce(p_changes, '{}'::jsonb)) loop
    if k = 'all' then
      if jsonb_typeof(v) = 'object' then res := jsonb_set(res, '{all}', v); end if;
    elsif jsonb_typeof(v) = 'object' then
      if jsonb_typeof(res -> 'plat') is distinct from 'object' then res := res || '{"plat": {}}'::jsonb; end if;
      res := jsonb_set(res, array['plat', k], v);
    elsif jsonb_typeof(v) = 'null' then
      res := res #- array['plat', k];
    end if;
  end loop;
  if jsonb_typeof(p_goals) = 'object' then res := jsonb_set(res, '{all}', (res -> 'all') || p_goals); end if;
  if p_asked then res := res || '{"asked": true}'::jsonb; end if;
  if res -> 'plat' = '{}'::jsonb then res := res - 'plat'; end if;
  return res;
end;
$$;

create or replace function public.user_settings_apply(p_user uuid, p_base jsonb, p_changes jsonb, p_goals jsonb, p_asked boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  cur jsonb;
begin
  insert into public.user_settings (user_id, settings) values (p_user, coalesce(p_base, '{"all": {}}'::jsonb))
    on conflict (user_id) do nothing;
  select settings into cur from public.user_settings where user_id = p_user for update;
  cur := public.user_settings_merge(cur, p_changes, p_goals, coalesce(p_asked, false));
  update public.user_settings set settings = cur, updated_at = now(), used_at = now() where user_id = p_user;
  return cur;
end;
$$;

revoke execute on function public.user_settings_merge(jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.user_settings_apply(uuid, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.user_settings_merge(jsonb, jsonb, jsonb, boolean) to service_role;
grant execute on function public.user_settings_apply(uuid, jsonb, jsonb, jsonb, boolean) to service_role;
