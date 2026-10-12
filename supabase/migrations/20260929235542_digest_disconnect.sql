-- «فصل» Meta داخل الأداة بيمسح كل المفاتيح اللي صاحب الجلسة دي فعّل بيها الملخص (مش الحساب المفتوح بس) —
-- سياسة الخصوصية: «يُحذف مفتاح الدخول المحفوظ فور ... ضغطك فصل». بيرجّع أرقام الحسابات عشان تتمسح إعداداتها
create function public.vault_delete_user_tokens(p_user text)
returns setof text language sql security definer set search_path = '' as $$
  delete from private.meta_tokens where meta_user_id = p_user returning account_id;
$$;
revoke execute on function public.vault_delete_user_tokens(text) from public, anon, authenticated;
grant execute on function public.vault_delete_user_tokens(text) to service_role;
