import { type Debt } from '@/lib/budget'
import {
  defaultMonthlyDebtBudget,
  defaultSnowballDebtId,
  seededAffirmLoans,
  seededAmazonDebt,
  seededDebtBalances,
  seededDebtHistory,
  seededRecurringCharges,
  type SeededAffirmLoan,
  type SeededHistoryMonth,
} from '@/lib/debt-plan-seed'

export const DEBT_BALANCE_SEED = 'mybudget.debt-balances-2026-08.v1'
const PLAN_KEY = 'mybudget.debt-plan.v1'

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
  paymentsByMonth: Record<string, Record<string, number>>
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
    if (debt.id === 'debt-affirm') {
      const remaining = seededAffirmLoans.reduce(
        (sum, loan) => sum + loan.remaining,
        0,
      )
      return { ...debt, balance: roundCents(remaining) }
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

export function defaultDebtPlan(): DebtPlanState {
  return {
    monthlyBudget: defaultMonthlyDebtBudget,
    snowballDebtId: defaultSnowballDebtId,
    strategy: 'avalanche',
    customOrder: [],
    recurringCharges: { ...seededRecurringCharges },
    chargesByMonth: {},
    paymentsByMonth: {},
    affirmLoans: seededAffirmLoans.map((loan) => ({ ...loan })),
  }
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

export function chargedForDebt(
  plan: DebtPlanState,
  debtId: string,
  year: number,
  month: number,
) {
  const override = plan.chargesByMonth[monthKey(year, month)]?.[debtId]
  if (typeof override === 'number' && Number.isFinite(override)) {
    return roundCents(override)
  }
  return roundCents(plan.recurringCharges[debtId] ?? 0)
}

export function loadDebtPlan(): DebtPlanState {
  const fallback = defaultDebtPlan()
  try {
    const raw = localStorage.getItem(PLAN_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return fallback
    const item = parsed as Partial<DebtPlanState>
    const snowballDebtId =
      typeof item.snowballDebtId === 'string' && item.snowballDebtId
        ? item.snowballDebtId
        : fallback.snowballDebtId
    const customOrder = normalizeIdList(item.customOrder)
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
          ? { ...fallback.recurringCharges, ...item.recurringCharges }
          : fallback.recurringCharges,
      chargesByMonth: normalizeChargesByMonth(item.chargesByMonth),
      paymentsByMonth: normalizeChargesByMonth(item.paymentsByMonth),
      affirmLoans: Array.isArray(item.affirmLoans) && item.affirmLoans.length > 0
        ? item.affirmLoans.filter(isAffirmLoan)
        : fallback.affirmLoans,
    }
  } catch {
    return fallback
  }
}

export function saveDebtPlan(state: DebtPlanState) {
  localStorage.setItem(PLAN_KEY, JSON.stringify(state))
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

export function strategyLabel(strategy: PayoffStrategy) {
  return PAYOFF_STRATEGIES.find((item) => item.id === strategy)?.label ?? 'Avalanche'
}

export function resolveCustomOrder(debtIds: string[], order: string[]) {
  const known = new Set(debtIds)
  const kept = order.filter((id) => known.has(id))
  const missing = debtIds.filter((id) => !kept.includes(id))
  return [...kept, ...missing]
}

/** Stable 1st-to-last extra-payment order for the selected strategy. */
export function strategyDebtOrder(debts: Debt[], plan: DebtPlanState) {
  const startBalances = new Map(debts.map((debt) => [debt.id, debt.balance]))
  const interestById = new Map(
    debts.map((debt) => [
      debt.id,
      roundCents((debt.balance * (debt.apr / 100)) / 12),
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

export function setMonthCharge(
  plan: DebtPlanState,
  year: number,
  month: number,
  debtId: string,
  amount: number,
): DebtPlanState {
  const key = monthKey(year, month)
  return {
    ...plan,
    chargesByMonth: {
      ...plan.chargesByMonth,
      [key]: {
        ...plan.chargesByMonth[key],
        [debtId]: roundCents(amount),
      },
    },
  }
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

function historyMonth(
  debts: Debt[],
  row: SeededHistoryMonth,
  previous: Map<string, number>,
): PlannerMonth {
  const mins = new Map(debts.map((debt) => [debt.id, debt.minimum]))
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
  monthsAhead = 18,
  now = new Date(),
): PlannerMonth[] {
  const previous = new Map<string, number>()
  const history = seededDebtHistory.map((row) => {
    const month = historyMonth(debts, row, previous)
    for (const line of month.lines) previous.set(line.debtId, line.balance)
    return month
  })
  const balances = new Map(debts.map((debt) => [debt.id, debt.balance]))
  const ranked = strategyDebtOrder(debts, plan)
  const projected: PlannerMonth[] = []
  let year = now.getFullYear()
  let month = now.getMonth()

  for (let step = 0; step < monthsAhead; step++) {
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
      const charged = chargedForDebt(plan, debt.id, year, month)
      const interest = roundCents(start * (debt.apr / 100) / 12)
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
      const minPay = roundCents(Math.min(debt.minimum, due))
      payments.set(debt.id, minPay)
      allocated += minPay
    }

    let leftover = roundCents(
      Math.max(0, plan.monthlyBudget - allocated - lockedTotal),
    )
    const owingIds = new Set(owing.map((debt) => debt.id))
    const waterfall = ranked.filter(
      (debt) => owingIds.has(debt.id) && !locked.has(debt.id),
    )
    for (const debt of waterfall) {
      if (leftover <= 0) break
      const due = afterInterest.get(debt.id) ?? 0
      const already = payments.get(debt.id) ?? 0
      const add = roundCents(Math.min(leftover, Math.max(0, due - already)))
      payments.set(debt.id, roundCents(already + add))
      leftover = roundCents(leftover - add)
    }

    for (const line of lines) {
      const due = afterInterest.get(line.debtId) ?? 0
      const paid = Math.min(
        locked.get(line.debtId) ?? payments.get(line.debtId) ?? 0,
        due,
      )
      const debt = debts.find((item) => item.id === line.debtId)
      line.paid = paid
      line.extra = extraPaidOnLine(paid, debt?.minimum ?? 0, due)
      line.balance = roundCents(Math.max(0, due - paid))
      balances.set(line.debtId, line.balance)
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

export function affirmTotals(loans: AffirmLoan[]) {
  const active = loans.filter((loan) => loan.remaining > 0.005)
  return {
    count: loans.length,
    active: active.length,
    monthly: roundCents(active.reduce((sum, loan) => sum + loan.monthly, 0)),
    remaining: roundCents(active.reduce((sum, loan) => sum + loan.remaining, 0)),
  }
}
