-- Fase 7 — pessoas da casa, convites, permissões e divisão de gastos.

-- Permite embutir o perfil ao listar permissões (permissions → profiles).
alter table public.permissions
  add constraint permissions_user_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade;

-- ===========================================================================
-- Pessoas da casa (podem ou não ter acesso ao app)
-- ===========================================================================

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 80),
  relationship text check (length(relationship) <= 40),
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  user_id uuid references public.profiles (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, user_id)
);

alter table public.transactions
  add column household_member_id uuid,
  add foreign key (household_member_id, household_id)
    references public.household_members (id, household_id) on delete set null (household_member_id);

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  transaction_id uuid not null,
  member_id uuid not null,
  percentage numeric(5, 2) not null check (percentage > 0 and percentage <= 100),
  unique (transaction_id, member_id),
  foreign key (transaction_id) references public.transactions (id) on delete cascade,
  foreign key (member_id, household_id) references public.household_members (id, household_id) on delete cascade
);
create index transaction_splits_tx_idx on public.transaction_splits (transaction_id);

-- ===========================================================================
-- Convites
-- ===========================================================================

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- 64 hex = 244 bits aleatórios (dois UUID v4).
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  full_name text not null check (length(trim(full_name)) between 1 and 80),
  email text,
  can_view_planning boolean not null default true,
  can_edit_planning boolean not null default false,
  can_view_transactions boolean not null default true,
  can_edit_transactions boolean not null default false,
  can_view_debts boolean not null default true,
  can_edit_debts boolean not null default false,
  can_view_goals boolean not null default true,
  can_edit_goals boolean not null default false,
  can_view_investments boolean not null default true,
  can_edit_investments boolean not null default false,
  can_view_wishlist boolean not null default true,
  can_edit_wishlist boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_household_idx on public.invites (household_id);

-- Resumo público do convite (sem dados sensíveis) para a página de aceite.
create function public.get_invite_summary(p_token text)
returns table (household_name text, invited_by text, invitee_name text, status text)
language sql stable security definer set search_path = ''
as $$
  select
    h.name,
    coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Alguém'),
    i.full_name,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'valid'
    end
  from public.invites i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.created_by
  where i.token = p_token;
$$;
grant execute on function public.get_invite_summary(text) to anon, authenticated;

-- Aceita o convite: cria a permissão com o que foi definido e liga (ou cria) a pessoa da casa.
create function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invites;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into inv from public.invites where token = p_token for update;
  if not found or inv.revoked_at is not null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invite_already_used' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.permissions where household_id = inv.household_id and user_id = uid) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.permissions (
    household_id, user_id, role,
    can_view_planning, can_edit_planning, can_view_transactions, can_edit_transactions,
    can_view_debts, can_edit_debts, can_view_goals, can_edit_goals,
    can_view_investments, can_edit_investments, can_view_wishlist, can_edit_wishlist
  ) values (
    inv.household_id, uid, 'member',
    inv.can_view_planning, inv.can_edit_planning, inv.can_view_transactions, inv.can_edit_transactions,
    inv.can_view_debts, inv.can_edit_debts, inv.can_view_goals, inv.can_edit_goals,
    inv.can_view_investments, inv.can_edit_investments, inv.can_view_wishlist, inv.can_edit_wishlist
  );

  insert into public.household_members (household_id, full_name, user_id)
  values (
    inv.household_id,
    coalesce(nullif((select full_name from public.profiles where id = uid), ''), inv.full_name),
    uid
  )
  on conflict (household_id, user_id) do nothing;

  update public.invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.household_id;
end;
$$;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- ===========================================================================
-- Divisão de gastos: substitui as divisões de uma transação atomicamente.
-- security invoker: exige a mesma permissão de editar transações.
-- ===========================================================================

create function public.set_transaction_splits(p_transaction_id uuid, p_splits jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  hh uuid;
  total numeric;
begin
  select household_id into hh from public.transactions where id = p_transaction_id;
  if hh is null then
    raise exception 'transaction_not_found' using errcode = 'P0002';
  end if;

  delete from public.transaction_splits where transaction_id = p_transaction_id;
  if p_splits is null or jsonb_array_length(p_splits) = 0 then
    return;
  end if;

  select sum((s ->> 'percentage')::numeric) into total from jsonb_array_elements(p_splits) s;
  if total <> 100 then
    raise exception 'splits_must_total_100' using errcode = '23514';
  end if;

  insert into public.transaction_splits (household_id, transaction_id, member_id, percentage)
  select hh, p_transaction_id, (s ->> 'member_id')::uuid, (s ->> 'percentage')::numeric
  from jsonb_array_elements(p_splits) s;
end;
$$;

-- ===========================================================================
-- Cadastro passa a criar a pessoa da casa do dono; households existentes recebem a sua.
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  hh uuid;
  name text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  insert into public.profiles (id, full_name) values (new.id, name);
  insert into public.households (owner_id) values (new.id) returning id into hh;
  insert into public.permissions (household_id, user_id, role) values (hh, new.id, 'owner');
  insert into public.household_members (household_id, full_name, user_id, relationship)
  values (hh, coalesce(nullif(name, ''), 'Eu'), new.id, 'Titular');
  perform public.seed_default_categories(hh);
  return new;
end;
$$;

insert into public.household_members (household_id, full_name, user_id, relationship)
select p.household_id, coalesce(nullif(pr.full_name, ''), 'Eu'), p.user_id, case when p.role = 'owner' then 'Titular' end
from public.permissions p
join public.profiles pr on pr.id = p.user_id
on conflict (household_id, user_id) do nothing;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.household_members enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.invites enable row level security;

create policy household_members_select on public.household_members
  for select to authenticated using (public.is_member(household_id));
create policy household_members_write on public.household_members
  for all to authenticated using (public.is_owner(household_id)) with check (public.is_owner(household_id));

create policy transaction_splits_select on public.transaction_splits
  for select to authenticated using (public.can(household_id, 'transactions', 'view'));
create policy transaction_splits_write on public.transaction_splits
  for all to authenticated
  using (public.can(household_id, 'transactions', 'edit'))
  with check (public.can(household_id, 'transactions', 'edit'));

-- Convites: só o dono vê e gerencia (o token dá acesso à casa).
create policy invites_owner on public.invites
  for all to authenticated using (public.is_owner(household_id)) with check (public.is_owner(household_id));

-- Membro pode sair da casa (remover a própria permissão, nunca a de dono).
create policy permissions_leave on public.permissions
  for delete to authenticated using (user_id = (select auth.uid()) and role <> 'owner');
