-- إعدادات التنبيهات لكل حساب إعلاني جوه سجل المستخدم (قرار صاحب المنتج ٨ نوفمبر ٢٠٢٦: «تسجل الارقام لكل حساب
-- اعلاني في كل منصة لكل مستخدم، بحيث عند تبديل الحساب الاعلاني يتغير معها العائد المطلوب وباقي اعدادات التنبيهات»).
-- acct = { "<منصة>:<رقم الحساب>": {…} }؛ وall/plat القديمة بتفضل قيم بداية لأي حساب مالوش سجل (alerts.js settingsForAccount)
-- نفس التوقيع ونفس باقي الفروع (20261031130000) + فرع acct: مجموعة كاملة مكان القديمة، وnull = مسح سجل الحساب
create or replace function public.user_settings_merge(cur jsonb, p_changes jsonb, p_goals jsonb, p_asked boolean)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $$
declare
  k text;
  v jsonb;
  ak text;
  av jsonb;
  res jsonb := coalesce(cur, '{}'::jsonb);
begin
  if jsonb_typeof(res -> 'all') is distinct from 'object' then res := res || '{"all": {}}'::jsonb; end if;
  for k, v in select key, value from jsonb_each(coalesce(p_changes, '{}'::jsonb)) loop
    if k = 'all' then
      if jsonb_typeof(v) = 'object' then res := jsonb_set(res, '{all}', v); end if;
    elsif k = 'prefs' then
      if jsonb_typeof(v) = 'object' then
        res := jsonb_set(res, '{prefs}', (case when jsonb_typeof(res -> 'prefs') = 'object' then res -> 'prefs' else '{}'::jsonb end) || v);
      end if;
    elsif k = 'acct' then
      if jsonb_typeof(v) = 'object' then
        if jsonb_typeof(res -> 'acct') is distinct from 'object' then res := res || '{"acct": {}}'::jsonb; end if;
        for ak, av in select key, value from jsonb_each(v) loop
          if jsonb_typeof(av) = 'object' then
            res := jsonb_set(res, array['acct', ak], av);
          elsif jsonb_typeof(av) = 'null' then
            res := res #- array['acct', ak];
          end if;
        end loop;
        if res -> 'acct' = '{}'::jsonb then res := res - 'acct'; end if;
      end if;
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
revoke execute on function public.user_settings_merge(jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.user_settings_merge(jsonb, jsonb, jsonb, boolean) to service_role;
