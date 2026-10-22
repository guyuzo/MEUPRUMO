-- Lista de desejos: de quem é cada desejo (pessoa da casa). Sem pessoa = da casa toda.
alter table public.wishlist_items
  add column member_id uuid,
  add foreign key (member_id, household_id)
    references public.household_members (id, household_id) on delete set null (member_id);

create index wishlist_items_member_idx on public.wishlist_items (member_id) where member_id is not null;
