import {
  chargesForDebt,
  effectiveApr,
  monthsUntilPromoEnd,
  paymentWithoutCharges,
  totalMonthlyExpenses,
  type Debt,
  type RecurringExpense,
} from '@/lib/budget'
import {
  defaultMonthlyDebtBudget,
  defaultSnowballDebtId,
  seededAffirmLoans,
  seededAmazonDebt,
  seededDebtBalances,
  seededDebtHistory,
  seededHistoryDebts,
  seededHistoryOpening,
  type SeededAffirmLoan,
  type SeededHistoryMonth,
} from '@/lib/debt-plan-seed'

export const DEBT_BALANCE_SEED = 'mybudget.debt-balances-2026-08.v1'
export const AFFIRM_DEBT_ID = 'debt-affirm'
const PLAN_KEY = 'mybudget.debt-plan.v1'
const PLAN_HISTORY_RESET = 'mybudget.planner-history-reset.v1'
const UNLOG_AUGUST_2026 = 'mybudget.unlog-2026-08.v1'
const FRESH_PLAN_START = '2026-08'

export type AffirmLoan = SeededAffirmLoan

export const PAYOFF_STRATEGIES = [
  { id: 'avalanche', label: 'Avalanche' },
  { id: 'snowball', label: 'Snowball' },
  { id: 'custom', label: 'Custom' },
  { id: 'highest-interest', label: 'Highest interest' },
] as const

export type PayoffStrategy = (typeof PAYOFF_STRATEGIES)[number]['id']

export type DebtPlanState = {
  monthlyBudget: number
  snowballDebtId: string
  strategy: PayoffStrategy
  customOrder: string[]
  recurringCharges: Record<string, number>
  chargesByMonth: Record<string, Record<string, number>>
  interestByMonth: Record<string, Record<string, number>>
  paymentsByMonth: Record<string, Record<string, number>>
  /** Month keys (`YYYY-MM`) whose paid amounts were saved. */
  loggedMonths: string[]
  /** Snapshots of logged months, used as history once the month is past. */
  loggedHistory: Record<string, PlannerMonth>
  /** First planner month after the history wipe (`YYYY-MM`). */
  planStartMonth: string
  affirmLoans: AffirmLoan[]
}

export type PlannerLine = {
  debtId: string
  start: number
  interest: number
  charged: number
  paid: number
  extra: number
  balance: number
}

export type PlannerMonth = {
  year: number
  month: number
  source: 'history' | 'plan'
  lines: PlannerLine[]
  totalInterest: number
  totalPaid: number
  extraPaid: number
  remainingTotal: number
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100
}

export function applyDebtBalanceSnapshot(debts: Debt[]): Debt[] {
  const next = debts.map((debt) => {
    const balance = seededDebtBalances[debt.id]
    if (typeof balance === 'number') {
      return { ...debt, balance }
    }
    if (debt.id === AFFIRM_DEBT_ID) {
      return {
        ...debt,
        ...affirmDebtFromLoans(seededAffirmLoans),
      }
    }
    return debt
  })
  if (next.some((debt) => debt.id === seededAmazonDebt.id)) return next
  const ikeaAt = next.findIndex((debt) => debt.id === 'debt-ikea')
  const amazon: Debt = { ...seededAmazonDebt }
  if (ikeaAt >= 0) {
    return [...next.slice(0, ikeaAt + 1), amazon, ...next.slice(ikeaAt + 1)]
  }
  return [...next, amazon]
}

export function debtsWithHistoryAccounts(debts: Debt[]): Debt[] {
  const have = new Set(debts.map((debt) => debt.id))
  const extra: Debt[] = []
  for (const meta of seededHistoryDebts) {
    if (have.has(meta.id)) continue
    extra.push({
      id: meta.id,
      lender: meta.lender,
      dueDay: null,
      minimum: 0,
      extraPayment: 0,
      paidFromAccountId: '',
      chargeAccountId: '',
      type: meta.type,
      apr: meta.apr,
      promoApr: null,
      promoEndsOn: null,
      balance: 0,
    })
  }
  return extra.length > 0 ? [...debts, ...extra] : debts
}

export function defaultDebtPlan(): DebtPlanState {
  return {
    monthlyBudget: defaultMonthlyDebtBudget,
    snowballDebtId: defaultSnowballDebtId,
    strategy: 'avalanche',
    customOrder: [],
    recurringCharges: {},
    chargesByMonth: {},
    interestByMonth: {},
    paymentsByMonth: {},
    loggedMonths: [],
    loggedHistory: {},
    planStartMonth: FRESH_PLAN_START,
    affirmLoans: pruneExpiredAffirmLoans(
      seededAffirmLoans.map((loan) => normalizeAffirmLoan({ ...loan })),
    ),
  }
}

/** Debt total payments plus leftover after all expenses (including those payments). */
export function monthlyDebtBudget(
  debts: Debt[],
  expenses: RecurringExpense[],
  monthlyNet: number,
) {
  const remaining = monthlyNet - totalMonthlyExpenses(expenses)
  const payments = debts.reduce(
    (sum, debt) => sum + paymentWithoutCharges(debt),
    0,
  )
  return roundCents(payments + remaining)
}

export function withLiveMonthlyBudget(
  plan: DebtPlanState,
  debts: Debt[],
  expenses: RecurringExpense[],
  monthlyNet: number,
): DebtPlanState {
  if (monthlyNet <= 0.005) return plan
  return {
    ...plan,
    monthlyBudget: monthlyDebtBudget(debts, expenses, monthlyNet),
  }
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseYmd(ymd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month: month - 1, day }
}

export function formatYmd(ymd: string) {
  const parsed = parseYmd(ymd)
  if (!parsed) return ymd
  return new Date(parsed.year, parsed.month, parsed.day).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', year: 'numeric' },
  )
}

export function affirmPaymentDate(startDate: string, ym: string) {
  const started = parseYmd(startDate)
  const month = parseYm(ym)
  if (!started || !month) return null
  const lastDay = new Date(month.year, month.month + 1, 0).getDate()
  const day = Math.min(started.day, lastDay)
  return `${ym}-${String(day).padStart(2, '0')}`
}

export function affirmMonthPaid(
  loan: Pick<AffirmLoan, 'startDate'>,
  ym: string,
  now: Date,
) {
  const current = monthKey(now.getFullYear(), now.getMonth())
  if (ym !== current || !loan.startDate) return false
  const due = affirmPaymentDate(loan.startDate, ym)
  return due != null && due <= dateKey(now)
}

/** Days until the next due day, wrapping from today (0 = due today). */
export function affirmDueSortKey(startDate: string | undefined, now: Date) {
  if (!startDate) return 1000
  const started = parseYmd(startDate)
  if (!started) return 1000
  const today = now.getDate()
  const lastThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayThisMonth = Math.min(started.day, lastThisMonth)
  if (dayThisMonth >= today) return dayThisMonth - today
  const lastNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()
  const dayNext = Math.min(started.day, lastNextMonth)
  return lastThisMonth - today + dayNext
}

/** Today, tomorrow, next day… Loans with no starting date go last. */
export function sortAffirmLoansByDue(loans: AffirmLoan[], now: Date) {
  return [...loans].sort((left, right) => {
    const byDue =
      affirmDueSortKey(left.startDate, now) -
      affirmDueSortKey(right.startDate, now)
    if (byDue !== 0) return byDue
    const byName = left.name.localeCompare(right.name)
    if (byName !== 0) return byName
    return left.loanId.localeCompare(right.loanId)
  })
}

export function ymIndex(year: number, month: number) {
  return year * 12 + month
}

export function isMonthLogged(plan: DebtPlanState, year: number, month: number) {
  return (plan.loggedMonths ?? []).includes(monthKey(year, month))
}

function lastSeededHistoryIndex() {
  const last = seededDebtHistory[seededDebtHistory.length - 1]
  if (!last) return Number.NEGATIVE_INFINITY
  return ymIndex(last.year, last.month)
}

/** Earliest unlogged month at or before now, after seeded history. */
export function firstUnloggedPlannerMonth(plan: DebtPlanState, now: Date) {
  const nowIdx = ymIndex(now.getFullYear(), now.getMonth())
  const logged = new Set(plan.loggedMonths ?? [])
  let idx = lastSeededHistoryIndex() + 1
  if (!Number.isFinite(idx)) {
    const start = parseYm(plan.planStartMonth || FRESH_PLAN_START)
    idx = start ? ymIndex(start.year, start.month) : nowIdx
  }
  if (idx > nowIdx) idx = nowIdx
  while (idx < nowIdx) {
    const year = Math.floor(idx / 12)
    const month = idx % 12
    if (!logged.has(monthKey(year, month))) break
    idx += 1
  }
  if (idx > nowIdx) idx = nowIdx
  return { year: Math.floor(idx / 12), month: idx % 12 }
}

export function chargedForDebt(
  plan: DebtPlanState,
  debtId: string,
  year: number,
  month: number,
  expenses: RecurringExpense[] = [],
) {
  const override = plan.chargesByMonth[monthKey(year, month)]?.[debtId]
  if (typeof override === 'number' && Number.isFinite(override)) {
    return roundCents(override)
  }
  return chargesForDebt(expenses, { id: debtId })
}

export function parseDebtPlan(value: unknown): DebtPlanState | null {
  if (value == null || typeof value !== 'object') return null
  const fallback = defaultDebtPlan()
  const item = value as Partial<DebtPlanState>
  const snowballDebtId =
    typeof item.snowballDebtId === 'string' && item.snowballDebtId
      ? item.snowballDebtId
      : fallback.snowballDebtId
  const customOrder = normalizeIdList(item.customOrder)
  const hasLogging = Array.isArray(item.loggedMonths)
  return {
    monthlyBudget:
      typeof item.monthlyBudget === 'number' && Number.isFinite(item.monthlyBudget)
        ? item.monthlyBudget
        : fallback.monthlyBudget,
    snowballDebtId,
    strategy: isPayoffStrategy(item.strategy) ? item.strategy : fallback.strategy,
    customOrder:
      customOrder.length > 0
        ? customOrder
        : snowballDebtId
          ? [snowballDebtId]
          : fallback.customOrder,
    recurringCharges:
      item.recurringCharges && typeof item.recurringCharges === 'object'
        ? { ...item.recurringCharges }
        : {},
    chargesByMonth: normalizeChargesByMonth(item.chargesByMonth),
    interestByMonth: normalizeChargesByMonth(item.interestByMonth),
    paymentsByMonth: hasLogging
      ? normalizeChargesByMonth(item.paymentsByMonth)
      : {},
    loggedMonths: hasLogging ? normalizeLoggedMonths(item.loggedMonths) : [],
    loggedHistory: hasLogging
      ? normalizeLoggedHistory(item.loggedHistory)
      : {},
    planStartMonth:
      typeof item.planStartMonth === 'string' && parseYm(item.planStartMonth)
        ? item.planStartMonth
        : FRESH_PLAN_START,
    affirmLoans: pruneExpiredAffirmLoans(
      Array.isArray(item.affirmLoans) && item.affirmLoans.length > 0
        ? withSeededStartDates(
            item.affirmLoans.filter(isAffirmLoan).map(normalizeAffirmLoan),
          )
        : fallback.affirmLoans,
    ),
  }
}

export function markPlanMigrationsApplied() {
  localStorage.setItem(PLAN_HISTORY_RESET, '1')
  localStorage.setItem(UNLOG_AUGUST_2026, '1')
}

export function loadDebtPlan(): DebtPlanState {
  const fallback = defaultDebtPlan()
  try {
    const raw = localStorage.getItem(PLAN_KEY)
    if (!raw) {
      markPlanMigrationsApplied()
      return fallback
    }
    const loaded = parseDebtPlan(JSON.parse(raw))
    if (!loaded) return fallback
    if (!localStorage.getItem(PLAN_HISTORY_RESET)) {
      markPlanMigrationsApplied()
      loaded.loggedMonths = []
      loaded.loggedHistory = {}
      loaded.paymentsByMonth = {}
      loaded.chargesByMonth = {}
      loaded.interestByMonth = {}
      saveDebtPlan(loaded)
    }
    if (!localStorage.getItem(UNLOG_AUGUST_2026)) {
      localStorage.setItem(UNLOG_AUGUST_2026, '1')
      const next = unlogPlannerMonth(loaded, 2026, 7)
      if (next !== loaded) {
        saveDebtPlan(next)
        return next
      }
    }
    return loaded
  } catch {
    return fallback
  }
}

/** Affirm rolls a leftover of this size into the previous payment. */
const AFFIRM_LEFTOVER_FOLD = 0.1

export function saveDebtPlan(state: DebtPlanState) {
  const next = {
    ...state,
    affirmLoans: pruneExpiredAffirmLoans(state.affirmLoans),
  }
  localStorage.setItem(PLAN_KEY, JSON.stringify(next))
}

function normalizeAffirmLoan(loan: AffirmLoan): AffirmLoan {
  const startDate =
    typeof loan.startDate === 'string' && parseYmd(loan.startDate)
      ? loan.startDate
      : undefined
  const startMonth = loan.startMonth || (startDate ? startDate.slice(0, 7) : '')
  const months = affirmPaymentMonths(startMonth, loan.startingBalance, loan.monthly)
  const leftover = roundCents(
    loan.startingBalance - loan.monthly * Math.max(0, months.length),
  )
  const folded = leftover > 0 && leftover <= AFFIRM_LEFTOVER_FOLD
  const lastPayment = folded
    ? (months[months.length - 1] ?? loan.lastPayment)
    : loan.lastPayment
  const remaining =
    folded && loan.remaining > 0.005 && loan.remaining <= AFFIRM_LEFTOVER_FOLD
      ? 0
      : loan.remaining
  return {
    ...loan,
    name: loan.name.trim() || 'Amazon',
    startDate,
    startMonth,
    lastPayment,
    remaining,
  }
}

/** Fill a missing starting day from seed so stored plans pick up screenshot matches. */
function withSeededStartDates(loans: AffirmLoan[]): AffirmLoan[] {
  const seededById = new Map(seededAffirmLoans.map((loan) => [loan.id, loan]))
  return loans.map((loan) => {
    if (loan.startDate) return loan
    const seeded = seededById.get(loan.id)
    if (!seeded?.startDate) return loan
    return { ...loan, startDate: seeded.startDate }
  })
}

function isAffirmLoan(value: unknown): value is AffirmLoan {
  if (value == null || typeof value !== 'object') return false
  const item = value as Partial<AffirmLoan>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.monthly === 'number' &&
    typeof item.remaining === 'number'
  )
}

function normalizeChargesByMonth(value: unknown) {
  if (value == null || typeof value !== 'object') return {}
  const next: Record<string, Record<string, number>> = {}
  for (const [key, charges] of Object.entries(value as Record<string, unknown>)) {
    if (charges == null || typeof charges !== 'object') continue
    const month: Record<string, number> = {}
    for (const [debtId, amount] of Object.entries(
      charges as Record<string, unknown>,
    )) {
      if (typeof amount === 'number' && Number.isFinite(amount)) {
        month[debtId] = roundCents(amount)
      }
    }
    if (Object.keys(month).length > 0) next[key] = month
  }
  return next
}

function isPayoffStrategy(value: unknown): value is PayoffStrategy {
  return PAYOFF_STRATEGIES.some((item) => item.id === value)
}

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function normalizeLoggedMonths(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter(
    (key): key is string => typeof key === 'string' && /^\d{4}-\d{2}$/.test(key),
  )
}

function normalizeLoggedHistory(value: unknown) {
  if (value == null || typeof value !== 'object') return {}
  const next: Record<string, PlannerMonth> = {}
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    const month = asLoggedMonth(row)
    if (month) next[key] = month
  }
  return next
}

function asLoggedMonth(value: unknown): PlannerMonth | null {
  if (value == null || typeof value !== 'object') return null
  const row = value as Partial<PlannerMonth>
  if (typeof row.year !== 'number' || typeof row.month !== 'number') return null
  if (!Array.isArray(row.lines)) return null
  const lines = row.lines.flatMap((line) => {
    if (line == null || typeof line !== 'object') return []
    const item = line as Partial<PlannerLine>
    if (typeof item.debtId !== 'string') return []
    return [
      {
        debtId: item.debtId,
        start: numberOrZero(item.start),
        interest: numberOrZero(item.interest),
        charged: numberOrZero(item.charged),
        paid: numberOrZero(item.paid),
        extra: numberOrZero(item.extra),
        balance: numberOrZero(item.balance),
      },
    ]
  })
  return {
    year: row.year,
    month: row.month,
    source: 'history',
    lines,
    totalInterest: numberOrZero(row.totalInterest),
    totalPaid: numberOrZero(row.totalPaid),
    extraPaid: numberOrZero(row.extraPaid),
    remainingTotal: numberOrZero(row.remainingTotal),
  }
}

function numberOrZero(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function strategyLabel(strategy: PayoffStrategy) {
  return PAYOFF_STRATEGIES.find((item) => item.id === strategy)?.label ?? 'Avalanche'
}

export function resolveCustomOrder(debtIds: string[], order: string[]) {
  const known = new Set(debtIds)
  const kept = order.filter((id) => known.has(id))
  const missing = debtIds.filter((id) => !kept.includes(id))
  return [...kept, ...missing]
}

/** Stable 1st-to-last extra-payment order. Highest interest is re-ranked each month. */
export function strategyDebtOrder(
  debts: Debt[],
  plan: DebtPlanState,
  now = new Date(),
) {
  if (plan.strategy === 'highest-interest') return [...debts]
  const startBalances = new Map(debts.map((debt) => [debt.id, debt.balance]))
  const year = now.getFullYear()
  const month = now.getMonth()
  const interestById = new Map(
    debts.map((debt) => [
      debt.id,
      roundCents((debt.balance * (effectiveApr(debt, year, month) / 100)) / 12),
    ]),
  )
  return extraPaymentOrder(debts, plan, startBalances, interestById)
}

export function paymentOverride(
  plan: DebtPlanState,
  debtId: string,
  year: number,
  month: number,
) {
  const value = plan.paymentsByMonth[monthKey(year, month)]?.[debtId]
  if (typeof value === 'number' && Number.isFinite(value)) return roundCents(value)
  return undefined
}

export function chargeOverride(
  plan: DebtPlanState,
  debtId: string,
  year: number,
  month: number,
) {
  const value = plan.chargesByMonth[monthKey(year, month)]?.[debtId]
  if (typeof value === 'number' && Number.isFinite(value)) return roundCents(value)
  return undefined
}

export function interestOverride(
  plan: DebtPlanState,
  debtId: string,
  year: number,
  month: number,
) {
  const value = plan.interestByMonth?.[monthKey(year, month)]?.[debtId]
  if (typeof value === 'number' && Number.isFinite(value)) return roundCents(value)
  return undefined
}

export function setMonthCharge(
  plan: DebtPlanState,
  year: number,
  month: number,
  debtId: string,
  amount: number | null,
): DebtPlanState {
  const key = monthKey(year, month)
  const monthCharges = { ...plan.chargesByMonth[key] }
  if (amount == null) {
    delete monthCharges[debtId]
  } else {
    monthCharges[debtId] = roundCents(Math.max(0, amount))
  }
  const chargesByMonth = { ...plan.chargesByMonth }
  if (Object.keys(monthCharges).length === 0) {
    delete chargesByMonth[key]
  } else {
    chargesByMonth[key] = monthCharges
  }
  return { ...plan, chargesByMonth }
}

export function setMonthInterest(
  plan: DebtPlanState,
  year: number,
  month: number,
  debtId: string,
  amount: number | null,
): DebtPlanState {
  const key = monthKey(year, month)
  const monthInterest = { ...plan.interestByMonth?.[key] }
  if (amount == null) {
    delete monthInterest[debtId]
  } else {
    monthInterest[debtId] = roundCents(Math.max(0, amount))
  }
  const interestByMonth = { ...plan.interestByMonth }
  if (Object.keys(monthInterest).length === 0) {
    delete interestByMonth[key]
  } else {
    interestByMonth[key] = monthInterest
  }
  return { ...plan, interestByMonth }
}

export function setMonthPayment(
  plan: DebtPlanState,
  year: number,
  month: number,
  debtId: string,
  amount: number | null,
): DebtPlanState {
  const key = monthKey(year, month)
  const monthPayments = { ...plan.paymentsByMonth[key] }
  if (amount == null) {
    delete monthPayments[debtId]
  } else {
    monthPayments[debtId] = roundCents(Math.max(0, amount))
  }
  const paymentsByMonth = { ...plan.paymentsByMonth }
  if (Object.keys(monthPayments).length === 0) {
    delete paymentsByMonth[key]
  } else {
    paymentsByMonth[key] = monthPayments
  }
  return { ...plan, paymentsByMonth }
}

export function logPlannerMonth(
  plan: DebtPlanState,
  row: PlannerMonth,
  paidOverrides?: Record<string, number | null>,
): DebtPlanState {
  const key = monthKey(row.year, row.month)
  let next = plan
  if (paidOverrides) {
    for (const [debtId, amount] of Object.entries(paidOverrides)) {
      next = setMonthPayment(next, row.year, row.month, debtId, amount)
    }
  }
  const snapshot = snapshotLoggedMonth(row, paidOverrides)
  const currentLogged = next.loggedMonths ?? []
  const loggedMonths = currentLogged.includes(key)
    ? currentLogged
    : [...currentLogged, key]
  return {
    ...next,
    loggedMonths,
    loggedHistory: { ...(next.loggedHistory ?? {}), [key]: snapshot },
  }
}

export function unlogPlannerMonth(
  plan: DebtPlanState,
  year: number,
  month: number,
): DebtPlanState {
  const key = monthKey(year, month)
  const loggedMonths = (plan.loggedMonths ?? []).filter((item) => item !== key)
  if (loggedMonths.length === (plan.loggedMonths ?? []).length) return plan
  const loggedHistory = { ...(plan.loggedHistory ?? {}) }
  delete loggedHistory[key]
  return { ...plan, loggedMonths, loggedHistory }
}

export type PlannerValueField = 'interest' | 'charged' | 'paid'

function rewritePlannerLine(
  line: PlannerLine,
  field: PlannerValueField,
  amount: number | null,
): PlannerLine {
  const nextValue = amount == null ? 0 : roundCents(Math.max(0, amount))
  const interest = field === 'interest' ? nextValue : line.interest
  const charged = field === 'charged' ? nextValue : line.charged
  const paidRaw = field === 'paid' ? nextValue : line.paid
  const due = roundCents(line.start + interest + charged)
  const paid = roundCents(Math.min(paidRaw, Math.max(0, due)))
  const scheduled = Math.max(0, roundCents(line.paid - line.extra))
  return {
    ...line,
    interest,
    charged,
    paid,
    extra: extraPaidOnLine(paid, scheduled, due),
    balance: roundCents(Math.max(0, due - paid)),
  }
}

export function monthWithLineValue(
  row: PlannerMonth,
  debtId: string,
  field: PlannerValueField,
  amount: number | null,
): PlannerMonth {
  const lines = row.lines.map((line) =>
    line.debtId === debtId ? rewritePlannerLine(line, field, amount) : line,
  )
  return {
    ...row,
    lines,
    totalInterest: roundCents(lines.reduce((sum, line) => sum + line.interest, 0)),
    totalPaid: roundCents(lines.reduce((sum, line) => sum + line.paid, 0)),
    extraPaid: roundCents(lines.reduce((sum, line) => sum + line.extra, 0)),
    remainingTotal: roundCents(
      lines.reduce((sum, line) => sum + line.balance, 0),
    ),
  }
}

export function applyPlannerMonthValue(
  plan: DebtPlanState,
  year: number,
  month: number,
  debtId: string,
  field: PlannerValueField,
  amount: number | null,
): DebtPlanState {
  let next = plan
  if (field === 'interest') {
    next = setMonthInterest(next, year, month, debtId, amount)
  } else if (field === 'charged') {
    next = setMonthCharge(next, year, month, debtId, amount)
  } else {
    next = setMonthPayment(next, year, month, debtId, amount)
  }
  const key = monthKey(year, month)
  const snap = next.loggedHistory?.[key]
  if (!snap) return next
  const updated = monthWithLineValue(snap, debtId, field, amount)
  return {
    ...next,
    loggedHistory: {
      ...(next.loggedHistory ?? {}),
      [key]: { ...updated, source: 'history' },
    },
  }
}

function snapshotLoggedMonth(
  row: PlannerMonth,
  paidOverrides?: Record<string, number | null>,
): PlannerMonth {
  const lines = row.lines.map((line) => {
    if (!paidOverrides || !Object.prototype.hasOwnProperty.call(paidOverrides, line.debtId)) {
      return { ...line }
    }
    const override = paidOverrides[line.debtId]
    const due = roundCents(line.start + line.interest + line.charged)
    const paid =
      override == null
        ? line.paid
        : roundCents(Math.min(Math.max(0, override), Math.max(0, due)))
    const scheduled = Math.max(0, roundCents(line.paid - line.extra))
    return {
      ...line,
      paid,
      extra: extraPaidOnLine(paid, scheduled, due),
      balance: roundCents(Math.max(0, due - paid)),
    }
  })
  return {
    year: row.year,
    month: row.month,
    source: 'history',
    lines,
    totalInterest: row.totalInterest,
    totalPaid: roundCents(lines.reduce((sum, line) => sum + line.paid, 0)),
    extraPaid: roundCents(lines.reduce((sum, line) => sum + line.extra, 0)),
    remainingTotal: roundCents(
      lines.reduce((sum, line) => sum + line.balance, 0),
    ),
  }
}

function extraPaymentOrder(
  owing: Debt[],
  plan: DebtPlanState,
  startBalances: Map<string, number>,
  interestById: Map<string, number>,
) {
  const copy = [...owing]
  if (plan.strategy === 'snowball') {
    return copy.sort((a, b) => {
      const byBalance =
        (startBalances.get(a.id) ?? 0) - (startBalances.get(b.id) ?? 0)
      return byBalance !== 0 ? byBalance : b.apr - a.apr
    })
  }
  if (plan.strategy === 'custom') {
    const order = resolveCustomOrder(
      owing.map((debt) => debt.id),
      plan.customOrder,
    )
    return copy.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  }
  if (plan.strategy === 'highest-interest') {
    return copy.sort((a, b) => {
      const byInterest =
        (interestById.get(b.id) ?? 0) - (interestById.get(a.id) ?? 0)
      return byInterest !== 0 ? byInterest : b.apr - a.apr
    })
  }
  return copy.sort((a, b) => {
    const byApr = b.apr - a.apr
    return byApr !== 0 ? byApr : (startBalances.get(b.id) ?? 0) - (startBalances.get(a.id) ?? 0)
  })
}

function extraPaidOnLine(paid: number, minimum: number, balanceBeforePay: number) {
  const minDue = Math.min(minimum, Math.max(0, balanceBeforePay))
  return roundCents(Math.max(0, paid - minDue))
}

/** Leftover paycheck plus any unused scheduled payments, including Affirm. */
function extraPool(
  plan: DebtPlanState,
  debts: Debt[],
  payments: Map<string, number>,
  locked: Map<string, number>,
) {
  let needed = 0
  for (const debt of debts) {
    needed += locked.get(debt.id) ?? payments.get(debt.id) ?? 0
  }
  return roundCents(Math.max(0, plan.monthlyBudget - roundCents(needed)))
}

function remainingAfterPayments(
  dueThisMonth: number,
  monthlyRate: number,
  months: number,
  payment: number,
  monthlyCharge: number,
) {
  let balance = Math.max(0, roundCents(dueThisMonth - payment))
  for (let step = 1; step < months; step++) {
    balance = roundCents(balance * (1 + monthlyRate) + monthlyCharge)
    balance = Math.max(0, roundCents(balance - payment))
  }
  return balance
}

/** Constant monthly payment that clears `dueThisMonth` by month K (inclusive). */
function paymentToClear(
  dueThisMonth: number,
  monthlyRate: number,
  months: number,
  monthlyCharge: number,
) {
  if (dueThisMonth <= 0.005) return 0
  if (months <= 1) return roundCents(dueThisMonth)
  let lo = 0
  let hi = dueThisMonth + monthlyCharge * months + 1
  for (let step = 0; step < 48; step++) {
    const mid = (lo + hi) / 2
    if (
      remainingAfterPayments(
        dueThisMonth,
        monthlyRate,
        months,
        mid,
        monthlyCharge,
      ) > 0.005
    ) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return roundCents(hi)
}

function scheduledPayment(
  debt: Debt,
  plan: DebtPlanState,
  year: number,
  month: number,
  charged = 0,
) {
  const base =
    debt.id === AFFIRM_DEBT_ID
      ? affirmMonthTotal(plan.affirmLoans, monthKey(year, month))
      : paymentWithoutCharges(debt)
  return roundCents(base + Math.max(0, charged))
}

function historyMonth(
  debts: Debt[],
  row: SeededHistoryMonth,
  previous: Map<string, number>,
): PlannerMonth {
  const mins = new Map(debts.map((debt) => [debt.id, paymentWithoutCharges(debt)]))
  const lines: PlannerLine[] = debts.map((debt) => {
    const tracked =
      Object.prototype.hasOwnProperty.call(row.paid, debt.id) ||
      Object.prototype.hasOwnProperty.call(row.balance, debt.id)
    if (!tracked) {
      const start = previous.get(debt.id) ?? 0
      return {
        debtId: debt.id,
        start,
        interest: 0,
        charged: 0,
        paid: 0,
        extra: 0,
        balance: start,
      }
    }
    const paid = row.paid[debt.id] ?? 0
    const interest = row.interest[debt.id] ?? 0
    const charged = row.charged[debt.id] ?? 0
    const balance = row.balance[debt.id] ?? 0
    const start =
      previous.get(debt.id) ?? roundCents(balance + paid - interest - charged)
    return {
      debtId: debt.id,
      start,
      interest,
      charged,
      paid,
      extra: extraPaidOnLine(paid, mins.get(debt.id) ?? 0, start + interest + charged),
      balance,
    }
  })
  return {
    year: row.year,
    month: row.month,
    source: 'history',
    lines,
    totalInterest: row.totalInterest,
    totalPaid: row.totalPaid,
    extraPaid: roundCents(lines.reduce((sum, line) => sum + line.extra, 0)),
    remainingTotal: roundCents(lines.reduce((sum, line) => sum + line.balance, 0)),
  }
}

export function projectDebtPlan(
  debts: Debt[],
  plan: DebtPlanState,
  expenses: RecurringExpense[] = [],
  monthsAhead = 18,
  now = new Date(),
): PlannerMonth[] {
  const previous = new Map<string, number>(
    Object.entries(seededHistoryOpening).map(([id, amount]) => [
      id,
      roundCents(amount),
    ]),
  )
  const history = seededDebtHistory.map((row) => {
    const month = historyMonth(debts, row, previous)
    for (const line of month.lines) previous.set(line.debtId, line.balance)
    return month
  })
  const balances = new Map(debts.map((debt) => [debt.id, debt.balance]))
  const ranked = strategyDebtOrder(debts, plan)
  const projected: PlannerMonth[] = []
  const startAt = firstUnloggedPlannerMonth(plan, now)
  const nowIdx = ymIndex(now.getFullYear(), now.getMonth())
  let year = startAt.year
  let month = startAt.month

  for (let step = 0; step < monthsAhead; step++) {
    const monthIdx = ymIndex(year, month)
    const lines: PlannerLine[] = []
    const owing = debts.filter((debt) => (balances.get(debt.id) ?? 0) > 0.005)
    const afterInterest = new Map<string, number>()
    let totalInterest = 0

    for (const debt of debts) {
      const start = balances.get(debt.id) ?? 0
      if (start <= 0.005) {
        balances.set(debt.id, 0)
        afterInterest.set(debt.id, 0)
        lines.push({
          debtId: debt.id,
          start: 0,
          interest: 0,
          charged: 0,
          paid: 0,
          extra: 0,
          balance: 0,
        })
        continue
      }
      const charged = chargedForDebt(plan, debt.id, year, month, expenses)
      const interest =
        interestOverride(plan, debt.id, year, month) ??
        roundCents((start * (effectiveApr(debt, year, month) / 100)) / 12)
      totalInterest += interest
      afterInterest.set(debt.id, roundCents(start + interest + charged))
      lines.push({
        debtId: debt.id,
        start,
        interest,
        charged,
        paid: 0,
        extra: 0,
        balance: 0,
      })
    }

    const locked = new Map<string, number>()
    let lockedTotal = 0
    for (const debt of owing) {
      const override = paymentOverride(plan, debt.id, year, month)
      if (override == null) continue
      const due = afterInterest.get(debt.id) ?? 0
      const paid = roundCents(Math.min(Math.max(0, override), due))
      locked.set(debt.id, paid)
      lockedTotal += paid
    }

    const payments = new Map<string, number>()
    let allocated = 0
    for (const debt of owing) {
      if (locked.has(debt.id)) continue
      const due = afterInterest.get(debt.id) ?? 0
      const charged = lines.find((line) => line.debtId === debt.id)?.charged ?? 0
      const minPay = roundCents(
        Math.min(scheduledPayment(debt, plan, year, month, charged), due),
      )
      payments.set(debt.id, minPay)
      allocated += minPay
    }

    const applyExtra = monthIdx >= nowIdx && locked.size === 0
    let leftover = applyExtra ? extraPool(plan, debts, payments, locked) : 0
    const owingIds = new Set(owing.map((debt) => debt.id))
    const unlocked = owing.filter(
      (debt) => !locked.has(debt.id) && debt.id !== AFFIRM_DEBT_ID,
    )
    const promoQueue = unlocked
      .filter((debt) => monthsUntilPromoEnd(debt, year, month) != null)
      .sort((a, b) => {
        const left = monthsUntilPromoEnd(a, year, month) ?? 0
        const right = monthsUntilPromoEnd(b, year, month) ?? 0
        if (left !== right) return left - right
        return (afterInterest.get(a.id) ?? 0) - (afterInterest.get(b.id) ?? 0)
      })
    for (const debt of promoQueue) {
      if (leftover <= 0) break
      const due = afterInterest.get(debt.id) ?? 0
      const already = payments.get(debt.id) ?? 0
      const monthsLeft = monthsUntilPromoEnd(debt, year, month) ?? 1
      const rate = effectiveApr(debt, year, month) / 100 / 12
      const charge = chargesForDebt(expenses, { id: debt.id })
      const need = paymentToClear(due, rate, monthsLeft, charge)
      const add = roundCents(
        Math.min(leftover, Math.max(0, need - already), Math.max(0, due - already)),
      )
      if (add <= 0) continue
      payments.set(debt.id, roundCents(already + add))
      leftover = roundCents(leftover - add)
    }
    const waterfall =
      plan.strategy === 'highest-interest'
        ? extraPaymentOrder(
            unlocked,
            plan,
            balances,
            new Map(lines.map((line) => [line.debtId, line.interest])),
          )
        : ranked.filter(
            (debt) =>
              owingIds.has(debt.id) &&
              !locked.has(debt.id) &&
              debt.id !== AFFIRM_DEBT_ID,
          )
    for (const debt of waterfall) {
      if (leftover <= 0) break
      const due = afterInterest.get(debt.id) ?? 0
      const already = payments.get(debt.id) ?? 0
      const add = roundCents(Math.min(leftover, Math.max(0, due - already)))
      payments.set(debt.id, roundCents(already + add))
      leftover = roundCents(leftover - add)
    }
    const affirm = owing.find(
      (debt) => debt.id === AFFIRM_DEBT_ID && !locked.has(debt.id),
    )
    if (affirm && leftover > 0) {
      const due = afterInterest.get(affirm.id) ?? 0
      const already = payments.get(affirm.id) ?? 0
      const add = roundCents(Math.min(leftover, Math.max(0, due - already)))
      if (add > 0) {
        payments.set(affirm.id, roundCents(already + add))
        leftover = roundCents(leftover - add)
      }
    }

    for (const line of lines) {
      const due = afterInterest.get(line.debtId) ?? 0
      const paid = Math.min(
        locked.get(line.debtId) ?? payments.get(line.debtId) ?? 0,
        due,
      )
      const debt = debts.find((item) => item.id === line.debtId)
      line.paid = paid
      line.extra = extraPaidOnLine(
        paid,
        debt ? scheduledPayment(debt, plan, year, month, line.charged) : 0,
        due,
      )
      line.balance = roundCents(Math.max(0, due - paid))
      // Unlogged past months are editable sheets. They must not rewrite
      // this month's live balances or the months that follow.
      if (monthIdx >= nowIdx) {
        balances.set(line.debtId, line.balance)
      }
    }

    projected.push({
      year,
      month,
      source: 'plan',
      lines,
      totalInterest: roundCents(totalInterest),
      totalPaid: roundCents(lines.reduce((sum, line) => sum + line.paid, 0)),
      extraPaid: roundCents(lines.reduce((sum, line) => sum + line.extra, 0)),
      remainingTotal: roundCents(lines.reduce((sum, line) => sum + line.balance, 0)),
    })

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  return [...history, ...projected]
}

export function yearToDateInterest(
  months: PlannerMonth[],
  year: number,
  throughMonth: number,
) {
  return roundCents(
    months
      .filter((row) => row.year === year && row.month <= throughMonth)
      .reduce((sum, row) => sum + row.totalInterest, 0),
  )
}

export function yearToDateExtra(months: PlannerMonth[], year: number, throughMonth: number) {
  return roundCents(
    months
      .filter((row) => row.year === year && row.month <= throughMonth)
      .reduce((sum, row) => sum + row.extraPaid, 0),
  )
}

export function payoffMonth(months: PlannerMonth[], debtId: string) {
  const owed = months.filter((row) => {
    const line = row.lines.find((item) => item.debtId === debtId)
    return line != null && line.balance > 0.005
  })
  if (owed.length === 0) return null
  const lastOwed = owed[owed.length - 1]
  const index = months.indexOf(lastOwed)
  if (index === months.length - 1) return null
  return months[index + 1] ?? null
}

/** Remaining after this month's planned payment — the plan table End row. */
export function plannedCurrentBalances(
  debts: Debt[],
  plan: DebtPlanState,
  expenses: RecurringExpense[],
  now = new Date(),
) {
  const months = projectDebtPlan(debts, plan, expenses, 1, now)
  const row =
    months.find(
      (item) =>
        item.source === 'plan' &&
        item.year === now.getFullYear() &&
        item.month === now.getMonth(),
    ) ?? months.find((item) => item.source === 'plan')
  return new Map(
    debts.map((debt) => {
      const line = row?.lines.find((item) => item.debtId === debt.id)
      return [debt.id, line?.balance ?? debt.balance] as const
    }),
  )
}

/** Earliest planned payoff first. Debts outside the horizon stay last. */
export function sortDebtsByPayoff<T extends { id: string; balance: number }>(
  debts: T[],
  months: PlannerMonth[],
) {
  const rank = new Map(
    debts.map((debt, index) => {
      if (debt.balance <= 0.005) return [debt.id, { when: -1, index }] as const
      const last = payoffMonth(months, debt.id)
      const when = last ? last.year * 12 + last.month : Number.POSITIVE_INFINITY
      return [debt.id, { when, index }] as const
    }),
  )
  return [...debts].sort((a, b) => {
    const left = rank.get(a.id)
    const right = rank.get(b.id)
    if (!left || !right) return 0
    if (left.when !== right.when) return left.when - right.when
    return left.index - right.index
  })
}

export function formatYearMonth(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

export function debtFreeLabel(months: PlannerMonth[], horizonYears = 10) {
  const planned = months.filter((row) => row.source === 'plan')
  if (planned.length === 0) return '—'
  const starting = planned[0].lines.reduce((sum, line) => sum + line.start, 0)
  if (starting <= 0.005) return 'Paid off'
  const clear = planned.find((row) => row.remainingTotal <= 0.005)
  if (!clear) return `After ${horizonYears} yr`
  return formatYearMonth(clear.year, clear.month)
}

export function plannedThroughPayoff(months: PlannerMonth[]) {
  const planned = months.filter((row) => row.source === 'plan')
  const paidOffAt = planned.findIndex((row) => row.remainingTotal <= 0.005)
  if (paidOffAt === -1) return planned
  return planned.slice(0, paidOffAt + 1)
}

export function plannerRows(
  months: PlannerMonth[],
  plan: DebtPlanState,
  _now?: Date,
) {
  const logged = new Set(plan.loggedMonths ?? [])
  return plannedThroughPayoff(months).filter(
    (row) => !logged.has(monthKey(row.year, row.month)),
  )
}

/** Hide a debt from the planner after its last payment month has passed. */
export function plannerVisibleDebts<T extends { id: string }>(
  debts: T[],
  months: PlannerMonth[],
) {
  return debts.filter((debt) =>
    months.some((row) => {
      const line = row.lines.find((item) => item.debtId === debt.id)
      if (!line) return false
      return line.paid > 0.005 || line.start > 0.005 || line.balance > 0.005
    }),
  )
}

export function historyVisibleDebts<T extends { id: string }>(
  debts: T[],
  months: PlannerMonth[],
) {
  const byId = new Map(debts.map((debt) => [debt.id, debt]))
  const ordered: T[] = []
  for (const meta of seededHistoryDebts) {
    const debt = byId.get(meta.id)
    if (debt) ordered.push(debt)
  }
  for (const debt of debts) {
    if (!ordered.some((item) => item.id === debt.id)) ordered.push(debt)
  }
  return ordered.filter((debt) =>
    months.some((row) => {
      const line = row.lines.find((item) => item.debtId === debt.id)
      if (!line) return false
      return (
        line.paid > 0.005 ||
        line.start > 0.005 ||
        line.balance > 0.005 ||
        line.interest > 0.005 ||
        Math.abs(line.charged) > 0.005
      )
    }),
  )
}

export function historyRows(
  months: PlannerMonth[],
  plan: DebtPlanState,
  _now?: Date,
) {
  const seeded = months.filter((row) => row.source === 'history')
  const logged = Object.values(plan.loggedHistory ?? {}).sort(
    (a, b) => ymIndex(a.year, a.month) - ymIndex(b.year, b.month),
  )
  return [...seeded, ...logged]
}

export const ALL_DEBT_YEARS = 'all'

export type DebtMetricYear = number | typeof ALL_DEBT_YEARS

/** Seeded and logged months through the current month — no planner projections. */
export function actualDebtMetricMonths(
  months: PlannerMonth[],
  plan: DebtPlanState,
  now = new Date(),
) {
  const nowIdx = ymIndex(now.getFullYear(), now.getMonth())
  return historyRows(months, plan, now).filter(
    (row) => ymIndex(row.year, row.month) <= nowIdx,
  )
}

/** All = actuals through this month. A specific year includes that year's plan. */
export function debtMetricMonths(
  months: PlannerMonth[],
  plan: DebtPlanState,
  year: DebtMetricYear,
  now = new Date(),
) {
  if (year === ALL_DEBT_YEARS) return actualDebtMetricMonths(months, plan, now)
  const byKey = new Map<string, PlannerMonth>()
  for (const row of historyRows(months, plan, now)) {
    if (row.year === year) byKey.set(monthKey(row.year, row.month), row)
  }
  for (const row of months) {
    if (row.year !== year) continue
    const key = monthKey(row.year, row.month)
    if (!byKey.has(key)) byKey.set(key, row)
  }
  return [...byKey.values()].sort(
    (a, b) => ymIndex(a.year, a.month) - ymIndex(b.year, b.month),
  )
}

export function plannerMetricYears(months: PlannerMonth[], now = new Date()) {
  const cap = now.getFullYear()
  const years = new Set<number>([cap])
  for (const row of months) {
    if (row.year <= cap) years.add(row.year)
  }
  return [...years].sort((left, right) => right - left)
}

export type YearDebtSummary = {
  startTotal: number
  endTotal: number
  interest: number
  paid: number
  reduced: number
}

export function yearDebtSummary(
  months: PlannerMonth[],
  year: DebtMetricYear,
): YearDebtSummary {
  const rows = months
    .filter((row) => (year === ALL_DEBT_YEARS ? true : row.year === year))
    .sort((a, b) => ymIndex(a.year, a.month) - ymIndex(b.year, b.month))
  const first = rows[0]
  const last = rows[rows.length - 1]
  const startTotal = first
    ? roundCents(first.lines.reduce((sum, line) => sum + line.start, 0))
    : 0
  const endTotal = last ? last.remainingTotal : 0
  const interest = roundCents(
    rows.reduce((sum, row) => sum + row.totalInterest, 0),
  )
  const paid = roundCents(rows.reduce((sum, row) => sum + row.totalPaid, 0))
  return {
    startTotal,
    endTotal,
    interest,
    paid,
    reduced: roundCents(startTotal - endTotal),
  }
}

export function plannedInterest(months: PlannerMonth[]) {
  return roundCents(
    months.reduce((sum, row) => sum + row.totalInterest, 0),
  )
}

export function formatYm(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  if (!year || !month) return ym
  return formatYearMonth(year, month - 1)
}

export function monthsUntilPayoff(remaining: number, monthly: number) {
  if (remaining <= 0.005) return 0
  if (monthly <= 0) return null
  return Math.ceil(remaining / monthly)
}

export function parseYm(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return { year, month: month - 1 }
}

export function monthsBetweenYm(start: string, end: string) {
  const from = parseYm(start)
  const to = parseYm(end)
  if (!from || !to) return []
  let index = ymIndex(from.year, from.month)
  const last = ymIndex(to.year, to.month)
  if (last < index) return []
  const months: string[] = []
  while (index <= last) {
    months.push(monthKey(Math.floor(index / 12), index % 12))
    index += 1
  }
  return months
}

function affirmScheduleCount(startingBalance: number, monthly: number) {
  if (monthly <= 0.005) return 1
  const count = Math.max(
    1,
    Math.ceil((roundCents(startingBalance) - 0.005) / monthly),
  )
  const leftover = roundCents(startingBalance - monthly * (count - 1))
  if (count > 1 && leftover > 0 && leftover <= AFFIRM_LEFTOVER_FOLD) {
    return count - 1
  }
  return count
}

export function affirmPaymentMonths(
  startMonth: string,
  startingBalance: number,
  monthly: number,
) {
  if (monthly <= 0.005) return startMonth ? [startMonth] : []
  const count = affirmScheduleCount(startingBalance, monthly)
  const start = parseYm(startMonth)
  if (!start) return []
  const first = ymIndex(start.year, start.month)
  return Array.from({ length: count }, (_, offset) => {
    const index = first + offset
    return monthKey(Math.floor(index / 12), index % 12)
  })
}

export function completeAffirmLoan(
  input: {
    id?: string
    name: string
    loanId: string
    startDate?: string
    startMonth?: string
    startingBalance: number
    monthly: number
  },
  now: Date,
): AffirmLoan {
  const startDate = input.startDate && parseYmd(input.startDate) ? input.startDate : undefined
  const startMonth = startDate?.slice(0, 7) || input.startMonth || ''
  const startingBalance = roundCents(Math.max(0, input.startingBalance))
  const monthly = roundCents(Math.max(0, input.monthly))
  const months = affirmPaymentMonths(startMonth, startingBalance, monthly)
  const lastPayment = months[months.length - 1] ?? startMonth
  const nowKey = monthKey(now.getFullYear(), now.getMonth())
  let remaining = startingBalance
  if (nowKey >= startMonth && months.length > 0) {
    let through = nowKey < lastPayment ? nowKey : lastPayment
    if (startDate) {
      const due = affirmPaymentDate(startDate, nowKey)
      if (due && due > dateKey(now) && nowKey <= lastPayment) {
        const prevIndex = ymIndex(now.getFullYear(), now.getMonth()) - 1
        const prev = monthKey(Math.floor(prevIndex / 12), prevIndex % 12)
        through = prev >= startMonth ? prev : ''
      }
    }
    if (through && through >= startMonth) {
      if (through >= lastPayment) {
        remaining = 0
      } else {
        const paidMonths = monthsBetweenYm(startMonth, through).length
        remaining = roundCents(Math.max(0, startingBalance - monthly * paidMonths))
      }
    }
  }
  return {
    id: input.id ?? `affirm-${crypto.randomUUID()}`,
    name: input.name.trim() || 'Amazon',
    loanId: input.loanId.trim(),
    startMonth,
    startDate,
    lastPayment,
    startingBalance,
    monthly,
    remaining,
  }
}

export function sortAffirmLoans(loans: AffirmLoan[]) {
  return [...loans].sort((left, right) => {
    if (left.monthly !== right.monthly) return left.monthly - right.monthly
    const byName = left.name.localeCompare(right.name)
    if (byName !== 0) return byName
    return left.loanId.localeCompare(right.loanId)
  })
}

/** Scheduled payment in each month from start through last payment. */
export function affirmLoanPayments(loan: AffirmLoan) {
  const months = monthsBetweenYm(loan.startMonth, loan.lastPayment)
  const payments: Record<string, number> = {}
  if (months.length === 0) return payments
  months.forEach((ym, index) => {
    if (index === months.length - 1) {
      const prior = roundCents(loan.monthly * (months.length - 1))
      payments[ym] = roundCents(Math.max(0, loan.startingBalance - prior))
    } else {
      payments[ym] = roundCents(loan.monthly)
    }
  })
  return payments
}

/** Paid off, and the last-payment month is already over. */
export function affirmLoanIsPastPayoff(loan: AffirmLoan, now: Date) {
  if (loan.remaining > 0.005) return false
  const current = monthKey(now.getFullYear(), now.getMonth())
  return loan.lastPayment < current
}

/** Drop paid-off loans after their last-payment month ends. */
export function pruneExpiredAffirmLoans(
  loans: AffirmLoan[],
  now = new Date(),
) {
  return loans.filter((loan) => !affirmLoanIsPastPayoff(loan, now))
}

/** Still has a payment this month or later. */
export function affirmLoanIsCurrent(loan: AffirmLoan, now: Date) {
  const current = monthKey(now.getFullYear(), now.getMonth())
  return loan.lastPayment >= current
}

export function affirmCurrentLoans(loans: AffirmLoan[], now: Date) {
  return loans.filter((loan) => affirmLoanIsCurrent(loan, now))
}

export function affirmMonthTotal(loans: AffirmLoan[], ym: string) {
  return roundCents(
    loans.reduce((sum, loan) => sum + (affirmLoanPayments(loan)[ym] ?? 0), 0),
  )
}

export function affirmOpenRemaining(loans: AffirmLoan[], now: Date) {
  return roundCents(
    affirmCurrentLoans(loans, now).reduce((sum, loan) => sum + loan.remaining, 0),
  )
}

export function affirmDebtFromLoans(loans: AffirmLoan[], now = new Date()) {
  const current = affirmCurrentLoans(loans, now)
  return {
    balance: affirmOpenRemaining(loans, now),
    minimum: affirmMonthTotal(
      current,
      monthKey(now.getFullYear(), now.getMonth()),
    ),
    extraPayment: 0,
    apr: 0,
  }
}

export function debtsWithAffirmPlan(
  debts: Debt[],
  loans: AffirmLoan[],
  now = new Date(),
) {
  const fields = affirmDebtFromLoans(loans, now)
  return debts.map((debt) =>
    debt.id === AFFIRM_DEBT_ID ? { ...debt, ...fields } : debt,
  )
}

export function affirmVisibleMonths(loans: AffirmLoan[], now: Date) {
  const start = monthKey(now.getFullYear(), now.getMonth())
  let end = start
  for (const loan of loans) {
    if (loan.lastPayment > end) end = loan.lastPayment
  }
  return monthsBetweenYm(start, end)
}

export function affirmTotals(loans: AffirmLoan[]) {
  const active = loans.filter((loan) => loan.remaining > 0.005)
  return {
    count: loans.length,
    active: active.length,
    monthly: roundCents(active.reduce((sum, loan) => sum + loan.monthly, 0)),
    remaining: roundCents(active.reduce((sum, loan) => sum + loan.remaining, 0)),
  }
}
