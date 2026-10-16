# Finança Fácil

App de organização financeira pessoal e familiar. React 19 + TanStack Router/Query + Tailwind v4 + Supabase.
Nome provisório em `src/config/app.ts`.

## Funcionalidades

- **Início**: resumo do mês (ganhos, gastos, resultado, comparação com o mês anterior), gráfico acumulado, gastos por categoria × orçamento, próximos vencimentos, primeiros passos para contas novas.
- **Transações**: formulário em linhas (Descrição, Valor, Forma de Pagamento, Cartão, Data, "Fatura em", parcelamento, Corresponde/Dividir, Anotação). Crédito vira compra no cartão com fatura automática ou escolhida (mês da compra / seguinte / 2 meses); demais formas saem da conta. Valor só aceita números (máscara de moeda).
- **Contas**: saldo atual e previsto, extrato mensal, arquivar.
- **Cartões**: faturas automáticas por fechamento/vencimento, parcelamento, estorno, pagamento total/parcial, limite disponível.
- **Fluxo de caixa**: 2 meses passados + 6 futuros, com projeção de saldo (pendentes, recorrências, faturas).
- **Planejamento**: categorias/subcategorias e orçamento mensal.
- **Recorrências**: geram lançamentos pendentes até 6 meses à frente.
- **Dívidas, Metas, Investimentos, Lista de desejos**.
- **Família**: pessoas da casa com foto (bucket privado `avatars`, reduzida a 320px no navegador, sem EXIF), convite por link com permissões por módulo, troca entre casas.
- **Configurações**: perfil, senha, tema claro/escuro (também no botão ☀/☾ do menu), exportar CSV, relatório para PDF, apagar dados.

## Setup

1. Crie um projeto em [supabase.com](https://supabase.com).
2. `cp .env.example .env.local` e preencha:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` → Project Settings › API
   - `SUPABASE_DB_URL` → Database › Connect › Session pooler (porta **5432**)
   - `SUPABASE_SECRET_KEY` (opcional) → só para `npm run test:db`
3. `npm install`
4. `npm run db:push` — aplica `supabase/migrations`
5. `npm run dev` → http://localhost:5173

Em Authentication › URL Configuration, adicione `http://localhost:5173/**` às Redirect URLs (confirmação de e-mail, redefinição de senha e convites).

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes de unidade (vitest) das regras em `src/lib` |
| `npm run test:db` | Testes ponta a ponta contra o Supabase (RLS, triggers, RPCs); cria e apaga usuários descartáveis |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Build de produção |
| `npm run db:push` | Aplica migrations no Supabase remoto |

## Convenções

- Valores em **centavos** (`bigint` no banco, `number` no front) — `src/lib/money.ts`.
- Todo dado pertence a um `household`. RLS usa `is_member()`, `is_owner()` e `can(hh, módulo, ação)`; FKs compostas `(id, household_id)` impedem referências entre casas.
- Regras financeiras puras e testadas em `src/lib/finance/` (fatura, totais, resumo, fluxo de caixa, recorrência, divisão). A regra de fatura e a de recorrência existem também em SQL e os testes garantem que batem.
- Compra no cartão conta como gasto na data da compra; o pagamento da fatura só movimenta a conta (não é gasto de novo). No fluxo de caixa, o que conta é o vencimento da fatura.
- Metas são "envelopes": não tiram dinheiro das contas.

## Segurança

- A `SUPABASE_SECRET_KEY` ignora a RLS: nunca use com prefixo `VITE_` nem no front.
- Antes de produção, gere novas chaves e senha do banco se elas já foram compartilhadas.
