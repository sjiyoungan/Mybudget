const STORAGE_KEY = 'mybudget.budget.v1'

export type AccountRole = 'bills' | 'overflow' | 'other'

export type BankAccount = {
  id: string
  name: string
  kind: string
  role: AccountRole
  balance: number
}

export const expenseCategories = [
  { id: 'mortgage', label: 'Mortgage' },
  { id: 'pets', label: 'Pets' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'variable', label: 'Variable' },
] as const

export type ExpenseCategory = (typeof expenseCategories)[number]['id']

export type RecurringExpense = {
  id: string
  name: string
  dueDay: number
  amount: number
  accountId: string
  category: ExpenseCategory
}

export type Debt = {
  id: string
  lender: string
  dueDay: number
  minimum: number
  apr: number
  balance: number
}

export type BudgetState = {
  accounts: BankAccount[]
  expenses: RecurringExpense[]
  debts: Debt[]
}

export const defaultAccounts: BankAccount[] = [
  {
    id: 'bofa-checking',
    name: 'Bank of America Personal Checking',
    kind: 'Checking',
    role: 'bills',
    balance: 0,
  },
  {
    id: 'discover-checking',
    name: 'Discover Checking',
    kind: 'Checking',
    role: 'overflow',
    balance: 0,
  },
]

export const emptyBudget: BudgetState = {
  accounts: defaultAccounts,
  expenses: [],
  debts: [],
}

function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return expenseCategories.some((category) => category.id === value)
}

function normalizeExpense(value: unknown): RecurringExpense | null {
  if (value == null || typeof value !== 'object') return null
  const item = value as Partial<RecurringExpense>
  if (
    typeof item.id !== 'string' ||
    typeof item.name !== 'string' ||
    typeof item.dueDay !== 'number' ||
    typeof item.amount !== 'number' ||
    typeof item.accountId !== 'string'
  ) {
    return null
  }
  return {
    id: item.id,
    name: item.name,
    dueDay: item.dueDay,
    amount: item.amount,
    accountId: item.accountId,
    category: isExpenseCategory(item.category) ? item.category : 'recurring',
  }
}

function isBudgetState(value: unknown): value is BudgetState {
  if (value == null || typeof value !== 'object') return false
  const record = value as Partial<BudgetState>
  return (
    Array.isArray(record.accounts) &&
    Array.isArray(record.expenses) &&
    Array.isArray(record.debts)
  )
}

export function loadBudget(): BudgetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyBudget
    const parsed: unknown = JSON.parse(raw)
    if (!isBudgetState(parsed)) return emptyBudget
    return {
      accounts: parsed.accounts.length > 0 ? parsed.accounts : defaultAccounts,
      expenses: parsed.expenses
        .map(normalizeExpense)
        .filter((item): item is RecurringExpense => item != null),
      debts: parsed.debts,
    }
  } catch {
    return emptyBudget
  }
}

export function saveBudget(state: BudgetState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function monthlyNeedForAccount(
  expenses: RecurringExpense[],
  accountId: string,
) {
  return expenses
    .filter((item) => item.accountId === accountId)
    .reduce((sum, item) => sum + item.amount, 0)
}

export function formatDueDay(day: number) {
  const j = day % 10
  const k = day % 100
  const suffix =
    j === 1 && k !== 11
      ? 'st'
      : j === 2 && k !== 12
        ? 'nd'
        : j === 3 && k !== 13
          ? 'rd'
          : 'th'
  return `${day}${suffix}`
}

export function accountById(accounts: BankAccount[], id: string) {
  return accounts.find((account) => account.id === id)
}

export function billsAccount(accounts: BankAccount[]) {
  return accounts.find((account) => account.role === 'bills') ?? null
}

export function overflowAccount(accounts: BankAccount[]) {
  return accounts.find((account) => account.role === 'overflow') ?? null
}

export function totalForCategory(
  expenses: RecurringExpense[],
  category: ExpenseCategory,
) {
  return expenses
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + item.amount, 0)
}
