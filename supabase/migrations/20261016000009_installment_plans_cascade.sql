-- installment_plans era a única tabela sem FK direta para households: ao apagar a casa,
-- a cascata removia os cartões mas não os planos, que bloqueavam a exclusão.
alter table public.installment_plans
  add constraint installment_plans_household_fk
  foreign key (household_id) references public.households (id) on delete cascade;
