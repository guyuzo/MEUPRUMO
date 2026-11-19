-- Layout da tela Início escolhido pela pessoa (ordem, tamanho e blocos ocultos).
-- null = layout padrão. O formato é validado no app (src/lib/dashboardLayout.ts); aqui só limita o tamanho.
-- A própria pessoa altera pela policy profiles_update (id = auth.uid()).
alter table public.profiles
  add column dashboard_layout jsonb
    check (dashboard_layout is null or (jsonb_typeof(dashboard_layout) = 'array' and pg_column_size(dashboard_layout) <= 4096));
