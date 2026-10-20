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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@/components/ui/select'
import {
  ceiledMonthlyAmount,
  isExpenseActiveInMonth,
  isHiddenExpense,
  type RecurringExpense,
} from '@/lib/budget'
import { useBudget } from '@/lib/budget-context'
import { formatUsdWhole, formatUsdWholeUp } from '@/lib/format'
import { INCOME_START_YEAR, monthName, recentFullMonthsNet } from '@/lib/income'
import { usePaystubs } from '@/lib/paystub-context'
import { cn } from '@/lib/utils'

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function dashboardMonths(now: Date) {
  const rows: { year: number; month: number; key: string }[] = []
  for (let year = now.getFullYear(); year >= INCOME_START_YEAR; year -= 1) {
    const last = year === now.getFullYear() ? now.getMonth() : 11
    for (let month = last; month >= 0; month -= 1) {
      rows.push({
        year,
        month,
        key: monthKey(year, month),
      })
    }
  }
  return rows
}

function monthsByYear(months: { year: number; month: number; key: string }[]) {
  const groups: { year: number; items: typeof months }[] = []
  for (const item of months) {
    const last = groups.at(-1)
    if (last?.year === item.year) last.items.push(item)
    else groups.push({ year: item.year, items: [item] })
  }
  return groups
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

export function DashboardPage() {
  const { paystubs } = usePaystubs()
  const { expenses } = useBudget()
  const now = useMemo(() => new Date(), [])
  const months = useMemo(() => dashboardMonths(now), [now])
  const yearGroups = useMemo(() => monthsByYear(months), [months])
  const showYearLabels = yearGroups.length > 1
  const [selectedKey, setSelectedKey] = useState(() =>
    monthKey(now.getFullYear(), now.getMonth()),
  )
  const selected =
    months.find((item) => item.key === selectedKey) ?? months[0] ?? {
      year: now.getFullYear(),
      month: now.getMonth(),
      key: monthKey(now.getFullYear(), now.getMonth()),
    }

  const income = useMemo(
    () => recentFullMonthsNet(paystubs, selected.year, selected.month, 3, now),
    [paystubs, selected.month, selected.year, now],
  )
  const expenseTotal = useMemo(
    () => expensesInMonth(expenses, selected.year, selected.month),
    [expenses, selected.month, selected.year],
  )
  const leftOver = Math.floor(
    Math.round(income) - Math.ceil(expenseTotal - 1e-9) + 1e-9,
  )

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 pb-8 lg:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-medium">Dashboard</h1>
        <Select value={selected.key} onValueChange={setSelectedKey}>
          <SelectTrigger
            aria-label="Dashboard month"
            size="sm"
            className="h-8 pr-8 text-base"
          >
            {showYearLabels
              ? `${monthName(selected.month)} ${selected.year}`
              : monthName(selected.month)}
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            side="bottom"
            sideOffset={4}
            className="w-(--radix-select-trigger-width) min-w-(--radix-select-trigger-width) rounded-md"
          >
            {yearGroups.map((group) => (
              <SelectGroup key={group.year}>
                {showYearLabels ? (
                  <SelectLabel>{group.year}</SelectLabel>
                ) : null}
                {group.items.map((item) => (
                  <SelectItem
                    key={item.key}
                    value={item.key}
                    className="text-base"
                  >
                    {monthName(item.month)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Link
          to="/income"
          className="block cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="hover-fill">
            <CardHeader className="gap-5">
              <div className="flex items-start justify-between gap-2">
                <CardDescription>Income · 3-month avg</CardDescription>
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
        <Card>
          <CardHeader className="gap-5">
            <CardDescription>Left over</CardDescription>
            <CardTitle
              className={cn('text-2xl', leftOver < 0 && 'text-destructive')}
            >
              {formatUsdWhole(leftOver)}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <DebtsCard />
    </main>
  )
}
