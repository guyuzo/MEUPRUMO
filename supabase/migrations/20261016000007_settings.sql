-- Fase 8 — resetar os dados financeiros da casa (só o dono).
-- Mantém: a casa, pessoas, acessos e convites. Categorias são mantidas ou voltam ao padrão.

create function public.reset_household(hh uuid, keep_categories boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner(hh) then
    raise exception 'only_owner' using errcode = '42501';
  end if;

  -- Ordem respeita as FKs "restrict": transações primeiro.
  delete from public.transactions where household_id = hh;
  delete from public.installment_plans where household_id = hh;
  delete from public.recurrences where household_id = hh;
  delete from public.cards where household_id = hh;            -- faturas em cascata
  delete from public.bank_accounts where household_id = hh;
  delete from public.debts where household_id = hh;
  delete from public.investments where household_id = hh;      -- cotações em cascata
  delete from public.goals where household_id = hh;            -- lançamentos em cascata
  delete from public.wishlist_sections where household_id = hh; -- itens em cascata
  delete from public.category_budgets where household_id = hh;
  delete from public.subcategory_budgets where household_id = hh;

  if not keep_categories then
    delete from public.categories where household_id = hh;     -- subcategorias em cascata
    perform public.seed_default_categories(hh);
  end if;

  update public.households set onboarding_completed = false where id = hh;
end;
$$;
revoke execute on function public.reset_household(uuid, boolean) from public, anon;
grant execute on function public.reset_household(uuid, boolean) to authenticated;
