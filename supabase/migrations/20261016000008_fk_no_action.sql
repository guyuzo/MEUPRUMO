-- Corrige exclusão em cascata de casas/usuários.
--
-- ON DELETE RESTRICT é verificado imediatamente: ao apagar uma casa, a cascata tentava apagar
-- contas/cartões/dívidas antes das transações que apontam para eles e falhava. NO ACTION
-- continua impedindo apagar diretamente uma conta com transações, mas só verifica no fim do
-- comando, quando a cascata já removeu as transações.

do $$
declare
  fk record;
begin
  for fk in
    select c.conname, c.conrelid::regclass as tbl, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public' and c.confdeltype = 'r'
  loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
    execute format('alter table %s add constraint %I %s', fk.tbl, fk.conname, replace(fk.def, 'ON DELETE RESTRICT', ''));
  end loop;
end;
$$;
