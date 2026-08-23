import type { Paystub } from '@/lib/paystub'

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
}
