-- Fase 6 — recorrências, dívidas, metas, investimentos e lista de desejos.

-- ===========================================================================
-- Recorrências
-- ===========================================================================

create type public.recurrence_frequency as enum ('weekly', 'monthly', 'yearly');

create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind public.tx_kind not null check (kind in ('expense_fixed', 'expense_variable', 'income', 'card_purchase')),
  description text not null check (length(trim(description)) between 1 and 120),
  amount bigint not null check (amount > 0),
  frequency public.recurrence_frequency not null default 'monthly',
  interval_count int not null default 1 check (interval_count between 1 and 12),
  start_on date not null,
  end_on date,
  category_id uuid,
  subcategory_id uuid,
  bank_account_id uuid,
  card_id uuid,
  active boolean not null default true,
  -- Ocorrências até esta data já foram geradas; excluídas não voltam.
  materialized_until date,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  check (end_on is null or end_on >= start_on),
  check ((kind = 'card_purchase') = (card_id is not null)),
  check (kind <> 'card_purchase' or bank_account_id is null),
  foreign key (category_id, household_id) references public.categories (id, household_id) on delete set null (category_id),
  foreign key (subcategory_id, household_id) references public.subcategories (id, household_id) on delete set null (subcategory_id),
  foreign key (bank_account_id, household_id) references public.bank_accounts (id, household_id) on delete set null (bank_account_id),
  foreign key (card_id, household_id) references public.cards (id, household_id) on delete cascade
);
create index recurrences_household_idx on public.recurrences (household_id) where active;

-- ===========================================================================
-- Dívidas
-- ===========================================================================

create type public.debt_type as enum ('loan', 'financing', 'credit_card', 'overdraft', 'personal', 'other');

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  creditor text,
  type public.debt_type not null default 'loan',
  -- Saldo devedor no início do controle.
  original_amount bigint not null check (original_amount > 0),
  installment_amount bigint check (installment_amount > 0),
  total_installments int check (total_installments between 1 and 600),
  interest_rate numeric(6, 3) check (interest_rate >= 0),
  start_on date not null default current_date,
  notes text,
  paid_off_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

-- ===========================================================================
-- Investimentos
-- ===========================================================================

create type public.investment_type as enum ('fixed_income', 'stocks', 'funds', 'crypto', 'pension', 'savings', 'other');

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  type public.investment_type not null default 'fixed_income',
  institution text,
  color text not null default '#10b981' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

-- Cotação: quanto o investimento valia numa data (inclui rendimentos).
create table public.investment_valuations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  investment_id uuid not null,
  value bigint not null check (value >= 0),
  valued_on date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (investment_id, household_id) references public.investments (id, household_id) on delete cascade
);
create index investment_valuations_idx on public.investment_valuations (investment_id, valued_on desc, created_at desc);

-- ===========================================================================
-- Ligações nas transações
-- ===========================================================================

alter table public.transactions
  add column recurrence_id uuid,
  add column recurrence_on date,
  add column debt_id uuid,
  add column debt_installments int check (debt_installments between 1 and 600),
  add column investment_id uuid,
  add foreign key (recurrence_id, household_id)
    references public.recurrences (id, household_id) on delete set null (recurrence_id),
  add foreign key (debt_id, household_id)
    references public.debts (id, household_id) on delete restrict,
  add foreign key (investment_id, household_id)
    references public.investments (id, household_id) on delete restrict,
  add constraint debt_kind check ((kind = 'debt_payment') = (debt_id is not null)),
  add constraint investment_kind check (
    (kind in ('investment_contribution', 'investment_withdrawal')) = (investment_id is not null)
  ),
  add constraint module_kinds_need_account check (
    kind not in ('debt_payment', 'investment_contribution', 'investment_withdrawal') or bank_account_id is not null
  );

-- Idempotência da geração de recorrências.
create unique index transactions_recurrence_once on public.transactions (recurrence_id, recurrence_on)
  where recurrence_id is not null;
create index transactions_debt_idx on public.transactions (debt_id) where debt_id is not null;
create index transactions_investment_idx on public.transactions (investment_id) where investment_id is not null;

-- ===========================================================================
-- Metas (envelopes: separam dinheiro sem tirá-lo das contas)
-- ===========================================================================

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  emoji text not null default '🎯',
  color text not null default '#f59e0b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  target_amount bigint not null check (target_amount > 0),
  target_date date,
  achieved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

create table public.goal_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  goal_id uuid not null,
  -- Positivo = guardar; negativo = retirar.
  amount bigint not null check (amount <> 0),
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  foreign key (goal_id, household_id) references public.goals (id, household_id) on delete cascade
);
create index goal_entries_goal_idx on public.goal_entries (goal_id, occurred_on desc);

-- ===========================================================================
-- Lista de desejos
-- ===========================================================================

create table public.wishlist_sections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  emoji text not null default '🎁',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  section_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  price bigint check (price >= 0),
  url text check (url is null or url ~* '^https?://'),
  priority int not null default 2 check (priority between 1 and 3),
  notes text,
  purchased_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (section_id, household_id) references public.wishlist_sections (id, household_id) on delete cascade
);
create index wishlist_items_section_idx on public.wishlist_items (section_id, sort_order);

-- ===========================================================================
-- Views de resumo (security_invoker: respeitam a RLS de quem consulta)
-- ===========================================================================

create view public.debt_summaries
with (security_invoker = true)
as
select
  d.id as debt_id,
  d.household_id,
  coalesce(sum(t.amount) filter (where t.status = 'paid'), 0) as paid_amount,
  coalesce(sum(coalesce(t.debt_installments, 1)) filter (where t.status = 'paid'), 0) as installments_paid,
  max(t.occurred_on) filter (where t.status = 'paid') as last_payment_on
from public.debts d
left join public.transactions t on t.debt_id = d.id
group by d.id;

create view public.goal_summaries
with (security_invoker = true)
as
select g.id as goal_id, g.household_id, coalesce(sum(e.amount), 0) as saved_amount
from public.goals g
left join public.goal_entries e on e.goal_id = g.id
group by g.id;

-- Valor atual = última cotação + aportes − resgates posteriores a ela.
-- Sem cotação, o valor atual é o líquido aportado.
create view public.investment_summaries
with (security_invoker = true)
as
select
  i.id as investment_id,
  i.household_id,
  coalesce(f.contributed, 0) as contributed,
  coalesce(f.withdrawn, 0) as withdrawn,
  v.value as last_valuation,
  v.valued_on as last_valued_on,
  case
    when v.value is null then coalesce(f.contributed, 0) - coalesce(f.withdrawn, 0)
    else v.value + coalesce(f.net_after_valuation, 0)
  end as current_value
from public.investments i
left join lateral (
  select value, valued_on from public.investment_valuations
  where investment_id = i.id
  order by valued_on desc, created_at desc
  limit 1
) v on true
left join lateral (
  select
    sum(t.amount) filter (where t.kind = 'investment_contribution') as contributed,
    sum(t.amount) filter (where t.kind = 'investment_withdrawal') as withdrawn,
    sum(case when t.kind = 'investment_contribution' then t.amount else -t.amount end)
      filter (where v.valued_on is null or t.occurred_on > v.valued_on) as net_after_valuation
  from public.transactions t
  where t.investment_id = i.id and t.status = 'paid'
) f on true;

-- ===========================================================================
-- Geração de recorrências. security invoker: a RLS de quem chama vale para os inserts.
-- ===========================================================================

create function public.next_occurrence(r public.recurrences, n int)
returns date
language sql immutable set search_path = ''
as $$
  select case r.frequency
    when 'weekly' then r.start_on + (7 * r.interval_count * n)
    when 'monthly' then (r.start_on + make_interval(months => r.interval_count * n))::date
    when 'yearly' then (r.start_on + make_interval(years => r.interval_count * n))::date
  end;
$$;

create function public.materialize_recurrences(hh uuid, until date)
returns int
language plpgsql security invoker set search_path = ''
as $$
declare
  r public.recurrences;
  occurrence date;
  n int;
  created int := 0;
  rows_added int;
  limit_date date;
begin
  for r in
    select * from public.recurrences
    where household_id = hh and active and (materialized_until is null or materialized_until < until)
    for update
  loop
    limit_date := least(until, coalesce(r.end_on, until));
    n := 0;
    loop
      occurrence := public.next_occurrence(r, n);
      exit when occurrence > limit_date or n > 1000;
      if r.materialized_until is null or occurrence > r.materialized_until then
        insert into public.transactions (
          household_id, kind, status, amount, description, occurred_on, due_on,
          category_id, subcategory_id, bank_account_id, card_id, recurrence_id, recurrence_on
        ) values (
          hh, r.kind, 'pending', r.amount, r.description, occurrence, occurrence,
          r.category_id, r.subcategory_id, r.bank_account_id, r.card_id, r.id, occurrence
        )
        on conflict (recurrence_id, recurrence_on) where recurrence_id is not null do nothing;
        get diagnostics rows_added = row_count;
        created := created + rows_added;
      end if;
      n := n + 1;
    end loop;
    update public.recurrences set materialized_until = until where id = r.id;
  end loop;
  return created;
end;
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.recurrences enable row level security;
alter table public.debts enable row level security;
alter table public.investments enable row level security;
alter table public.investment_valuations enable row level security;
alter table public.goals enable row level security;
alter table public.goal_entries enable row level security;
alter table public.wishlist_sections enable row level security;
alter table public.wishlist_items enable row level security;

-- Uma política de leitura e uma de escrita por tabela, conforme o módulo.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('recurrences', 'transactions'),
      ('debts', 'debts'),
      ('investments', 'investments'),
      ('investment_valuations', 'investments'),
      ('goals', 'goals'),
      ('goal_entries', 'goals'),
      ('wishlist_sections', 'wishlist'),
      ('wishlist_items', 'wishlist')
    ) as t(tbl, module)
  loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (public.can(household_id, %2$L, ''view''))',
      spec.tbl, spec.module);
    execute format(
      'create policy %1$s_write on public.%1$s for all to authenticated using (public.can(household_id, %2$L, ''edit'')) with check (public.can(household_id, %2$L, ''edit''))',
      spec.tbl, spec.module);
  end loop;
end;
$$;
