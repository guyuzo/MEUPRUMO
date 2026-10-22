-- Importação de faturas fechadas (extrato OFX/CSV do cartão).
-- Cada importação é um lote: dá para desfazer de uma vez, e reimportar não duplica.

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  card_id uuid not null,
  reference_month date not null check (extract(day from reference_month) = 1),
  file_name text not null check (length(file_name) between 1 and 200),
  rows_count int not null default 0,
  total bigint not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (card_id, household_id) references public.cards (id, household_id) on delete cascade
);
create index import_batches_card_idx on public.import_batches (card_id, reference_month);

alter table public.transactions
  add column import_batch_id uuid,
  -- Identificador da linha no arquivo do banco (FITID do OFX ou hash da linha do CSV).
  add column external_id text check (external_id is null or length(external_id) <= 200),
  add foreign key (import_batch_id, household_id)
    references public.import_batches (id, household_id) on delete cascade;

-- Reimportar o mesmo extrato não duplica lançamentos.
create unique index transactions_card_external_once on public.transactions (card_id, external_id)
  where external_id is not null;
create index transactions_import_batch_idx on public.transactions (import_batch_id) where import_batch_id is not null;

alter table public.import_batches enable row level security;
create policy import_batches_select on public.import_batches
  for select to authenticated using (public.can(household_id, 'transactions', 'view'));
create policy import_batches_write on public.import_batches
  for all to authenticated
  using (public.can(household_id, 'transactions', 'edit'))
  with check (public.can(household_id, 'transactions', 'edit'));

-- Importa as linhas numa única transação (tudo ou nada). security invoker: vale a RLS de quem chama.
-- p_rows: [{ kind: 'card_purchase'|'card_refund', occurred_on, description, amount, external_id,
--            category_id?, subcategory_id? }]
create function public.import_card_statement(
  p_card_id uuid,
  p_reference_month date,
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  hh uuid;
  batch uuid;
  inserted int;
  total bigint;
begin
  select household_id into hh from public.cards where id = p_card_id;
  if hh is null then
    raise exception 'card_not_found' using errcode = '23503';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'no_rows' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'too_many_rows' using errcode = '22023';
  end if;

  insert into public.import_batches (household_id, card_id, reference_month, file_name)
  values (hh, p_card_id, p_reference_month, left(p_file_name, 200))
  returning id into batch;

  with rows as (
    select
      (r ->> 'kind')::public.tx_kind as kind,
      (r ->> 'occurred_on')::date as occurred_on,
      left(trim(r ->> 'description'), 120) as description,
      (r ->> 'amount')::bigint as amount,
      nullif(r ->> 'external_id', '') as external_id,
      nullif(r ->> 'category_id', '')::uuid as category_id,
      nullif(r ->> 'subcategory_id', '')::uuid as subcategory_id
    from jsonb_array_elements(p_rows) r
  ), ins as (
    insert into public.transactions (
      household_id, kind, status, amount, description, occurred_on, card_id, invoice_month,
      category_id, subcategory_id, payment_method, import_batch_id, external_id
    )
    select hh, kind, 'paid', amount, description, occurred_on, p_card_id, p_reference_month,
      category_id, subcategory_id, 'credit', batch, external_id
    from rows
    where kind in ('card_purchase', 'card_refund')
    on conflict (card_id, external_id) where external_id is not null do nothing
    returning amount, kind
  )
  select count(*), coalesce(sum(case when kind = 'card_purchase' then amount else -amount end), 0)
  into inserted, total
  from ins;

  update public.import_batches set rows_count = inserted, total = total where id = batch;

  -- Nada novo (tudo já importado antes): não deixa lote vazio.
  if inserted = 0 then
    delete from public.import_batches where id = batch;
    batch := null;
  end if;

  return jsonb_build_object('batch_id', batch, 'inserted', inserted, 'skipped', jsonb_array_length(p_rows) - inserted, 'total', total);
end;
$$;
