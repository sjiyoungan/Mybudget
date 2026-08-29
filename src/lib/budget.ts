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
  dueDay: number | null
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

const EXPENSE_SHEET_SEED = 'mybudget.expense-sheet.v1'

function sheetExpenses(accountId: string): RecurringExpense[] {
  const row = (
    id: string,
    name: string,
    amount: number,
    category: ExpenseCategory,
    dueDay: number | null = null,
  ): RecurringExpense => ({
    id,
    name,
    amount,
    category,
    dueDay,
    accountId,
  })

  return [
    row('sheet-mortgage', 'Mortgage', 692, 'mortgage'),
    row('sheet-suburban-pest', 'Suburban pest', 66, 'recurring'),
    row('sheet-state-farm', 'State Farm', 290, 'recurring', 1),
    row('sheet-water', 'Water', 160, 'recurring', 21),
    row('sheet-noom', 'Noom', 163, 'recurring'),
    row('sheet-yoga', 'Yoga', 110, 'recurring'),
    row('sheet-phone', 'Phone', 197, 'recurring', 15),
    row('sheet-rowdy-chewy', 'Rowdy - Chewy', 250, 'pets'),
    row('sheet-rowdy-insurance', 'Rowdy - Insurance', 72, 'pets'),
    row('sheet-rowdy-vet', 'Rowdy - Vet', 50, 'pets'),
    row('sheet-rollo-insurance', 'Rollo - Insurance', 35, 'pets'),
    row('sheet-rollo-chewy', 'Rollo - Chewy', 360, 'pets'),
    row('sheet-rollo-vet', 'Rollo - Vet', 50, 'pets'),
    row('sheet-subscription', 'Subscription', 383, 'recurring'),
    row('sheet-holidays', 'Holidays', 67, 'recurring'),
    row('sheet-unnes-phone', "Unne's phone", 160, 'recurring'),
    row('sheet-spending', 'Spending', 300, 'variable'),
    row('sheet-food', 'Food', 500, 'variable'),
    row('sheet-gas', 'Gas', 75, 'variable'),
  ]
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
    typeof item.amount !== 'number' ||
    typeof item.accountId !== 'string'
  ) {
    return null
  }
  const dueDay =
    typeof item.dueDay === 'number' &&
    Number.isInteger(item.dueDay) &&
    item.dueDay >= 1 &&
    item.dueDay <= 31
      ? item.dueDay
      : null
  return {
    id: item.id,
    name: item.name,
    dueDay,
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
  let state = emptyBudget
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isBudgetState(parsed)) {
        state = {
          accounts:
            parsed.accounts.length > 0 ? parsed.accounts : defaultAccounts,
          expenses: parsed.expenses
            .map(normalizeExpense)
            .filter((item): item is RecurringExpense => item != null),
          debts: parsed.debts,
        }
      }
    }
  } catch {
    state = emptyBudget
  }

  if (!localStorage.getItem(EXPENSE_SHEET_SEED)) {
    const accountId =
      billsAccount(state.accounts)?.id ?? state.accounts[0]?.id ?? ''
    state = {
      ...state,
      expenses: sheetExpenses(accountId).sort(compareExpensesByDueDay),
    }
    saveBudget(state)
    localStorage.setItem(EXPENSE_SHEET_SEED, '1')
  }

  return state
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

export function compareExpensesByDueDay(
  left: RecurringExpense,
  right: RecurringExpense,
) {
  return (left.dueDay ?? 32) - (right.dueDay ?? 32)
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
