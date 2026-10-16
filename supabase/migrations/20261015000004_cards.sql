-- Fase 4 — cartões, faturas, parcelamentos e pagamento de fatura.
--
-- Regra de fatura (espelhada em src/lib/finance/invoice.ts):
--   * compra antes do dia de fechamento cai na fatura que fecha naquele mês;
--     no dia do fechamento ou depois, na que fecha no mês seguinte;
--   * vence no mesmo mês do fechamento se due_day > closing_day, senão no mês seguinte;
--   * reference_month = mês do vencimento ("fatura de novembro" vence em novembro);
--   * dias inexistentes (31 em abril) viram o último dia do mês.

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  bank text,
  brand text,
  last_four text check (last_four ~ '^\d{4}$'),
  credit_limit bigint check (credit_limit >= 0),
  closing_day int not null check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  color text not null default '#8b5cf6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  default_account_id uuid,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (default_account_id, household_id)
    references public.bank_accounts (id, household_id) on delete set null (default_account_id)
);
create index cards_household_idx on public.cards (household_id, sort_order);

create table public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  card_id uuid not null,
  reference_month date not null check (extract(day from reference_month) = 1),
  closing_on date not null,
  due_on date not null,
  created_at timestamptz not null default now(),
  unique (card_id, reference_month),
  unique (id, household_id),
  foreign key (card_id, household_id) references public.cards (id, household_id) on delete cascade
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  card_id uuid not null,
  description text not null,
  total_amount bigint not null check (total_amount > 0),
  installments int not null check (installments between 2 and 72),
  first_date date not null,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (card_id, household_id) references public.cards (id, household_id) on delete restrict
);

alter table public.transactions
  add column card_id uuid,
  add column invoice_id uuid,
  add column installment_plan_id uuid,
  add column installment_number int check (installment_number >= 1),
  add foreign key (card_id, household_id)
    references public.cards (id, household_id) on delete restrict,
  add foreign key (invoice_id, household_id)
    references public.card_invoices (id, household_id) on delete restrict,
  add foreign key (installment_plan_id, household_id)
    references public.installment_plans (id, household_id) on delete cascade,
  add constraint card_kinds check (
    case
      when kind in ('card_purchase', 'card_refund')
        then card_id is not null and bank_account_id is null
      when kind = 'invoice_payment'
        then card_id is not null and invoice_id is not null and bank_account_id is not null
      else card_id is null and invoice_id is null
    end
  ),
  add constraint installment_pair check ((installment_plan_id is null) = (installment_number is null));

create index transactions_invoice_idx on public.transactions (invoice_id) where invoice_id is not null;
create index transactions_plan_idx on public.transactions (installment_plan_id) where installment_plan_id is not null;

-- ---------------------------------------------------------------------------
-- Cálculo e criação de faturas
-- ---------------------------------------------------------------------------

create function public.clamp_day(month_start date, day int)
returns date
language sql immutable set search_path = ''
as $$
  select month_start + (least(day, extract(day from (month_start + interval '1 month - 1 day'))::int) - 1);
$$;

create function public.invoice_dates(purchase date, closing_day int, due_day int,
  out reference_month date, out closing_on date, out due_on date)
language plpgsql immutable set search_path = ''
as $$
declare
  purchase_month date := date_trunc('month', purchase)::date;
  closing_month date;
  due_month date;
begin
  closing_month := case
    when purchase < public.clamp_day(purchase_month, closing_day) then purchase_month
    else (purchase_month + interval '1 month')::date
  end;
  due_month := case
    when due_day > closing_day then closing_month
    else (closing_month + interval '1 month')::date
  end;
  reference_month := due_month;
  closing_on := public.clamp_day(closing_month, closing_day);
  due_on := public.clamp_day(due_month, due_day);
end;
$$;

-- security definer: chamada pelo trigger; valida que o cartão é do household informado.
create function public.ensure_invoice(hh uuid, card uuid, purchase date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  c public.cards;
  d record;
  invoice uuid;
begin
  select * into c from public.cards where id = card and household_id = hh;
  if not found then
    raise exception 'card_not_found' using errcode = '23503';
  end if;
  d := public.invoice_dates(purchase, c.closing_day, c.due_day);
  insert into public.card_invoices (household_id, card_id, reference_month, closing_on, due_on)
  values (hh, card, d.reference_month, d.closing_on, d.due_on)
  on conflict (card_id, reference_month) do nothing;
  select id into invoice from public.card_invoices where card_id = card and reference_month = d.reference_month;
  return invoice;
end;
$$;
revoke execute on function public.ensure_invoice(uuid, uuid, date) from public, anon, authenticated;

-- Compras/estornos sempre recebem a fatura calculada; pagamento de fatura herda o cartão da fatura.
create function public.transactions_assign_invoice()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind in ('card_purchase', 'card_refund') and new.card_id is not null then
    new.invoice_id := public.ensure_invoice(new.household_id, new.card_id, new.occurred_on);
    new.status := 'paid';
  elsif new.kind = 'invoice_payment' and new.invoice_id is not null then
    select card_id into new.card_id from public.card_invoices
    where id = new.invoice_id and household_id = new.household_id;
  end if;
  return new;
end;
$$;

-- Nome começa com "a" para rodar antes de transactions_before_write (ordem alfabética).
create trigger a_transactions_assign_invoice
  before insert or update of kind, card_id, occurred_on, invoice_id on public.transactions
  for each row execute function public.transactions_assign_invoice();

-- ---------------------------------------------------------------------------
-- Totais das faturas
-- ---------------------------------------------------------------------------

create view public.invoice_summaries
with (security_invoker = true)
as
select
  i.id as invoice_id,
  i.household_id,
  i.card_id,
  i.reference_month,
  i.closing_on,
  i.due_on,
  coalesce(sum(t.amount) filter (where t.kind = 'card_purchase'), 0)
    - coalesce(sum(t.amount) filter (where t.kind = 'card_refund'), 0) as total,
  coalesce(sum(t.amount) filter (where t.kind = 'invoice_payment' and t.status = 'paid'), 0) as paid
from public.card_invoices i
left join public.transactions t on t.invoice_id = i.id
group by i.id;

-- ---------------------------------------------------------------------------
-- Compra parcelada: cria o plano e as N parcelas numa única transação.
-- security invoker: a RLS de quem chama vale para todos os inserts.
-- ---------------------------------------------------------------------------

create function public.create_installment_purchase(
  p_card_id uuid,
  p_description text,
  p_total_amount bigint,
  p_installments int,
  p_first_date date,
  p_category_id uuid default null,
  p_subcategory_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  hh uuid;
  plan uuid;
  base bigint;
  n int;
begin
  select household_id into hh from public.cards where id = p_card_id;
  if hh is null then
    raise exception 'card_not_found' using errcode = '23503';
  end if;
  if p_installments < 2 or p_installments > 72 then
    raise exception 'invalid_installments' using errcode = '23514';
  end if;
  if p_total_amount < p_installments then
    raise exception 'amount_too_small' using errcode = '23514';
  end if;

  insert into public.installment_plans (household_id, card_id, description, total_amount, installments, first_date)
  values (hh, p_card_id, p_description, p_total_amount, p_installments, p_first_date)
  returning id into plan;

  -- Parcelas iguais; os centavos que sobram vão na primeira.
  base := p_total_amount / p_installments;
  for n in 1..p_installments loop
    insert into public.transactions (
      household_id, kind, amount, description, notes, occurred_on, card_id,
      category_id, subcategory_id, installment_plan_id, installment_number
    ) values (
      hh, 'card_purchase',
      base + case when n = 1 then p_total_amount - base * p_installments else 0 end,
      format('%s (%s/%s)', p_description, n, p_installments),
      p_notes,
      (p_first_date + make_interval(months => n - 1))::date,
      p_card_id, p_category_id, p_subcategory_id, plan, n
    );
  end loop;

  return plan;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.cards enable row level security;
alter table public.card_invoices enable row level security;
alter table public.installment_plans enable row level security;

create policy cards_select on public.cards
  for select to authenticated using (public.is_member(household_id));
create policy cards_write on public.cards
  for all to authenticated
  using (public.can(household_id, 'transactions', 'edit'))
  with check (public.can(household_id, 'transactions', 'edit'));

-- Faturas são criadas só pelo trigger (security definer); usuários apenas leem.
create policy card_invoices_select on public.card_invoices
  for select to authenticated using (public.can(household_id, 'transactions', 'view'));

create policy installment_plans_select on public.installment_plans
  for select to authenticated using (public.can(household_id, 'transactions', 'view'));
create policy installment_plans_write on public.installment_plans
  for all to authenticated
  using (public.can(household_id, 'transactions', 'edit'))
  with check (public.can(household_id, 'transactions', 'edit'));
