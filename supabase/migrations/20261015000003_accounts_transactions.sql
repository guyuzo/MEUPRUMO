-- Fase 3 — contas bancárias, transações e saldos.

create type public.account_type as enum ('checking', 'savings', 'cash', 'investment', 'other');

-- Todos os tipos previstos no plano já entram aqui para evitar ALTER TYPE nas próximas fases.
create type public.tx_kind as enum (
  'expense_fixed', 'expense_variable', 'income', 'transfer',
  'card_purchase', 'card_refund', 'invoice_payment',
  'debt_payment',
  'investment_contribution', 'investment_withdrawal',
  'goal_contribution', 'goal_withdrawal'
);
create type public.tx_direction as enum ('inflow', 'outflow', 'transfer');
create type public.tx_status as enum ('pending', 'paid');

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  bank text,
  branch text,
  account_number text,
  type public.account_type not null default 'checking',
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  initial_balance bigint not null default 0,
  initial_balance_date date not null default current_date,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id)
);
create index bank_accounts_household_idx on public.bank_accounts (household_id, sort_order);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind public.tx_kind not null,
  -- Derivado do kind: impossível gravar combinação incoerente.
  direction public.tx_direction generated always as (
    case
      when kind = 'transfer' then 'transfer'::public.tx_direction
      when kind in ('income', 'card_refund', 'investment_withdrawal', 'goal_withdrawal') then 'inflow'::public.tx_direction
      else 'outflow'::public.tx_direction
    end
  ) stored,
  status public.tx_status not null default 'paid',
  amount bigint not null check (amount > 0),
  description text not null check (length(trim(description)) between 1 and 120),
  notes text,
  occurred_on date not null default current_date,
  due_on date,
  paid_on date,
  category_id uuid,
  subcategory_id uuid,
  bank_account_id uuid,
  destination_account_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (category_id, household_id)
    references public.categories (id, household_id) on delete set null (category_id),
  foreign key (subcategory_id, household_id)
    references public.subcategories (id, household_id) on delete set null (subcategory_id),
  foreign key (bank_account_id, household_id)
    references public.bank_accounts (id, household_id) on delete restrict,
  foreign key (destination_account_id, household_id)
    references public.bank_accounts (id, household_id) on delete restrict,

  constraint transfer_accounts check (
    kind <> 'transfer'
    or (bank_account_id is not null and destination_account_id is not null and bank_account_id <> destination_account_id)
  ),
  constraint destination_only_transfer check (kind = 'transfer' or destination_account_id is null),
  constraint transfer_without_category check (kind <> 'transfer' or (category_id is null and subcategory_id is null)),
  constraint paid_has_date check (status = 'pending' or paid_on is not null)
);
create index transactions_household_date_idx on public.transactions (household_id, occurred_on desc);
create index transactions_account_idx on public.transactions (bank_account_id) where bank_account_id is not null;
create index transactions_destination_idx on public.transactions (destination_account_id) where destination_account_id is not null;
create index transactions_category_idx on public.transactions (category_id) where category_id is not null;

-- Subcategoria precisa pertencer à categoria escolhida; updated_at automático.
create function public.transactions_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.subcategory_id is not null and not exists (
    select 1 from public.subcategories s
    where s.id = new.subcategory_id and s.category_id is not distinct from new.category_id
  ) then
    raise exception 'subcategory_category_mismatch' using errcode = '23514';
  end if;
  if new.status = 'paid' and new.paid_on is null then
    new.paid_on := new.occurred_on;
  end if;
  if new.status = 'pending' then
    new.paid_on := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_before_write
  before insert or update on public.transactions
  for each row execute function public.transactions_before_write();

-- ---------------------------------------------------------------------------
-- Saldo das contas. security_invoker faz a view respeitar a RLS de quem consulta.
-- Saldo atual considera só o que foi pago a partir da data do saldo inicial;
-- saldo previsto inclui pendentes.
-- ---------------------------------------------------------------------------

create view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.household_id,
  a.initial_balance + coalesce(sum(m.signed) filter (where m.status = 'paid'), 0) as balance,
  a.initial_balance + coalesce(sum(m.signed), 0) as projected_balance,
  coalesce(sum(m.signed) filter (where m.status = 'pending'), 0) as pending_total
from public.bank_accounts a
left join lateral (
  select t.status,
    case
      when t.direction = 'inflow' then t.amount
      when t.direction = 'outflow' then -t.amount
      when t.destination_account_id = a.id then t.amount
      else -t.amount
    end as signed
  from public.transactions t
  where (t.bank_account_id = a.id or t.destination_account_id = a.id)
    and t.occurred_on >= a.initial_balance_date
) m on true
group by a.id;

-- ---------------------------------------------------------------------------
-- RLS — contas são visíveis a qualquer membro (aparecem em formulários);
-- transações exigem a permissão do módulo.
-- ---------------------------------------------------------------------------

alter table public.bank_accounts enable row level security;
alter table public.transactions enable row level security;

create policy bank_accounts_select on public.bank_accounts
  for select to authenticated using (public.is_member(household_id));
create policy bank_accounts_write on public.bank_accounts
  for all to authenticated
  using (public.can(household_id, 'transactions', 'edit'))
  with check (public.can(household_id, 'transactions', 'edit'));

create policy transactions_select on public.transactions
  for select to authenticated using (public.can(household_id, 'transactions', 'view'));
create policy transactions_write on public.transactions
  for all to authenticated
  using (public.can(household_id, 'transactions', 'edit'))
  with check (public.can(household_id, 'transactions', 'edit'));
