import type { AccountType, DebtType, InvestmentType, PaymentMethod, TxDirection, TxKind } from '@/types/database'

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  credit: 'Crédito',
  debit: 'Débito',
  pix: 'Pix',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  transfer: 'Transferência',
  other: 'Outro',
}

/** Formas para despesas (crédito = compra no cartão) e para recebimentos. */
export const EXPENSE_METHODS: PaymentMethod[] = ['credit', 'debit', 'pix', 'cash', 'boleto', 'transfer', 'other']
export const INCOME_METHODS: PaymentMethod[] = ['pix', 'transfer', 'cash', 'other']

export const DEBT_TYPE_LABEL: Record<DebtType, string> = {
  loan: 'Empréstimo',
  financing: 'Financiamento',
  credit_card: 'Cartão de crédito',
  overdraft: 'Cheque especial',
  personal: 'Dívida pessoal',
  other: 'Outra',
}

export const INVESTMENT_TYPE_LABEL: Record<InvestmentType, string> = {
  fixed_income: 'Renda fixa',
  stocks: 'Ações',
  funds: 'Fundos',
  crypto: 'Cripto',
  pension: 'Previdência',
  savings: 'Poupança',
  other: 'Outro',
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  investment: 'Conta investimento',
  other: 'Outra',
}

export const TX_KIND_LABEL: Record<TxKind, string> = {
  expense_fixed: 'Despesa fixa',
  expense_variable: 'Despesa variável',
  income: 'Ganho',
  transfer: 'Transferência',
  card_purchase: 'Compra no cartão',
  card_refund: 'Estorno no cartão',
  invoice_payment: 'Pagamento de fatura',
  debt_payment: 'Pagamento de dívida',
  investment_contribution: 'Aporte',
  investment_withdrawal: 'Resgate',
  goal_contribution: 'Reserva para meta',
  goal_withdrawal: 'Retirada de meta',
}

/** Tipos que o usuário lança direto na tela de transações (os demais nascem em outros módulos). */
export const MANUAL_KINDS = ['expense_variable', 'expense_fixed', 'income', 'transfer'] as const
export type ManualKind = (typeof MANUAL_KINDS)[number]

// Espelha a coluna gerada `direction` do banco.
export function directionOf(kind: TxKind): TxDirection {
  if (kind === 'transfer') return 'transfer'
  if (kind === 'income' || kind === 'card_refund' || kind === 'investment_withdrawal' || kind === 'goal_withdrawal') {
    return 'inflow'
  }
  return 'outflow'
}
