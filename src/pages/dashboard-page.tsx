import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { DebtsCard } from '@/components/budget-cards'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEBT_CATEGORY_ID,
  ceiledMonthlyAmount,
  isExpenseActiveInMonth,
  isHiddenExpense,
  type RecurringExpense,
} from '@/lib/budget'
import { useBudget } from '@/lib/budget-context'
import { formatUsd, formatUsdWhole, formatUsdWholeUp } from '@/lib/format'
import { INCOME_START_YEAR, monthName, stubsForMonth } from '@/lib/income'
import { usePaystubs } from '@/lib/paystub-context'
import { isSpendingPurchase } from '@/lib/spending'
import { useSpending } from '@/lib/spending-context'
import { cn } from '@/lib/utils'

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function dashboardMonths(now: Date) {
  const rows: { year: number; month: number; key: string; label: string }[] = []
  for (let year = now.getFullYear(); year >= INCOME_START_YEAR; year -= 1) {
    const last = year === now.getFullYear() ? now.getMonth() : 11
    for (let month = last; month >= 0; month -= 1) {
      rows.push({
        year,
        month,
        key: monthKey(year, month),
        label: `${monthName(month)} ${year}`,
      })
    }
  }
  return rows
}

function expensesInMonth(
  expenses: RecurringExpense[],
  year: number,
  month: number,
  exclude: string[] = [],
) {
  const skip = new Set(exclude)
  return expenses
    .filter(
      (item) =>
        !skip.has(item.category) &&
        !isHiddenExpense(item) &&
        isExpenseActiveInMonth(item, year, month),
    )
    .reduce((sum, item) => sum + ceiledMonthlyAmount(item), 0)
}

function budgetDeltaLabel(spent: number, budget: number) {
  const delta = Math.round((spent - budget) * 100) / 100
  if (Math.abs(delta) < 0.005) return { text: 'On budget', over: false }
  if (delta > 0) return { text: `${formatUsd(delta)} over`, over: true }
  return { text: `${formatUsd(-delta)} under`, over: false }
}

export function DashboardPage() {
  const { paystubs } = usePaystubs()
  const { expenses } = useBudget()
  const { transactions } = useSpending()
  const now = useMemo(() => new Date(), [])
  const months = useMemo(() => dashboardMonths(now), [now])
  const [selectedKey, setSelectedKey] = useState(() =>
    monthKey(now.getFullYear(), now.getMonth()),
  )
  const selected =
    months.find((item) => item.key === selectedKey) ?? months[0] ?? {
      year: now.getFullYear(),
      month: now.getMonth(),
      key: monthKey(now.getFullYear(), now.getMonth()),
      label: `${monthName(now.getMonth())} ${now.getFullYear()}`,
    }

  const income = useMemo(
    () =>
      stubsForMonth(paystubs, selected.year, selected.month).reduce(
        (sum, stub) => sum + stub.netPay,
        0,
      ),
    [paystubs, selected.month, selected.year],
  )
  const expenseTotal = useMemo(
    () => expensesInMonth(expenses, selected.year, selected.month),
    [expenses, selected.month, selected.year],
  )
  const spent = useMemo(() => {
    const prefix = `${selected.key}-`
    return transactions
      .filter((txn) => txn.date.startsWith(prefix) && isSpendingPurchase(txn))
      .reduce((sum, txn) => sum + txn.amount, 0)
  }, [selected.key, transactions])
  const spendingBudget = useMemo(
    () =>
      expensesInMonth(expenses, selected.year, selected.month, [
        DEBT_CATEGORY_ID,
      ]),
    [expenses, selected.month, selected.year],
  )
  const delta =
    spendingBudget > 0 ? budgetDeltaLabel(spent, spendingBudget) : null

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-medium">Dashboard</h1>
        <Select value={selected.key} onValueChange={setSelectedKey}>
          <SelectTrigger
            aria-label="Dashboard month"
            size="sm"
            className="h-8 text-base"
          >
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            side="bottom"
            sideOffset={4}
            className="w-(--radix-select-trigger-width) min-w-(--radix-select-trigger-width) rounded-md"
          >
            {months.map((item) => (
              <SelectItem key={item.key} value={item.key} className="text-base">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Link
          to="/income"
          className="block cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="hover-fill">
            <CardHeader className="gap-5">
              <div className="flex items-start justify-between gap-2">
                <CardDescription>Income</CardDescription>
                <ChevronRight className="text-muted-foreground size-4" />
              </div>
              <CardTitle className="text-2xl">
                {formatUsdWhole(income)}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link
          to="/expenses"
          className="block cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="hover-fill">
            <CardHeader className="gap-5">
              <div className="flex items-start justify-between gap-2">
                <CardDescription>Expenses</CardDescription>
                <ChevronRight className="text-muted-foreground size-4" />
              </div>
              <CardTitle className="text-2xl">
                {formatUsdWholeUp(expenseTotal)}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link
          to="/spending"
          className="block cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="hover-fill">
            <CardHeader className="gap-5">
              <div className="flex items-start justify-between gap-2">
                <CardDescription>Spending</CardDescription>
                <ChevronRight className="text-muted-foreground size-4" />
              </div>
              <CardTitle className="flex items-baseline text-2xl">
                <span>{formatUsd(spent)}</span>
                {delta ? (
                  <span
                    className={cn(
                      'ml-1.5 text-sm font-normal',
                      delta.over
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {delta.text}
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </section>

      <DebtsCard />
    </main>
  )
}
