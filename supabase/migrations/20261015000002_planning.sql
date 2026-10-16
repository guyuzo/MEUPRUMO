-- Fase 2 — planejamento: categorias, subcategorias e orçamentos mensais.

create type public.category_kind as enum ('expense', 'income');

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind public.category_kind not null default 'expense',
  name text not null check (length(trim(name)) between 1 and 60),
  emoji text not null default '📦',
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  -- Alvo das FKs compostas: garante que filhos fiquem no mesmo household.
  unique (id, household_id)
);
create index categories_household_idx on public.categories (household_id, kind, sort_order);

create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  category_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 60),
  emoji text,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (category_id, household_id)
    references public.categories (id, household_id) on delete cascade
);
create index subcategories_category_idx on public.subcategories (category_id, sort_order);

-- period = primeiro dia do mês.
create table public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  category_id uuid not null,
  period date not null check (extract(day from period) = 1),
  amount bigint not null check (amount >= 0),
  unique (category_id, period),
  foreign key (category_id, household_id)
    references public.categories (id, household_id) on delete cascade
);

create table public.subcategory_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  subcategory_id uuid not null,
  period date not null check (extract(day from period) = 1),
  amount bigint not null check (amount >= 0),
  unique (subcategory_id, period),
  foreign key (subcategory_id, household_id)
    references public.subcategories (id, household_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- RLS — qualquer membro enxerga categorias (são usadas em transações);
-- orçamentos exigem view de planning; escrita exige edit de planning.
-- ---------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.category_budgets enable row level security;
alter table public.subcategory_budgets enable row level security;

create policy categories_select on public.categories
  for select to authenticated using (public.is_member(household_id));
create policy categories_write on public.categories
  for all to authenticated
  using (public.can(household_id, 'planning', 'edit'))
  with check (public.can(household_id, 'planning', 'edit'));

create policy subcategories_select on public.subcategories
  for select to authenticated using (public.is_member(household_id));
create policy subcategories_write on public.subcategories
  for all to authenticated
  using (public.can(household_id, 'planning', 'edit'))
  with check (public.can(household_id, 'planning', 'edit'));

create policy category_budgets_select on public.category_budgets
  for select to authenticated using (public.can(household_id, 'planning', 'view'));
create policy category_budgets_write on public.category_budgets
  for all to authenticated
  using (public.can(household_id, 'planning', 'edit'))
  with check (public.can(household_id, 'planning', 'edit'));

create policy subcategory_budgets_select on public.subcategory_budgets
  for select to authenticated using (public.can(household_id, 'planning', 'view'));
create policy subcategory_budgets_write on public.subcategory_budgets
  for all to authenticated
  using (public.can(household_id, 'planning', 'edit'))
  with check (public.can(household_id, 'planning', 'edit'));

-- ---------------------------------------------------------------------------
-- Categorias padrão
-- ---------------------------------------------------------------------------

create function public.seed_default_categories(hh uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  cat record;
  sub text;
  cat_id uuid;
  i int := 0;
  j int;
begin
  for cat in
    select * from (values
      ('expense', 'Moradia',          '🏠', '#6366f1', array['Aluguel', 'Condomínio', 'Manutenção']),
      ('expense', 'Alimentação',      '🍽️', '#f59e0b', array['Mercado', 'Restaurante', 'Delivery']),
      ('expense', 'Transporte',       '🚗', '#0ea5e9', array['Combustível', 'App de transporte', 'Transporte público']),
      ('expense', 'Contas e serviços','💡', '#eab308', array['Energia', 'Água', 'Internet', 'Celular']),
      ('expense', 'Saúde',            '💊', '#ef4444', array['Plano de saúde', 'Farmácia', 'Consultas']),
      ('expense', 'Educação',         '📚', '#8b5cf6', array['Mensalidade', 'Cursos', 'Material']),
      ('expense', 'Lazer',            '🎉', '#ec4899', array['Passeios', 'Viagens', 'Hobbies']),
      ('expense', 'Compras',          '🛍️', '#14b8a6', array['Roupas', 'Casa', 'Eletrônicos']),
      ('expense', 'Assinaturas',      '📺', '#a855f7', array['Streaming', 'Apps']),
      ('expense', 'Pets',             '🐾', '#84cc16', array[]::text[]),
      ('expense', 'Impostos e taxas', '🧾', '#64748b', array[]::text[]),
      ('expense', 'Outros',           '📦', '#94a3b8', array[]::text[]),
      ('income',  'Salário',          '💼', '#10b981', array[]::text[]),
      ('income',  'Freelance',        '💻', '#06b6d4', array[]::text[]),
      ('income',  'Rendimentos',      '📈', '#22c55e', array[]::text[]),
      ('income',  'Outras receitas',  '💰', '#84cc16', array[]::text[])
    ) as t(kind, name, emoji, color, subs)
  loop
    insert into public.categories (household_id, kind, name, emoji, color, sort_order)
    values (hh, cat.kind::public.category_kind, cat.name, cat.emoji, cat.color, i)
    returning id into cat_id;
    i := i + 1;
    j := 0;
    foreach sub in array cat.subs loop
      insert into public.subcategories (household_id, category_id, name, sort_order)
      values (hh, cat_id, sub, j);
      j := j + 1;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;

-- Cadastro passa a semear as categorias.
create or replace function public.handle_new_user()
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

  perform public.seed_default_categories(hh);

  return new;
end;
$$;

-- Households criados antes desta migration recebem as categorias padrão.
do $$
declare
  hh uuid;
begin
  for hh in
    select h.id from public.households h
    where not exists (select 1 from public.categories c where c.household_id = h.id)
  loop
    perform public.seed_default_categories(hh);
  end loop;
end;
$$;
