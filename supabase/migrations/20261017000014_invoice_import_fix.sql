-- Corrige import_card_statement: variáveis com prefixo v_ (antes "total" colidia com a coluna).
create or replace function public.import_card_statement(
  p_card_id uuid,
  p_reference_month date,
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_household uuid;
  v_batch uuid;
  v_inserted int;
  v_total bigint;
begin
  select household_id into v_household from public.cards where id = p_card_id;
  if v_household is null then
    raise exception 'card_not_found' using errcode = '23503';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'no_rows' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'too_many_rows' using errcode = '22023';
  end if;

  insert into public.import_batches (household_id, card_id, reference_month, file_name)
  values (v_household, p_card_id, p_reference_month, left(p_file_name, 200))
  returning id into v_batch;

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
    select v_household, kind, 'paid', amount, description, occurred_on, p_card_id, p_reference_month,
      category_id, subcategory_id, 'credit', v_batch, external_id
    from rows
    where kind in ('card_purchase', 'card_refund')
    on conflict (card_id, external_id) where external_id is not null do nothing
    returning amount, kind
  )
  select count(*), coalesce(sum(case when kind = 'card_purchase' then amount else -amount end), 0)
  into v_inserted, v_total
  from ins;

  if v_inserted = 0 then
    -- Nada novo (tudo já importado antes): não deixa lote vazio.
    delete from public.import_batches where id = v_batch;
    v_batch := null;
  else
    update public.import_batches set rows_count = v_inserted, total = v_total where id = v_batch;
  end if;

  return jsonb_build_object(
    'batch_id', v_batch,
    'inserted', v_inserted,
    'skipped', jsonb_array_length(p_rows) - v_inserted,
    'total', v_total
  );
end;
$$;
