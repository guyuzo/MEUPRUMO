// Tipos escritos à mão espelhando supabase/migrations. Podem ser substituídos pelo
// gerado com `npx supabase gen types typescript --project-id <id>` quando houver acesso.

export type MemberRole = 'owner' | 'member'

export const MODULES = ['planning', 'transactions', 'debts', 'goals', 'investments', 'wishlist'] as const
export type Module = (typeof MODULES)[number]
export type PermissionAction = 'view' | 'edit'

export interface Household {
  id: string
  name: string
  owner_id: string
  onboarding_completed: boolean
  created_at: string
}

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  created_at: string
}

export type CategoryKind = 'expense' | 'income'

export interface Category {
  id: string
  household_id: string
  kind: CategoryKind
  name: string
  emoji: string
  color: string
  sort_order: number
  created_at: string
}

export interface Subcategory {
  id: string
  household_id: string
  category_id: string
  name: string
  emoji: string | null
  color: string | null
  sort_order: number
  created_at: string
}

/** period = 'yyyy-MM-01' */
export interface CategoryBudget {
  id: string
  household_id: string
  category_id: string
  period: string
  amount: number
}

export interface SubcategoryBudget {
  id: string
  household_id: string
  subcategory_id: string
  period: string
  amount: number
}

export type AccountType = 'checking' | 'savings' | 'cash' | 'investment' | 'other'

export interface BankAccount {
  id: string
  household_id: string
  name: string
  bank: string | null
  branch: string | null
  account_number: string | null
  type: AccountType
  color: string
  initial_balance: number
  initial_balance_date: string
  sort_order: number
  archived_at: string | null
  created_at: string
}

export interface AccountBalance {
  account_id: string
  household_id: string
  balance: number
  projected_balance: number
  pending_total: number
}

export type TxKind =
  | 'expense_fixed'
  | 'expense_variable'
  | 'income'
  | 'transfer'
  | 'card_purchase'
  | 'card_refund'
  | 'invoice_payment'
  | 'debt_payment'
  | 'investment_contribution'
  | 'investment_withdrawal'
  | 'goal_contribution'
  | 'goal_withdrawal'
export type PaymentMethod = 'credit' | 'debit' | 'pix' | 'cash' | 'boleto' | 'transfer' | 'other'
export type TxDirection = 'inflow' | 'outflow' | 'transfer'
export type TxStatus = 'pending' | 'paid'

export interface Transaction {
  id: string
  household_id: string
  kind: TxKind
  direction: TxDirection
  status: TxStatus
  amount: number
  description: string
  notes: string | null
  occurred_on: string
  due_on: string | null
  paid_on: string | null
  category_id: string | null
  subcategory_id: string | null
  bank_account_id: string | null
  destination_account_id: string | null
  card_id: string | null
  invoice_id: string | null
  installment_plan_id: string | null
  installment_number: number | null
  recurrence_id: string | null
  recurrence_on: string | null
  debt_id: string | null
  debt_installments: number | null
  investment_id: string | null
  household_member_id: string | null
  payment_method: PaymentMethod | null
  /** Fatura escolhida manualmente (mês de referência); null = automática. */
  invoice_month: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Card {
  id: string
  household_id: string
  name: string
  bank: string | null
  brand: string | null
  last_four: string | null
  credit_limit: number | null
  closing_day: number
  due_day: number
  color: string
  default_account_id: string | null
  sort_order: number
  archived_at: string | null
  created_at: string
}

export interface InvoiceSummary {
  invoice_id: string
  household_id: string
  card_id: string
  reference_month: string
  closing_on: string
  due_on: string
  total: number
  paid: number
}

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly'
export type RecurrenceKind = 'expense_fixed' | 'expense_variable' | 'income' | 'card_purchase'

export interface Recurrence {
  id: string
  household_id: string
  kind: RecurrenceKind
  description: string
  amount: number
  frequency: RecurrenceFrequency
  interval_count: number
  start_on: string
  end_on: string | null
  category_id: string | null
  subcategory_id: string | null
  bank_account_id: string | null
  card_id: string | null
  active: boolean
  materialized_until: string | null
  created_at: string
}

export type DebtType = 'loan' | 'financing' | 'credit_card' | 'overdraft' | 'personal' | 'other'

export interface Debt {
  id: string
  household_id: string
  name: string
  creditor: string | null
  type: DebtType
  original_amount: number
  installment_amount: number | null
  total_installments: number | null
  interest_rate: number | null
  start_on: string
  notes: string | null
  paid_off_at: string | null
  created_at: string
}

export interface DebtSummary {
  debt_id: string
  paid_amount: number
  installments_paid: number
  last_payment_on: string | null
}

export type InvestmentType = 'fixed_income' | 'stocks' | 'funds' | 'crypto' | 'pension' | 'savings' | 'other'

export interface Investment {
  id: string
  household_id: string
  name: string
  type: InvestmentType
  institution: string | null
  color: string
  archived_at: string | null
  created_at: string
}

export interface InvestmentSummary {
  investment_id: string
  contributed: number
  withdrawn: number
  last_valuation: number | null
  last_valued_on: string | null
  current_value: number
}

export interface InvestmentValuation {
  id: string
  household_id: string
  investment_id: string
  value: number
  valued_on: string
  created_at: string
}

export interface Goal {
  id: string
  household_id: string
  name: string
  emoji: string
  color: string
  target_amount: number
  target_date: string | null
  achieved_at: string | null
  archived_at: string | null
  created_at: string
}

export interface GoalEntry {
  id: string
  household_id: string
  goal_id: string
  amount: number
  occurred_on: string
  note: string | null
  created_at: string
}

export interface WishlistSection {
  id: string
  household_id: string
  name: string
  emoji: string
  sort_order: number
  created_at: string
}

export interface WishlistItem {
  id: string
  household_id: string
  section_id: string
  name: string
  price: number | null
  url: string | null
  priority: 1 | 2 | 3
  notes: string | null
  purchased_at: string | null
  sort_order: number
  created_at: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  full_name: string
  relationship: string | null
  color: string
  user_id: string | null
  avatar_path: string | null
  sort_order: number
  created_at: string
}

export interface TransactionSplit {
  id: string
  household_id: string
  transaction_id: string
  member_id: string
  percentage: number
}

export type PermissionFlags = { [K in `can_${PermissionAction}_${Module}`]: boolean }

export type Invite = {
  id: string
  household_id: string
  token: string
  full_name: string
  email: string | null
  created_by: string | null
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  revoked_at: string | null
  created_at: string
} & PermissionFlags

export type Permission = {
  id: string
  household_id: string
  user_id: string
  role: MemberRole
  created_at: string
} & { [K in `can_${PermissionAction}_${Module}`]: boolean }
