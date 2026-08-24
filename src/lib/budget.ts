const STORAGE_KEY = 'mybudget.budget.v1'

export type AccountRole = 'bills' | 'overflow' | 'other'

export type BankAccount = {
  id: string
  name: string
  kind: string
  role: AccountRole
  balance: number
}

export type RecurringExpense = {
  id: string
  name: string
  dueDay: number
  amount: number
  accountId: string
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
      expenses: parsed.expenses,
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
