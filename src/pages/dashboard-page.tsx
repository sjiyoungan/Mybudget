import { useMemo, useState, type ReactNode } from 'react'
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
  VARIABLE_CATEGORY_ID,
  ceiledMonthlyAmount,
  isExpenseActiveInMonth,
  isHiddenExpense,
  type RecurringExpense,
} from '@/lib/budget'
import { useBudget } from '@/lib/budget-context'
import { formatUsdWhole, formatUsdWholeUp } from '@/lib/format'
import {
  INCOME_START_YEAR,
  monthName,
  recentFullMonthsNet,
  stubsForMonth,
} from '@/lib/income'
import { usePaystubs } from '@/lib/paystub-context'
import {
  categoryExpenseIds,
  isSpendingPurchase,
  rolledSpendingCategoryId,
  type SpendingCategory,
  type SpendingTxn,
} from '@/lib/spending'
import { useSpending } from '@/lib/spending-context'
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
  include: (item: RecurringExpense) => boolean = () => true,
) {
  return expenses
    .filter(
      (item) =>
        include(item) &&
        !isHiddenExpense(item) &&
        isExpenseActiveInMonth(item, year, month),
    )
    .reduce((sum, item) => sum + ceiledMonthlyAmount(item), 0)
}

function isVariableExpense(item: RecurringExpense) {
  return item.category === VARIABLE_CATEGORY_ID
}

/** Purchases tagged to a category budgeted only against fixed bills are already in fixed. */
function variableSpent(
  transactions: SpendingTxn[],
  categories: SpendingCategory[],
  expenses: RecurringExpense[],
  key: string,
) {
  const variableIds = new Set(
    expenses.filter(isVariableExpense).map((item) => item.id),
  )
  function coveredByFixed(categoryId: string | undefined) {
    const rolled = rolledSpendingCategoryId(categoryId, categories)
    const category = categories.find((item) => item.id === rolled)
    if (!category) return false
    const ids = categoryExpenseIds(category)
    return ids.length > 0 && !ids.some((id) => variableIds.has(id))
  }
  const prefix = `${key}-`
  return transactions
    .filter(
      (txn) =>
        txn.date.startsWith(prefix) &&
        isSpendingPurchase(txn) &&
        !coveredByFixed(txn.categoryId),
    )
    .reduce((sum, txn) => sum + txn.amount, 0)
}

function budgetDeltaLabel(spent: number, budget: number) {
  const delta = Math.ceil(spent - 1e-9) - Math.ceil(budget - 1e-9)
  if (delta === 0) return { text: 'On budget', over: false }
  if (delta > 0) return { text: `${formatUsdWhole(delta)} over`, over: true }
  return { text: `${formatUsdWhole(-delta)} under`, over: false }
}

function MetricCard({
  label,
  to,
  children,
}: {
  label: string
  to?: string
  children: ReactNode
}) {
  const card = (
    <Card className={cn(to && 'hover-fill', 'h-full')}>
      <CardHeader className="gap-5">
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          {to ? <ChevronRight className="text-muted-foreground size-4" /> : null}
        </div>
        <CardTitle className="flex min-h-8 items-baseline text-2xl">
          {children}
        </CardTitle>
      </CardHeader>
    </Card>
  )
  if (!to) return card
  return (
    <Link
      to={to}
      className="block cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {card}
    </Link>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-muted-foreground -mb-2 text-sm font-medium">
      {children}
    </h2>
  )
}

export function DashboardPage() {
  const { paystubs } = usePaystubs()
  const { expenses } = useBudget()
  const { transactions, categories } = useSpending()
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
  const isCurrentMonth =
    selected.year === now.getFullYear() && selected.month === now.getMonth()
  const lastDay = new Date(selected.year, selected.month + 1, 0).getDate()
  const monthClosed = !isCurrentMonth || now.getDate() >= lastDay

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

  const earned = useMemo(
    () =>
      stubsForMonth(paystubs, selected.year, selected.month).reduce(
        (sum, stub) => sum + stub.netPay,
        0,
      ),
    [paystubs, selected.month, selected.year],
  )
  const fixedTotal = useMemo(
    () =>
      expensesInMonth(
        expenses,
        selected.year,
        selected.month,
        (item) => !isVariableExpense(item),
      ),
    [expenses, selected.month, selected.year],
  )
  const variableBudget = useMemo(
    () =>
      expensesInMonth(expenses, selected.year, selected.month, isVariableExpense),
    [expenses, selected.month, selected.year],
  )
  const spent = useMemo(
    () => variableSpent(transactions, categories, expenses, selected.key),
    [transactions, categories, expenses, selected.key],
  )
  const delta =
    variableBudget > 0 ? budgetDeltaLabel(spent, variableBudget) : null
  const actualLeftOver = Math.floor(
    earned - Math.ceil(fixedTotal - 1e-9) - Math.ceil(spent - 1e-9) + 1e-9,
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

      <SectionHeading>Planned</SectionHeading>
      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard label="Income · 3-month avg" to="/income">
          {formatUsdWhole(income)}
        </MetricCard>
        <MetricCard label="Expenses" to="/expenses">
          {formatUsdWholeUp(expenseTotal)}
        </MetricCard>
        <MetricCard label="Left over">
          <span className={cn(leftOver < 0 && 'text-destructive')}>
            {formatUsdWhole(leftOver)}
          </span>
        </MetricCard>
      </section>

      <SectionHeading>{isCurrentMonth ? 'So far this month' : 'Actual'}</SectionHeading>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Income" to="/income">
          {formatUsdWhole(earned)}
        </MetricCard>
        <MetricCard label="Fixed bills" to="/expenses">
          {formatUsdWholeUp(fixedTotal)}
        </MetricCard>
        <MetricCard label="Day-to-day spending" to="/spending">
          <span>{formatUsdWholeUp(spent)}</span>
          {delta ? (
            <span
              className={cn(
                'ml-1.5 text-sm font-normal',
                delta.over ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {delta.text}
            </span>
          ) : null}
        </MetricCard>
        <MetricCard label="Left over">
          {monthClosed ? (
            <span className={cn(actualLeftOver < 0 && 'text-destructive')}>
              {formatUsdWhole(actualLeftOver)}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm font-normal">
              Shows {monthName(selected.month).slice(0, 3)} {lastDay}
            </span>
          )}
        </MetricCard>
      </section>

      <DebtsCard />
    </main>
  )
}
