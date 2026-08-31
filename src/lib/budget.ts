import { applyDebtBalanceSnapshot, DEBT_BALANCE_SEED } from '@/lib/debt-plan'

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

export function loadBudget(): BudgetState {
  let state = emptyBudget
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isBudgetState(parsed)) {
        const expenses = parsed.expenses
          .map(normalizeExpense)
          .filter((item): item is RecurringExpense => item != null)
        state = {
          accounts: (parsed.accounts.length > 0
            ? parsed.accounts
            : defaultAccounts
          )
            .map(normalizeAccount)
            .filter((item): item is BankAccount => item != null),
          expenses,
          debts: parsed.debts
            .map(normalizeDebt)
            .filter((item): item is Debt => item != null),
          categories: normalizeCategories(parsed.categories, expenses),
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

export function monthlyNeedForAccount(
  expenses: RecurringExpense[],
  accountId: string,
) {
  return expenses
    .filter((item) => item.accountId === accountId)
    .reduce((sum, item) => sum + monthlyAmount(item), 0)
}

export function paymentWithoutCharges(debt: Pick<Debt, 'minimum' | 'extraPayment'>) {
  return roundCents(debt.minimum + debt.extraPayment)
}

function isChargeOnDebt(
  expense: RecurringExpense,
  debt: Pick<Debt, 'id' | 'chargeAccountId'>,
) {
  if (expense.id === debt.id || isDebtExpense(expense)) return false
  if (expense.accountId === debt.id) return true
  return debt.chargeAccountId !== '' && expense.accountId === debt.chargeAccountId
}

export function chargesForDebt(
  expenses: RecurringExpense[],
  debt: Pick<Debt, 'id' | 'chargeAccountId'>,
) {
  return expenses
    .filter((expense) => isChargeOnDebt(expense, debt))
    .reduce((sum, expense) => sum + monthlyAmount(expense), 0)
}

export function chargeExpensesForDebt(
  expenses: RecurringExpense[],
  debt: Pick<Debt, 'id' | 'chargeAccountId'>,
) {
  return expenses.filter((expense) => isChargeOnDebt(expense, debt))
}

export function totalPaymentForDebt(
  expenses: RecurringExpense[],
  debt: Pick<Debt, 'id' | 'minimum' | 'extraPayment' | 'chargeAccountId'>,
) {
  return roundCents(paymentWithoutCharges(debt) + chargesForDebt(expenses, debt))
}

export type DepositLine = {
  id: string
  name: string
  monthly: number
  expense?: RecurringExpense
  charges: RecurringExpense[]
}

export function depositLinesForAccount(
  expenses: RecurringExpense[],
  debts: Debt[],
  accountId: string,
): DepositLine[] {
  const paidFromHere = debts.filter((debt) => debt.paidFromAccountId === accountId)
  const listed = new Set<string>()
  const lines: DepositLine[] = []

  for (const expense of expenses) {
    if (expense.accountId !== accountId) continue
    const debt = paidFromHere.find((item) => item.id === expense.id)
    listed.add(expense.id)
    if (debt) {
      lines.push({
        id: expense.id,
        name: expense.name,
        monthly: paymentWithoutCharges(debt),
        expense,
        charges: chargeExpensesForDebt(expenses, debt),
      })
      continue
    }
    lines.push({
      id: expense.id,
      name: expense.name,
      monthly: monthlyAmount(expense),
      expense,
      charges: [],
    })
  }

  for (const debt of paidFromHere) {
    if (listed.has(debt.id)) continue
    lines.push({
      id: debt.id,
      name: debt.lender,
      monthly: paymentWithoutCharges(debt),
      charges: chargeExpensesForDebt(expenses, debt),
    })
  }

  return lines
}

export function monthlyDepositNeed(
  expenses: RecurringExpense[],
  debts: Debt[],
  accountId: string,
) {
  return depositLinesForAccount(expenses, debts, accountId).reduce(
    (sum, line) =>
      sum +
      line.monthly +
      line.charges.reduce((chargeSum, expense) => chargeSum + monthlyAmount(expense), 0),
    0,
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
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + monthlyAmount(item), 0)
}

export function totalDebtMinimums(debts: Debt[]) {
  return debts.reduce((sum, item) => sum + item.minimum, 0)
}

export function totalDebtPayments(debts: Debt[]) {
  return debts.reduce((sum, item) => sum + paymentWithoutCharges(item), 0)
}

export function totalMonthlyExpenses(expenses: RecurringExpense[]) {
  return expenses.reduce((sum, item) => sum + monthlyAmount(item), 0)
}

export function totalMonthlyExpensesExcluding(
  expenses: RecurringExpense[],
  categoryIds: string[],
) {
  const skip = new Set(categoryIds)
  return expenses
    .filter((item) => !skip.has(item.category))
    .reduce((sum, item) => sum + monthlyAmount(item), 0)
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
  const kept = expenses.filter(
    (expense) => !debtIds.has(expense.id) && !isDebtExpense(expense),
  )
  const linked = debts.map((debt) => expenseFromDebt(debt, byId.get(debt.id)))
  return [...kept, ...linked].sort(compareExpensesByDueDay)
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
