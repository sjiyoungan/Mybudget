import type { PayLine, Paystub } from '@/lib/paystub'

export const INCOME_START_YEAR = 2026

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' })

export function monthName(monthIndex: number) {
  return monthFormatter.format(new Date(2026, monthIndex, 1))
}

export function availableIncomeYears(paystubs: Paystub[], now = new Date()) {
  const years = new Set<number>()
  const currentYear = now.getFullYear()
  const endYear =
    now.getMonth() === 11
      ? Math.max(currentYear + 1, INCOME_START_YEAR)
      : Math.max(currentYear, INCOME_START_YEAR)

  for (let year = INCOME_START_YEAR; year <= endYear; year += 1) {
    years.add(year)
  }

  for (const stub of paystubs) {
    const year = Number.parseInt(stub.payDate.slice(0, 4), 10)
    if (Number.isFinite(year) && year >= INCOME_START_YEAR) {
      years.add(year)
    }
  }

  return [...years].sort((left, right) => right - left)
}

export function stubsForYear(paystubs: Paystub[], year: number) {
  return paystubs
    .filter((stub) => stub.payDate.startsWith(`${year}-`))
    .sort((left, right) => right.payDate.localeCompare(left.payDate))
}

export function monthlyNetTotals(paystubs: Paystub[], year: number) {
  const totals = Array.from({ length: 12 }, () => 0)
  for (const stub of stubsForYear(paystubs, year)) {
    const month = Number.parseInt(stub.payDate.slice(5, 7), 10) - 1
    if (month >= 0 && month < 12) totals[month] += stub.netPay
  }
  return totals
}

export function yearToDateNet(paystubs: Paystub[], year: number) {
  return stubsForYear(paystubs, year).reduce((sum, stub) => sum + stub.netPay, 0)
}

export function averageMonthlyNet(paystubs: Paystub[], year: number) {
  const monthsWithPay = monthlyNetTotals(paystubs, year).filter(
    (amount) => amount !== 0,
  )
  if (monthsWithPay.length === 0) return 0
  return yearToDateNet(paystubs, year) / monthsWithPay.length
}

export function stubsForMonth(
  paystubs: Paystub[],
  year: number,
  monthIndex: number,
) {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`
  return paystubs
    .filter((stub) => stub.payDate.startsWith(prefix))
    .sort((left, right) => left.payDate.localeCompare(right.payDate))
}

export function currentMonthNet(paystubs: Paystub[], now = new Date()) {
  return stubsForMonth(paystubs, now.getFullYear(), now.getMonth()).reduce(
    (sum, stub) => sum + stub.netPay,
    0,
  )
}

export function visibleMonthRows(
  paystubs: Paystub[],
  year: number,
  now = new Date(),
) {
  const totals = monthlyNetTotals(paystubs, year)
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  return totals
    .map((amount, month) => ({ month, amount }))
    .filter(({ month, amount }) => {
      if (year > currentYear) return amount !== 0
      if (year < currentYear) return amount !== 0
      if (month > currentMonth) return false
      if (amount !== 0) return true
      return month === currentMonth
    })
    .toReversed()
}

const TAX_DEDUCTION =
  /\b(federal|fica|oasdi|social security|medicare|withholding|income tax|state tax|local tax|city tax|sdi|sui|pfl|paid family|unemployment|disability)\b/i

const HEALTHCARE_DEDUCTION =
  /\b(accident|dental|fsa|hsa|hospital|medical|vision|health(?:care)?)\b/i

export function isTaxDeduction(name: string) {
  return TAX_DEDUCTION.test(name) && !isHealthcareDeduction(name)
}

export function isHealthcareDeduction(name: string) {
  return HEALTHCARE_DEDUCTION.test(name)
}

export function sumDeductions(
  paystubs: Paystub[],
  predicate: (name: string) => boolean,
) {
  return paystubs.reduce((sum, stub) => {
    return (
      sum +
      stub.deductions.reduce(
        (inner, line) => (predicate(line.name) ? inner + line.amount : inner),
        0,
      )
    )
  }, 0)
}

export function yearToDateTax(paystubs: Paystub[], year: number) {
  return sumDeductions(stubsForYear(paystubs, year), isTaxDeduction)
}

export function yearToDateHealthcare(paystubs: Paystub[], year: number) {
  return sumDeductions(stubsForYear(paystubs, year), isHealthcareDeduction)
}

export type MonthlyDeductionRow = {
  month: number
  total: number
  lines: PayLine[]
}

function aggregateDeductionLines(
  paystubs: Paystub[],
  predicate: (name: string) => boolean,
): PayLine[] {
  const totals = new Map<string, number>()
  const order: string[] = []

  for (const stub of [...paystubs].sort((left, right) =>
    left.payDate.localeCompare(right.payDate),
  )) {
    for (const line of stub.deductions) {
      if (!predicate(line.name)) continue
      if (!totals.has(line.name)) order.push(line.name)
      totals.set(line.name, (totals.get(line.name) ?? 0) + line.amount)
    }
  }

  return order.map((name) => ({ name, amount: totals.get(name) ?? 0 }))
}

export function monthlyDeductionRows(
  paystubs: Paystub[],
  year: number,
  predicate: (name: string) => boolean,
  now = new Date(),
): MonthlyDeductionRow[] {
  return visibleMonthRows(paystubs, year, now).map(({ month }) => {
    const lines = aggregateDeductionLines(
      stubsForMonth(paystubs, year, month),
      predicate,
    )
    return {
      month,
      total: lines.reduce((sum, line) => sum + line.amount, 0),
      lines,
    }
  })
}
