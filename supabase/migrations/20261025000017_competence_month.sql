-- Mês de competência: em que mês o lançamento conta nas telas mensais (gastos, orçamento, relatório).
-- Compra/estorno no cartão conta no mês da fatura em que cai (inclusive a escolhida em "Fatura em");
-- o resto conta no mês da data. O fluxo de caixa continua usando as datas reais.

alter table public.transactions add column competence_month date;

-- security definer só para ler a fatura (quem lança pode ter "editar" sem "ver"); filtra pela casa da linha.
create function public.transactions_set_competence()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.competence_month := null;
  if new.kind in ('card_purchase', 'card_refund') and new.invoice_id is not null then
    select reference_month into new.competence_month
    from public.card_invoices
    where id = new.invoice_id and household_id = new.household_id;
  end if;
  new.competence_month := coalesce(new.competence_month, date_trunc('month', new.occurred_on)::date);
  return new;
end;
$$;
revoke execute on function public.transactions_set_competence() from public, anon, authenticated;

-- "b_" roda depois de a_transactions_assign_invoice (ordem alfabética), que já escolheu a fatura.
create trigger b_transactions_set_competence
  before insert or update on public.transactions
  for each row execute function public.transactions_set_competence();

-- Lançamentos que já existem.
update public.transactions t
set competence_month = coalesce(
  case when t.kind in ('card_purchase', 'card_refund') then
    (select i.reference_month from public.card_invoices i where i.id = t.invoice_id and i.household_id = t.household_id)
  end,
  date_trunc('month', t.occurred_on)::date
);

alter table public.transactions
  alter column competence_month set not null,
  add constraint competence_month_first_day check (extract(day from competence_month) = 1);

create index transactions_household_competence_idx on public.transactions (household_id, competence_month);
