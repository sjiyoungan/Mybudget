import { applyDebtBalanceSnapshot, DEBT_BALANCE_SEED, restoreLostSeededDebts } from '@/lib/debt-plan'

const STORAGE_KEY = 'mybudget.budget.v1'

export type AccountRole = 'bills' | 'overflow' | 'other'

export type AccountKind = 'checking' | 'credit'

export type BankAccount = {
  id: string
  name: string
  kind: AccountKind
  lastFour: string
  role: AccountRole
  balance: number
}

export type ExpenseCategoryGroup = {
  id: string
  name: string
}

export const DEBT_CATEGORY_ID = 'debt'
export const MORTGAGE_CATEGORY_ID = 'mortgage'
export const VARIABLE_CATEGORY_ID = 'variable'

export const defaultExpenseCategories: ExpenseCategoryGroup[] = [
  { id: MORTGAGE_CATEGORY_ID, name: 'Mortgage' },
  { id: 'pets', name: 'Pets' },
  { id: 'recurring', name: 'Recurring' },
  { id: VARIABLE_CATEGORY_ID, name: 'Variable' },
  { id: DEBT_CATEGORY_ID, name: 'Debt' },
]

export type ExpenseCategory = string

export type ExpenseFrequency = 'monthly' | 'annual'

export type RecurringExpense = {
  id: string
  name: string
  dueDay: number | null
  amount: number
  frequency: ExpenseFrequency
  accountId: string
  category: string
  hidden?: boolean
}

export type DebtType = 'credit-card' | 'loan'

export type Debt = {
  id: string
  lender: string
  dueDay: number | null
  minimum: number
  extraPayment: number
  paidFromAccountId: string
  chargeAccountId: string
  type: DebtType
  apr: number
  /** Promotional APR while `promoEndsOn` is in the future. */
  promoApr: number | null
  /** `YYYY-MM` or `YYYY-MM-DD`. Pay off before this month/day. */
  promoEndsOn: string | null
  balance: number
}

export type BudgetState = {
  accounts: BankAccount[]
  categories: ExpenseCategoryGroup[]
  expenses: RecurringExpense[]
  debts: Debt[]
}

type SheetBankAccount = {
  id: string
  name: string
  lastFour: string
  role: AccountRole
  key: string
}

const sheetBankAccounts: SheetBankAccount[] = [
  {
    id: 'bofa-checking',
    name: 'BoA Debit',
    lastFour: '8856',
    role: 'bills',
    key: 'bofa',
  },
  {
    id: 'discover-checking',
    name: 'Disc Debit',
    lastFour: '2674',
    role: 'overflow',
    key: 'discover',
  },
  {
    id: 'sheet-one',
    name: 'One',
    lastFour: '1871',
    role: 'other',
    key: 'one',
  },
  {
    id: 'sheet-axos',
    name: 'Axos',
    lastFour: '1451',
    role: 'other',
    key: 'axos',
  },
  {
    id: 'sheet-chime',
    name: 'Chime',
    lastFour: '9914',
    role: 'other',
    key: 'chime',
  },
  {
    id: 'sheet-ally',
    name: 'Ally',
    lastFour: '5198',
    role: 'other',
    key: 'ally',
  },
  {
    id: 'sheet-aspiration',
    name: 'Aspiration',
    lastFour: '7427',
    role: 'other',
    key: 'aspiration',
  },
  {
    id: 'sheet-varo',
    name: 'Varo',
    lastFour: '1613',
    role: 'other',
    key: 'varo',
  },
  {
    id: 'sheet-sofi',
    name: 'Sofi chk',
    lastFour: '0755',
    role: 'other',
    key: 'sofi',
  },
]

function accountMatchKey(name: string) {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (n.includes('disc')) return 'discover'
  if (
    n.includes('bankofamerica') ||
    n.includes('bofa') ||
    n.startsWith('boa')
  ) {
    return 'bofa'
  }
  if (n === 'one' || n.includes('capitalone')) return 'one'
  if (n.includes('axos')) return 'axos'
  if (n.includes('chime')) return 'chime'
  if (n.includes('ally')) return 'ally'
  if (n.includes('aspiration')) return 'aspiration'
  if (n.includes('varo')) return 'varo'
  if (n.includes('sofi')) return 'sofi'
  return n
}

function mergeSheetAccounts(accounts: BankAccount[]): BankAccount[] {
  const next = accounts.map((account) => {
    const sheet = sheetBankAccounts.find(
      (item) =>
        item.id === account.id || item.key === accountMatchKey(account.name),
    )
    if (!sheet) return account
    return {
      ...account,
      name: sheet.name,
      kind: isAccountKind(account.kind) ? account.kind : 'checking',
      lastFour: sheet.lastFour,
    }
  })
  const known = new Set(
    next.flatMap((account) => [
      account.id,
      accountMatchKey(account.name),
    ]),
  )
  for (const sheet of sheetBankAccounts) {
    if (known.has(sheet.id) || known.has(sheet.key)) continue
    next.push({
      id: sheet.id,
      name: sheet.name,
      kind: 'checking',
      lastFour: sheet.lastFour,
      role: sheet.role,
      balance: 0,
    })
    known.add(sheet.id)
    known.add(sheet.key)
  }
  return next
}

export const defaultAccounts: BankAccount[] = sheetBankAccounts.map(
  ({ id, name, lastFour, role }) => ({
    id,
    name,
    kind: 'checking',
    lastFour,
    role,
    balance: 0,
  }),
)

export const emptyBudget: BudgetState = {
  accounts: defaultAccounts,
  categories: defaultExpenseCategories,
  expenses: [],
  debts: [],
}

const EXPENSE_SHEET_SEED = 'mybudget.expense-sheet.v1'
const ACCOUNTS_SHEET_SEED = 'mybudget.accounts-sheet.v1'
const DEBT_SHEET_SEED = 'mybudget.debt-sheet.v1'

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
    frequency: 'monthly',
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

function sheetDebts(): Debt[] {
  const row = (
    id: string,
    lender: string,
    minimum: number,
    apr: number,
    dueDay: number | null = null,
  ): Debt => ({
    id,
    lender,
    dueDay,
    minimum,
    extraPayment: 0,
    paidFromAccountId: '',
    chargeAccountId: '',
    type: guessDebtType(lender),
    apr,
    promoApr: null,
    promoEndsOn: null,
    balance: 0,
  })

  return [
    row('debt-discover', 'Discover', 150, 16.49, 4),
    row('debt-p-boa', 'P BoA CC', 982, 14.49, 1),
    row('debt-b-boa', 'B BoA CC', 390, 22.74, 3),
    row('debt-t-boa', 'T BoA CC', 150, 24.49),
    row('debt-tally', 'Tally', 66, 16, 13),
    row('debt-ikea', 'Ikea', 218, 21.99),
    row('debt-affirm', 'Affirm', 1303, 0),
  ]
}

function normalizeCategory(value: unknown): ExpenseCategoryGroup | null {
  if (value == null || typeof value !== 'object') return null
  const item = value as Partial<ExpenseCategoryGroup>
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null
  const name = item.name.trim()
  if (!name) return null
  return { id: item.id, name }
}

function normalizeCategories(
  raw: unknown,
  expenses: RecurringExpense[],
): ExpenseCategoryGroup[] {
  const fromState = Array.isArray(raw)
    ? raw
        .map(normalizeCategory)
        .filter((item): item is ExpenseCategoryGroup => item != null)
    : []
  const list =
    fromState.length > 0 ? [...fromState] : [...defaultExpenseCategories]
  const known = new Set(list.map((item) => item.id))
  for (const def of defaultExpenseCategories) {
    if (!known.has(def.id)) {
      list.push({ ...def })
      known.add(def.id)
    }
  }
  for (const expense of expenses) {
    if (expense.category && !known.has(expense.category)) {
      list.push({ id: expense.category, name: expense.category })
      known.add(expense.category)
    }
  }
  return list
}

function isExpenseCategory(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isExpenseFrequency(value: unknown): value is ExpenseFrequency {
  return value === 'monthly' || value === 'annual'
}

export function isAccountKind(value: unknown): value is AccountKind {
  return value === 'checking' || value === 'credit'
}

export function normalizeAccountKind(value: unknown): AccountKind {
  if (isAccountKind(value)) return value
  if (typeof value !== 'string') return 'checking'
  const n = value.trim().toLowerCase()
  if (n.includes('credit')) return 'credit'
  return 'checking'
}

export function isDebtType(value: unknown): value is DebtType {
  return value === 'credit-card' || value === 'loan'
}

export function guessDebtType(lender: string): DebtType {
  const n = lender.trim().toLowerCase()
  if (/\b(loan|affirm|klarna|afterpay)\b/.test(n) || n.includes('ikea')) {
    return 'loan'
  }
  return 'credit-card'
}

export function normalizeDebtType(value: unknown, lender = ''): DebtType {
  if (isDebtType(value)) return value
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase()
    if (n.includes('loan')) return 'loan'
    if (n === 'cc' || n.includes('credit')) return 'credit-card'
  }
  return guessDebtType(lender)
}

export function debtTypeLabel(type: DebtType) {
  return type === 'loan' ? 'Loan' : 'Credit card'
}

export function isCreditCardDebt(debt: Pick<Debt, 'type' | 'lender'>) {
  return normalizeDebtType(debt.type, debt.lender) === 'credit-card'
}

export function normalizePromoApr(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return value
}

export function normalizePromoEndsOn(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return parsePromoEndsOn(value)
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

function expandYear(year: number) {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year
  return year
}

/** Accepts `YYYY-MM`, `YYYY-MM-DD`, `12/26`, `12/2026`, `12/15/26`. */
export function parsePromoEndsOn(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  if (/^\d{4}-\d{2}$/.test(text)) {
    const [, month] = text.split('-').map(Number)
    if (month >= 1 && month <= 12) return text
    return null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number)
    const last = new Date(year, month, 0).getDate()
    if (month >= 1 && month <= 12 && day >= 1 && day <= last) return text
    return null
  }
  const named = text.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s+(\d{2,4})$|^([A-Za-z]+)\s+(\d{2,4})$/,
  )
  if (named) {
    const monthName = (named[1] ?? named[4]).toLowerCase()
    const month = MONTH_NAMES.findIndex((item) => item.startsWith(monthName))
    if (month >= 0) {
      if (named[1] && named[2] && named[3]) {
        const day = Number(named[2])
        const year = expandYear(Number(named[3]))
        const last = new Date(year, month + 1, 0).getDate()
        if (day >= 1 && day <= last) {
          return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }
        return null
      }
      const year = expandYear(Number(named[5]))
      return `${year}-${String(month + 1).padStart(2, '0')}`
    }
  }
  const parts = text.split(/[/\-.]/).map((part) => part.trim()).filter(Boolean)
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isFinite(n))) return null
  if (parts.length === 2) {
    const month = nums[0]
    const year = expandYear(nums[1])
    if (month >= 1 && month <= 12 && year >= 1900) {
      return `${year}-${String(month).padStart(2, '0')}`
    }
    return null
  }
  if (parts.length === 3) {
    const month = nums[0]
    const day = nums[1]
    const year = expandYear(nums[2])
    const last = new Date(year, month, 0).getDate()
    if (month >= 1 && month <= 12 && day >= 1 && day <= last && year >= 1900) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return null
}

export function promoEndYearMonth(endsOn: string | null): {
  year: number
  month: number
  day: number | null
} | null {
  const parsed = endsOn ? parsePromoEndsOn(endsOn) : null
  if (!parsed) return null
  const [year, month, day] = parsed.split('-').map(Number)
  return {
    year,
    month: month - 1,
    day: parsed.length > 7 ? day : null,
  }
}

export function formatPromoEndsOn(endsOn: string | null, short = false): string {
  const end = promoEndYearMonth(endsOn)
  if (!end) return ''
  const date = new Date(end.year, end.month, end.day ?? 1)
  if (end.day != null) {
    return date.toLocaleDateString('en-US', {
      month: short ? 'numeric' : 'short',
      day: 'numeric',
      year: short ? '2-digit' : 'numeric',
    })
  }
  return date.toLocaleDateString('en-US', {
    month: short ? 'numeric' : 'short',
    year: short ? '2-digit' : 'numeric',
  })
}

export function formatPromoSummary(apr: number | null, endsOn: string | null) {
  const rate = apr == null ? '' : `${apr}%`
  const end = promoEndYearMonth(endsOn)
  const date = end ? `${end.month + 1}/${String(end.year).slice(-2)}` : ''
  return [rate, date].filter(Boolean).join(' – ')
}

/** Promo still applies in this calendar month (inclusive of the expiry month). */
export function promoCoversMonth(
  debt: Pick<Debt, 'promoApr' | 'promoEndsOn'>,
  year: number,
  month: number,
) {
  const end = promoEndYearMonth(debt.promoEndsOn)
  if (end) return year * 12 + month <= end.year * 12 + end.month
  return debt.promoApr != null
}

export function effectiveApr(
  debt: Pick<Debt, 'apr' | 'promoApr' | 'promoEndsOn'>,
  year: number,
  month: number,
) {
  if (promoCoversMonth(debt, year, month) && debt.promoApr != null) {
    return debt.promoApr
  }
  return debt.apr
}

/** Months left to pay off before the promo ends, including this month. */
export function monthsUntilPromoEnd(
  debt: Pick<Debt, 'promoEndsOn'>,
  year: number,
  month: number,
) {
  const end = promoEndYearMonth(debt.promoEndsOn)
  if (!end) return null
  const left = end.year * 12 + end.month - (year * 12 + month) + 1
  if (left <= 0) return null
  return left
}

export function monthlyInterest(balance: number, apr: number) {
  if (balance <= 0.005) return 0
  return roundCents((balance * Math.max(0, apr)) / 100 / 12)
}

/** Round toward +∞ to the next cent so minimums and totals never round down. */
export function ceilCents(value: number) {
  return Math.ceil(value * 100 - 1e-9) / 100
}

/** Round toward +∞ to the next dollar so displayed charges and totals drop cents. */
export function ceilDollars(value: number) {
  if (value > 0) return Math.ceil(value - 1e-9)
  if (value < 0) return Math.ceil(value)
  return 0
}

/** Typical card statement minimum: 1% of balance plus this month's interest, $25 floor. */
export function estimatedCardMinimum(balance: number, apr: number) {
  if (balance <= 0.005) return 0
  const interest = monthlyInterest(balance, apr)
  const percent = balance * 0.01
  return Math.min(ceilCents(Math.max(25, percent + interest)), ceilCents(balance))
}

export function accountKindLabel(kind: AccountKind) {
  return kind === 'credit' ? 'Credit card' : 'Checking'
}

export function roundCents(value: number) {
  return Math.round(value * 100) / 100
}

export function monthlyAmount(
  expense: Pick<RecurringExpense, 'amount' | 'frequency'>,
) {
  if (expense.frequency === 'annual') return roundCents(expense.amount / 12)
  return expense.amount
}

export function ceiledMonthlyAmount(
  expense: Pick<RecurringExpense, 'amount' | 'frequency'>,
) {
  return ceilDollars(monthlyAmount(expense))
}

export function billedAmountFromMonthly(
  monthly: number,
  frequency: ExpenseFrequency,
) {
  if (frequency === 'annual') return roundCents(monthly * 12)
  return monthly
}

function lastFourDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 4)
}

function lastFourFromKind(kind: string) {
  const match = kind.match(/(\d{4})\s*$/)
  return match?.[1] ?? ''
}

function normalizeAccount(value: unknown): BankAccount | null {
  if (value == null || typeof value !== 'object') return null
  const item = value as Partial<BankAccount>
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null
  const rawKind = typeof item.kind === 'string' ? item.kind : ''
  const lastFour =
    typeof item.lastFour === 'string' && lastFourDigits(item.lastFour)
      ? lastFourDigits(item.lastFour)
      : lastFourFromKind(rawKind)
  const kind = normalizeAccountKind(
    rawKind.replace(/\s*·\s*\d{4}\s*$/, '').trim(),
  )
  const role =
    item.role === 'bills' || item.role === 'overflow' ? item.role : 'other'
  return {
    id: item.id,
    name: item.name,
    kind,
    lastFour,
    role,
    balance: typeof item.balance === 'number' ? item.balance : 0,
  }
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
    frequency: isExpenseFrequency(item.frequency) ? item.frequency : 'monthly',
    accountId: item.accountId,
    category: isExpenseCategory(item.category) ? item.category : 'recurring',
    hidden: item.hidden === true,
  }
}

function normalizeDebt(value: unknown): Debt | null {
  if (value == null || typeof value !== 'object') return null
  const item = value as Partial<Debt>
  if (
    typeof item.id !== 'string' ||
    typeof item.lender !== 'string' ||
    typeof item.minimum !== 'number' ||
    typeof item.balance !== 'number'
  ) {
    return null
  }
  const lender = item.lender.trim()
  if (!lender) return null
  const dueDay =
    typeof item.dueDay === 'number' &&
    Number.isInteger(item.dueDay) &&
    item.dueDay >= 1 &&
    item.dueDay <= 31
      ? item.dueDay
      : null
  const apr = typeof item.apr === 'number' && Number.isFinite(item.apr) ? item.apr : 0
  const extraPayment =
    typeof item.extraPayment === 'number' && Number.isFinite(item.extraPayment)
      ? item.extraPayment
      : 0
  const paidFromAccountId =
    typeof item.paidFromAccountId === 'string' ? item.paidFromAccountId : ''
  const chargeAccountId =
    typeof item.chargeAccountId === 'string' ? item.chargeAccountId : ''
  const type = normalizeDebtType(item.type, lender)
  return {
    id: item.id,
    lender,
    dueDay,
    minimum: item.minimum,
    extraPayment,
    paidFromAccountId,
    chargeAccountId,
    type,
    apr,
    promoApr: normalizePromoApr(item.promoApr),
    promoEndsOn: normalizePromoEndsOn(item.promoEndsOn),
    balance: item.balance,
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

export function parseBudgetState(value: unknown): BudgetState | null {
  if (!isBudgetState(value)) return null
  const parsed = value
  const expenses = parsed.expenses
    .map(normalizeExpense)
    .filter((item): item is RecurringExpense => item != null)
  return {
    accounts: (parsed.accounts.length > 0 ? parsed.accounts : defaultAccounts)
      .map(normalizeAccount)
      .filter((item): item is BankAccount => item != null),
    expenses,
    debts: restoreLostSeededDebts(
      parsed.debts
        .map(normalizeDebt)
        .filter((item): item is Debt => item != null),
    ),
    categories: normalizeCategories(parsed.categories, expenses),
  }
}

export function markBudgetSeedsApplied() {
  localStorage.setItem(EXPENSE_SHEET_SEED, '1')
  localStorage.setItem(ACCOUNTS_SHEET_SEED, '1')
  localStorage.setItem(DEBT_SHEET_SEED, '1')
  localStorage.setItem(DEBT_BALANCE_SEED, '1')
}

export function loadBudget(): BudgetState {
  let state = emptyBudget
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) state = parseBudgetState(JSON.parse(raw)) ?? emptyBudget
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

  if (!localStorage.getItem(ACCOUNTS_SHEET_SEED)) {
    state = {
      ...state,
      accounts: mergeSheetAccounts(state.accounts).map((account) =>
        normalizeAccount(account),
      ).filter((item): item is BankAccount => item != null),
    }
    saveBudget(state)
    localStorage.setItem(ACCOUNTS_SHEET_SEED, '1')
  }

  if (!localStorage.getItem(DEBT_SHEET_SEED)) {
    state = {
      ...state,
      debts: sheetDebts(),
    }
    saveBudget(state)
    localStorage.setItem(DEBT_SHEET_SEED, '1')
  }

  if (!localStorage.getItem(DEBT_BALANCE_SEED)) {
    state = {
      ...state,
      debts: applyDebtBalanceSnapshot(state.debts),
    }
    saveBudget(state)
    localStorage.setItem(DEBT_BALANCE_SEED, '1')
  }

  const linked = syncLinkedDebts(state)
  if (
    linked.expenses !== state.expenses ||
    linked.debts !== state.debts ||
    linked.categories !== state.categories
  ) {
    saveBudget(linked)
  }

  return linked
}

export function saveBudget(state: BudgetState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function isHiddenExpense(expense: Pick<RecurringExpense, 'hidden'>) {
  return expense.hidden === true
}

export function monthlyNeedForAccount(
  expenses: RecurringExpense[],
  accountId: string,
) {
  return expenses
    .filter((item) => item.accountId === accountId && !isHiddenExpense(item))
    .reduce((sum, item) => sum + monthlyAmount(item), 0)
}

export function paymentWithoutCharges(debt: Pick<Debt, 'minimum' | 'extraPayment'>) {
  return roundCents(debt.minimum + debt.extraPayment)
}

function isChargeOnDebt(
  expense: RecurringExpense,
  debt: Pick<Debt, 'id'>,
  includeHidden = false,
) {
  if (!includeHidden && isHiddenExpense(expense)) return false
  if (expense.id === debt.id || isDebtExpense(expense)) return false
  return expense.accountId === debt.id
}

export function chargesForDebt(
  expenses: RecurringExpense[],
  debt: Pick<Debt, 'id'>,
) {
  const sum = expenses
    .filter((expense) => isChargeOnDebt(expense, debt))
    .reduce((total, expense) => total + monthlyAmount(expense), 0)
  return ceilDollars(sum)
}

export function chargeExpensesForDebt(
  expenses: RecurringExpense[],
  debt: Pick<Debt, 'id'>,
  includeHidden = false,
) {
  return expenses.filter((expense) => isChargeOnDebt(expense, debt, includeHidden))
}

export function hiddenChargeExpensesForDebt(
  expenses: RecurringExpense[],
  debt: Pick<Debt, 'id'>,
) {
  return chargeExpensesForDebt(expenses, debt, true).filter(isHiddenExpense)
}

export function totalPaymentForDebt(
  expenses: RecurringExpense[],
  debt: Pick<Debt, 'id' | 'minimum' | 'extraPayment' | 'chargeAccountId'>,
) {
  return ceilDollars(paymentWithoutCharges(debt) + chargesForDebt(expenses, debt))
}

export function shownMonthlyPayment(
  expense: RecurringExpense,
  _expenses: RecurringExpense[],
  debts: Debt[],
) {
  if (!isDebtExpense(expense)) return monthlyAmount(expense)
  const debt = debts.find((item) => item.id === expense.id)
  if (!debt) return monthlyAmount(expense)
  return paymentWithoutCharges(debt)
}

export function storedAmountFromShownPayment(
  shownMonthly: number,
  expense: RecurringExpense,
  _expenses: RecurringExpense[],
  _debts: Debt[],
  frequency: ExpenseFrequency = expense.frequency,
) {
  return billedAmountFromMonthly(shownMonthly, frequency)
}

export type DepositLine = {
  id: string
  name: string
  monthly: number
  expense?: RecurringExpense
  charges: RecurringExpense[]
  hiddenCharges: RecurringExpense[]
  kind: 'checking' | 'debt'
}

export function depositLinesForAccount(
  expenses: RecurringExpense[],
  debts: Debt[],
  accountId: string,
  billsAccountId?: string,
): DepositLine[] {
  const paidFromHere = debts.filter(
    (debt) =>
      debt.paidFromAccountId === accountId ||
      (debt.paidFromAccountId === '' && billsAccountId === accountId),
  )
  const listed = new Set<string>()
  const lines: DepositLine[] = []

  for (const expense of expenses) {
    if (isHiddenExpense(expense) || expense.accountId !== accountId) continue
    const debt = paidFromHere.find((item) => item.id === expense.id)
    listed.add(expense.id)
    if (debt || isDebtExpense(expense)) {
      lines.push({
        id: expense.id,
        name: expense.name,
        monthly: debt ? paymentWithoutCharges(debt) : ceiledMonthlyAmount(expense),
        expense,
        charges: debt ? chargeExpensesForDebt(expenses, debt) : [],
        hiddenCharges: debt ? hiddenChargeExpensesForDebt(expenses, debt) : [],
        kind: 'debt',
      })
      continue
    }
    lines.push({
      id: expense.id,
      name: expense.name,
      monthly: ceiledMonthlyAmount(expense),
      expense,
      charges: [],
      hiddenCharges: [],
      kind: 'checking',
    })
  }

  for (const debt of paidFromHere) {
    if (listed.has(debt.id)) continue
    const linked = expenses.find((expense) => expense.id === debt.id)
    if (linked && isHiddenExpense(linked)) continue
    lines.push({
      id: debt.id,
      name: debt.lender,
      monthly: paymentWithoutCharges(debt),
      expense: linked,
      charges: chargeExpensesForDebt(expenses, debt),
      hiddenCharges: hiddenChargeExpensesForDebt(expenses, debt),
      kind: 'debt',
    })
  }

  return lines
}

export function monthlyDepositNeed(
  expenses: RecurringExpense[],
  debts: Debt[],
  accountId: string,
  billsAccountId?: string,
) {
  return depositLinesForAccount(expenses, debts, accountId, billsAccountId).reduce(
    (sum, line) =>
      sum +
      line.monthly +
      line.charges.reduce((chargeSum, expense) => chargeSum + monthlyAmount(expense), 0),
    0,
  )
}

export function leftoverPaycheckDeposit(
  expenses: RecurringExpense[],
  monthlyNet: number,
) {
  return Math.max(0, roundCents(monthlyNet - totalMonthlyExpenses(expenses)))
}

export function accountDepositNeed(
  expenses: RecurringExpense[],
  debts: Debt[],
  account: Pick<BankAccount, 'id' | 'role'>,
  accounts: BankAccount[],
  monthlyNet: number,
) {
  if (account.role === 'overflow') {
    return leftoverPaycheckDeposit(expenses, monthlyNet)
  }
  return monthlyDepositNeed(
    expenses,
    debts,
    account.id,
    billsAccount(accounts)?.id,
  )
}

export function compareExpensesByDueDay(
  left: RecurringExpense,
  right: RecurringExpense,
) {
  return (left.dueDay ?? 32) - (right.dueDay ?? 32)
}

export function compareDebtsByDueDay(left: Debt, right: Debt) {
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
  category: string,
) {
  return expenses
    .filter((item) => item.category === category && !isHiddenExpense(item))
    .reduce((sum, item) => sum + ceiledMonthlyAmount(item), 0)
}

export function totalDebtMinimums(debts: Debt[]) {
  return debts.reduce((sum, item) => sum + item.minimum, 0)
}

export function totalDebtPayments(debts: Debt[]) {
  return debts.reduce((sum, item) => sum + paymentWithoutCharges(item), 0)
}

export function totalMonthlyExpenses(expenses: RecurringExpense[]) {
  return expenses
    .filter((item) => !isHiddenExpense(item))
    .reduce((sum, item) => sum + ceiledMonthlyAmount(item), 0)
}

export function totalMonthlyExpensesExcluding(
  expenses: RecurringExpense[],
  categoryIds: string[],
) {
  const skip = new Set(categoryIds)
  return expenses
    .filter((item) => !skip.has(item.category) && !isHiddenExpense(item))
    .reduce((sum, item) => sum + ceiledMonthlyAmount(item), 0)
}

export function isDebtExpense(expense: Pick<RecurringExpense, 'category'>) {
  return expense.category === DEBT_CATEGORY_ID
}

export function expenseFromDebt(
  debt: Debt,
  existing?: RecurringExpense,
): RecurringExpense {
  const frequency = existing?.frequency ?? 'monthly'
  const monthly = paymentWithoutCharges(debt)
  return {
    id: debt.id,
    name: debt.lender,
    dueDay: debt.dueDay,
    amount:
      frequency === 'annual'
        ? billedAmountFromMonthly(monthly, frequency)
        : monthly,
    frequency,
    accountId: debt.paidFromAccountId || existing?.accountId || '',
    category: DEBT_CATEGORY_ID,
    hidden: existing?.hidden,
  }
}

export function debtFromExpense(
  expense: RecurringExpense,
  existing?: Debt,
): Debt {
  const monthly = monthlyAmount(expense)
  if (!existing) {
    return {
      id: expense.id,
      lender: expense.name,
      dueDay: expense.dueDay,
      minimum: monthly,
      extraPayment: 0,
      paidFromAccountId: expense.accountId,
      chargeAccountId: '',
      type: guessDebtType(expense.name),
      apr: 0,
      promoApr: null,
      promoEndsOn: null,
      balance: 0,
    }
  }
  return {
    ...existing,
    lender: expense.name,
    dueDay: expense.dueDay,
    extraPayment: roundCents(monthly - existing.minimum),
    paidFromAccountId: expense.accountId,
  }
}

export function applyDebtsToExpenses(
  expenses: RecurringExpense[],
  debts: Debt[],
): RecurringExpense[] {
  const debtIds = new Set(debts.map((debt) => debt.id))
  const byId = new Map(expenses.map((expense) => [expense.id, expense]))
  const linkedById = new Map(
    debts.map((debt) => [debt.id, expenseFromDebt(debt, byId.get(debt.id))]),
  )
  const used = new Set<string>()
  const next: RecurringExpense[] = []
  for (const expense of expenses) {
    if (debtIds.has(expense.id) || isDebtExpense(expense)) {
      const linked = linkedById.get(expense.id)
      if (linked) {
        next.push(linked)
        used.add(expense.id)
      }
      continue
    }
    next.push(expense)
  }
  for (const debt of debts) {
    if (used.has(debt.id)) continue
    const linked = linkedById.get(debt.id)
    if (linked) next.push(linked)
  }
  return next
}

export function applyExpensesToDebts(
  expenses: RecurringExpense[],
  debts: Debt[],
): Debt[] {
  const byId = new Map(debts.map((debt) => [debt.id, debt]))
  const order = new Map(debts.map((debt, index) => [debt.id, index]))
  return expenses
    .filter(isDebtExpense)
    .map((expense) => debtFromExpense(expense, byId.get(expense.id)))
    .sort((left, right) => {
      const leftIndex = order.get(left.id)
      const rightIndex = order.get(right.id)
      if (leftIndex != null && rightIndex != null) return leftIndex - rightIndex
      if (leftIndex != null) return -1
      if (rightIndex != null) return 1
      return 0
    })
}

export function syncLinkedDebts(state: BudgetState): BudgetState {
  const debtIds = new Set(state.debts.map((debt) => debt.id))
  const extra = state.expenses.filter(
    (expense) => isDebtExpense(expense) && !debtIds.has(expense.id),
  )
  const debts = [
    ...state.debts,
    ...extra.map((expense) => debtFromExpense(expense)),
  ]
  const expenses = applyDebtsToExpenses(state.expenses, debts)
  return {
    ...state,
    debts,
    expenses,
    categories: normalizeCategories(state.categories, expenses),
  }
}
