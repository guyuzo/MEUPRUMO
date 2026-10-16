-- Forma de pagamento, escolha manual da fatura e fotos das pessoas da casa.

-- ===========================================================================
-- Forma de pagamento (informativa; o "crédito" é o card_purchase)
-- ===========================================================================

create type public.payment_method as enum ('credit', 'debit', 'pix', 'cash', 'boleto', 'transfer', 'other');

alter table public.transactions add column payment_method public.payment_method;
alter table public.recurrences add column payment_method public.payment_method;

-- ===========================================================================
-- Fatura escolhida manualmente ("Fatura em: mês da compra / seguinte / 2 meses").
-- invoice_month = mês de referência (vencimento) desejado; null = regra automática.
-- ===========================================================================

alter table public.transactions
  add column invoice_month date check (invoice_month is null or extract(day from invoice_month) = 1);

-- Fatura de um mês de referência específico (datas calculadas pelos dias do cartão).
create function public.ensure_invoice_for_month(hh uuid, card uuid, ref date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  c public.cards;
  closing_month date;
  invoice uuid;
begin
  select * into c from public.cards where id = card and household_id = hh;
  if not found then
    raise exception 'card_not_found' using errcode = '23503';
  end if;
  -- Inverso de invoice_dates: vence em ref; fecha no mesmo mês se due_day > closing_day.
  closing_month := case when c.due_day > c.closing_day then ref else (ref - interval '1 month')::date end;
  insert into public.card_invoices (household_id, card_id, reference_month, closing_on, due_on)
  values (hh, card, ref, public.clamp_day(closing_month, c.closing_day), public.clamp_day(ref, c.due_day))
  on conflict (card_id, reference_month) do nothing;
  select id into invoice from public.card_invoices where card_id = card and reference_month = ref;
  return invoice;
end;
$$;
revoke execute on function public.ensure_invoice_for_month(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.transactions_assign_invoice()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind in ('card_purchase', 'card_refund') and new.card_id is not null then
    new.invoice_id := case
      when new.invoice_month is not null then public.ensure_invoice_for_month(new.household_id, new.card_id, new.invoice_month)
      else public.ensure_invoice(new.household_id, new.card_id, new.occurred_on)
    end;
    new.status := 'paid';
    new.payment_method := 'credit';
  elsif new.kind = 'invoice_payment' and new.invoice_id is not null then
    select card_id into new.card_id from public.card_invoices
    where id = new.invoice_id and household_id = new.household_id;
  end if;
  return new;
end;
$$;

drop trigger a_transactions_assign_invoice on public.transactions;
create trigger a_transactions_assign_invoice
  before insert or update of kind, card_id, occurred_on, invoice_id, invoice_month on public.transactions
  for each row execute function public.transactions_assign_invoice();

-- Parcelamento com primeira fatura escolhida (p_first_invoice) e pessoa.
drop function public.create_installment_purchase(uuid, text, bigint, int, date, uuid, uuid, text);

create function public.create_installment_purchase(
  p_card_id uuid,
  p_description text,
  p_total_amount bigint,
  p_installments int,
  p_first_date date,
  p_category_id uuid default null,
  p_subcategory_id uuid default null,
  p_notes text default null,
  p_first_invoice date default null,
  p_member_id uuid default null
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

  base := p_total_amount / p_installments;
  for n in 1..p_installments loop
    insert into public.transactions (
      household_id, kind, amount, description, notes, occurred_on, card_id,
      category_id, subcategory_id, installment_plan_id, installment_number, invoice_month, household_member_id
    ) values (
      hh, 'card_purchase',
      base + case when n = 1 then p_total_amount - base * p_installments else 0 end,
      format('%s (%s/%s)', p_description, n, p_installments),
      p_notes,
      (p_first_date + make_interval(months => n - 1))::date,
      p_card_id, p_category_id, p_subcategory_id, plan, n,
      case when p_first_invoice is null then null else (p_first_invoice + make_interval(months => n - 1))::date end,
      p_member_id
    );
  end loop;

  return plan;
end;
$$;

-- ===========================================================================
-- Fotos das pessoas da casa (bucket privado; caminho: {household}/{member}/{arquivo})
-- ===========================================================================

alter table public.household_members add column avatar_path text;

-- Cada usuário pode atualizar a própria "pessoa" (nome/foto), mesmo na casa de outro dono.
create policy household_members_update_self on public.household_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Pode gerenciar a foto: o dono da casa ou a própria pessoa.
create function public.can_manage_avatar(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.id::text = (storage.foldername(object_name))[2]
      and m.household_id::text = (storage.foldername(object_name))[1]
      and (public.is_owner(m.household_id) or m.user_id = (select auth.uid()))
  );
$$;

create policy avatars_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.can_manage_avatar(name));
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.can_manage_avatar(name));
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.can_manage_avatar(name));
