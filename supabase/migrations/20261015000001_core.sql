-- Fase 1 — núcleo multi-tenant: households, perfis, permissões e RLS.

create type public.member_role as enum ('owner', 'member');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha casa',
  owner_id uuid not null references auth.users (id) on delete cascade,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
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
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create index permissions_user_idx on public.permissions (user_id);

-- ---------------------------------------------------------------------------
-- Helpers de autorização (security definer para não recursar na RLS de permissions)
-- ---------------------------------------------------------------------------

create function public.is_member(hh uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.permissions p
    where p.household_id = hh and p.user_id = (select auth.uid())
  );
$$;

create function public.is_owner(hh uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.permissions p
    where p.household_id = hh and p.user_id = (select auth.uid()) and p.role = 'owner'
  );
$$;

-- module: planning | transactions | debts | goals | investments | wishlist
-- action: view | edit
create function public.can(hh uuid, module text, action text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  p public.permissions;
begin
  select * into p from public.permissions
  where household_id = hh and user_id = (select auth.uid());
  if not found then
    return false;
  end if;
  if p.role = 'owner' then
    return true;
  end if;
  return coalesce((to_jsonb(p) ->> format('can_%s_%s', action, module))::boolean, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cadastro: cria perfil, household próprio e permissão de owner
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  hh uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  insert into public.households (owner_id) values (new.id) returning id into hh;

  insert into public.permissions (household_id, user_id, role)
  values (hh, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;

create policy households_select on public.households
  for select to authenticated using (public.is_member(id));
create policy households_update on public.households
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

-- Perfis visíveis para quem divide algum household com o usuário.
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or exists (
      select 1 from public.permissions mine
      join public.permissions theirs on theirs.household_id = mine.household_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy permissions_select on public.permissions
  for select to authenticated using (public.is_member(household_id));
-- Só o owner altera/remove permissões, e nunca a própria linha de owner.
create policy permissions_update on public.permissions
  for update to authenticated
  using (public.is_owner(household_id) and role <> 'owner')
  with check (public.is_owner(household_id) and role <> 'owner');
create policy permissions_delete on public.permissions
  for delete to authenticated
  using (public.is_owner(household_id) and role <> 'owner');
