-- Identidade Meu Prumo: cor padrão de pessoas e contas novas vira o Verde Equilíbrio.
-- Só afeta registros novos; cores já salvas pelos usuários não mudam.
alter table public.household_members alter column color set default '#1f6b56';
alter table public.bank_accounts alter column color set default '#1f6b56';
