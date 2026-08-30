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

export type DebtPlanState = {
  monthlyBudget: number
  snowballDebtId: string
  recurringCharges: Record<string, number>
  chargesByMonth: Record<string, Record<string, number>>
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
    recurringCharges: { ...seededRecurringCharges },
    chargesByMonth: {},
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
    return {
      monthlyBudget:
        typeof item.monthlyBudget === 'number' && Number.isFinite(item.monthlyBudget)
          ? item.monthlyBudget
          : fallback.monthlyBudget,
      snowballDebtId:
        typeof item.snowballDebtId === 'string' && item.snowballDebtId
          ? item.snowballDebtId
          : fallback.snowballDebtId,
      recurringCharges:
        item.recurringCharges && typeof item.recurringCharges === 'object'
          ? { ...fallback.recurringCharges, ...item.recurringCharges }
          : fallback.recurringCharges,
      chargesByMonth: normalizeChargesByMonth(item.chargesByMonth),
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

    const payments = new Map<string, number>()
    let allocated = 0
    for (const debt of owing) {
      const due = afterInterest.get(debt.id) ?? 0
      const minPay = roundCents(Math.min(debt.minimum, due))
      payments.set(debt.id, minPay)
      allocated += minPay
    }

    let leftover = roundCents(Math.max(0, plan.monthlyBudget - allocated))
    const waterfall = [
      ...owing.filter((debt) => debt.id === plan.snowballDebtId),
      ...owing.filter((debt) => debt.id !== plan.snowballDebtId && debt.apr > 0),
    ]
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
      const paid = Math.min(payments.get(line.debtId) ?? 0, due)
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
