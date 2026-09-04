import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEBT_CATEGORY_ID,
  isHiddenExpense,
  isLiveExpense,
  monthlyAmount,
  totalMonthlyExpensesExcluding,
  type ExpenseCategoryGroup,
  type RecurringExpense,
} from '@/lib/budget'
import { useBudget } from '@/lib/budget-context'
import { formatDateWithoutYear, formatUsd, formatUsdWholeUp } from '@/lib/format'
import { monthName } from '@/lib/income'
import { useSpending } from '@/lib/spending-context'
import {
  categoryExpenseIds,
  displayMerchant,
  isActiveSpendingCategory,
  isGroupedSpendingCategory,
  isSpendingPurchase,
  rolledSpendingCategoryId,
  sortSpendingTxns,
  toSentenceCase,
  transactionsForUpload,
  visibleSpendingCategories,
  type SpendingCategory,
  type SpendingTxn,
  type SpendingUpload,
} from '@/lib/spending'
import { cn } from '@/lib/utils'

const NONE = 'none'
const SLICE_COLORS = [
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'oklch(0.58 0.12 250)',
  'oklch(0.6 0.11 145)',
  'oklch(0.62 0.1 55)',
  'oklch(0.55 0.1 20)',
]

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function formatTxnAmount(amount: number) {
  if (amount < 0) return `+${formatUsd(-amount)}`
  return formatUsd(amount)
}

function budgetDelta(spent: number, budget: number) {
  return Math.round((spent - budget) * 100) / 100
}

const OVER_BUDGET_TEXT = 'text-[#7a2e2e]'

function isSpendingExpense(expense: RecurringExpense) {
  return (
    !isHiddenExpense(expense) &&
    isLiveExpense(expense) &&
    expense.category !== DEBT_CATEGORY_ID
  )
}

function orderedExpenseLines(
  expenses: RecurringExpense[],
  groups: ExpenseCategoryGroup[],
) {
  const shown = expenses.filter(isSpendingExpense)
  const used = new Set<string>()
  const lines: RecurringExpense[] = []
  for (const group of groups) {
    if (group.id === DEBT_CATEGORY_ID) continue
    for (const expense of shown.filter((item) => item.category === group.id)) {
      used.add(expense.id)
      lines.push(expense)
    }
  }
  for (const expense of shown) {
    if (!used.has(expense.id)) lines.push(expense)
  }
  return lines
}

function accountName(
  accountId: string,
  accounts: { id: string; name: string }[],
) {
  return accounts.find((account) => account.id === accountId)?.name ?? 'Unknown'
}

function categoryName(
  categoryId: string | undefined,
  categories: SpendingCategory[],
) {
  const resolved = rolledSpendingCategoryId(categoryId, categories)
  if (!resolved) return 'Uncategorized'
  const name = categories.find((item) => item.id === resolved)?.name
  return name ? toSentenceCase(name) : 'Uncategorized'
}

function defaultRuleMatch(description: string) {
  const tokens = description
    .replace(/[^A-Za-z0-9&.'+\- ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
  return tokens[0] ?? description.trim()
}

function latestSpendingMonth(transactions: SpendingTxn[]) {
  let latest: string | null = null
  for (const txn of transactions) {
    if (!isSpendingPurchase(txn)) continue
    const key = txn.date.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    if (!latest || key > latest) latest = key
  }
  if (!latest) return null
  const [year, month] = latest.split('-').map(Number)
  return { year, month: month - 1 }
}

function latestSpendingMonthInYear(transactions: SpendingTxn[], year: number) {
  let latest = -1
  const prefix = `${year}-`
  for (const txn of transactions) {
    if (!isSpendingPurchase(txn) || !txn.date.startsWith(prefix)) continue
    const month = Number.parseInt(txn.date.slice(5, 7), 10) - 1
    if (month > latest) latest = month
  }
  return latest >= 0 ? latest : null
}

function availableSpendingYears(transactions: SpendingTxn[], now = new Date()) {
  const years = new Set<number>([now.getFullYear()])
  for (const txn of transactions) {
    const year = Number.parseInt(txn.date.slice(0, 4), 10)
    if (Number.isFinite(year) && year >= 1990 && year <= 2100) years.add(year)
  }
  return [...years].sort((left, right) => right - left)
}

function monthRowsForYear(
  transactions: SpendingTxn[],
  year: number,
  now = new Date(),
) {
  const totals = Array.from({ length: 12 }, () => 0)
  for (const txn of transactions) {
    if (!txn.date.startsWith(`${year}-`) || !isSpendingPurchase(txn)) continue
    const month = Number.parseInt(txn.date.slice(5, 7), 10) - 1
    if (month >= 0 && month < 12) totals[month] += txn.amount
  }
  const currentYear = now.getFullYear()
  const lastMonth = year === currentYear ? now.getMonth() : 11
  return totals
    .map((amount, month) => ({ month, amount }))
    .filter(({ month, amount }) => {
      if (year > currentYear) return amount > 0
      if (year === currentYear) return month <= lastMonth
      return true
    })
    .toReversed()
}

export function SpendingPage() {
  const {
    transactions,
    categories,
    updateTransaction,
    removeTransaction,
    replaceCategories,
    addRule,
    uploads,
    removeUpload,
  } = useSpending()
  const { accounts, expenses, categories: expenseGroups } = useBudget()
  const activeCategories = useMemo(
    () => visibleSpendingCategories(categories),
    [categories],
  )
  const now = useMemo(() => new Date(), [])
  const years = useMemo(
    () => availableSpendingYears(transactions, now),
    [now, transactions],
  )
  const latest = useMemo(
    () => latestSpendingMonth(transactions),
    [transactions],
  )
  const [year, setYear] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const selectedYear = year ?? latest?.year ?? now.getFullYear()
  const monthRows = useMemo(
    () => monthRowsForYear(transactions, selectedYear, now),
    [now, selectedYear, transactions],
  )
  const defaultMonth =
    monthRows.find((row) => row.amount > 0)?.month ??
    latestSpendingMonthInYear(transactions, selectedYear) ??
    monthRows[0]?.month ??
    null
  const activeMonth =
    selectedMonth != null && monthRows.some((row) => row.month === selectedMonth)
      ? selectedMonth
      : defaultMonth
  const [editing, setEditing] = useState<SpendingTxn | null>(null)
  const [expandedDays, setExpandedDays] = useState<string[]>([])
  const [expandedStatementMonth, setExpandedStatementMonth] = useState<
    string | null
  >(null)
  const [expandedUpload, setExpandedUpload] = useState<string | null>(null)
  const [removeUploadId, setRemoveUploadId] = useState<string | null>(null)
  const [editCategoriesOpen, setEditCategoriesOpen] = useState(false)
  const [statementsOpen, setStatementsOpen] = useState(false)

  const monthPrefix =
    activeMonth == null
      ? ''
      : `${selectedYear}-${String(activeMonth + 1).padStart(2, '0')}-`
  const monthTxns = useMemo(
    () =>
      sortSpendingTxns(
        monthPrefix
          ? transactions.filter((txn) => txn.date.startsWith(monthPrefix))
          : [],
      ),
    [monthPrefix, transactions],
  )
  const statementMonths = useMemo(() => {
    const groups = new Map<
      string,
      { year: number; month: number; uploads: SpendingUpload[] }
    >()
    for (const upload of uploads) {
      const key = uploadMonthKey(upload, transactions, uploads)
      if (!key) continue
      const id = `${key.year}-${key.month}`
      const group = groups.get(id)
      if (group) group.uploads.push(upload)
      else groups.set(id, { year: key.year, month: key.month, uploads: [upload] })
    }
    const rows = [...groups.values()]
      .map((group) => ({
        ...group,
        uploads: [...group.uploads].sort((left, right) =>
          right.uploadedAt.localeCompare(left.uploadedAt),
        ),
      }))
      .sort((left, right) => right.year - left.year || right.month - left.month)
    const manyYears = new Set(rows.map((row) => row.year)).size > 1
    return rows.map((row) => ({
      ...row,
      label: manyYears
        ? `${monthName(row.month)} ${row.year}`
        : monthName(row.month),
    }))
  }, [transactions, uploads])
  const spentTxns = useMemo(
    () => monthTxns.filter(isSpendingPurchase),
    [monthTxns],
  )
  const totalSpent = spentTxns.reduce((sum, txn) => sum + txn.amount, 0)
  const monthBudget = useMemo(
    () => totalMonthlyExpensesExcluding(expenses, [DEBT_CATEGORY_ID]),
    [expenses],
  )
  const slices = useMemo(() => {
    const totals = new Map(activeCategories.map((category) => [category.id, 0]))
    let uncategorized = 0
    for (const txn of spentTxns) {
      const key = rolledSpendingCategoryId(txn.categoryId, categories) ?? ''
      if (key && totals.has(key)) {
        totals.set(key, (totals.get(key) ?? 0) + txn.amount)
      } else {
        uncategorized += txn.amount
      }
    }
    const rows = activeCategories.map((category, index) => {
      const linked = categoryExpenseIds(category)
        .map((id) => expenses.find((item) => item.id === id))
        .filter((item): item is (typeof expenses)[number] => item != null)
      return {
        id: category.id,
        name: toSentenceCase(category.name),
        amount: totals.get(category.id) ?? 0,
        budget:
          linked.length > 0
            ? linked.reduce((sum, item) => sum + monthlyAmount(item), 0)
            : null,
        color: SLICE_COLORS[index % SLICE_COLORS.length],
      }
    })
    if (uncategorized > 0) {
      rows.push({
        id: '',
        name: 'Uncategorized',
        amount: uncategorized,
        budget: null,
        color: 'var(--muted-foreground)',
      })
    }
    return rows.sort(
      (left, right) =>
        right.amount - left.amount || left.name.localeCompare(right.name),
    )
  }, [activeCategories, categories, expenses, spentTxns])
  const dayRows = useMemo(() => {
    const byDay = new Map<string, SpendingTxn[]>()
    for (const txn of spentTxns) {
      const items = byDay.get(txn.date)
      if (items) items.push(txn)
      else byDay.set(txn.date, [txn])
    }
    return [...byDay.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([date, items]) => ({
        date,
        items,
        amount: items.reduce((sum, txn) => sum + txn.amount, 0),
      }))
  }, [spentTxns])
  const monthDelta = monthBudget > 0 ? budgetDelta(totalSpent, monthBudget) : null
  const monthOver = monthDelta != null && monthDelta > 0.005
  const monthStatus =
    monthDelta == null
      ? null
      : Math.abs(monthDelta) < 0.005
        ? 'On budget'
        : monthOver
          ? `${formatUsd(monthDelta)} over`
          : `${formatUsd(-monthDelta)} under`

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-medium">Spending</h1>
          <Select
            value={String(selectedYear)}
            onValueChange={(value) => {
              const next = Number(value)
              setYear(next)
              setSelectedMonth(null)
              setExpandedDays([])
            }}
          >
            <SelectTrigger
              aria-label="Spending year"
              size="sm"
              className="h-8 text-base"
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="start"
              side="bottom"
              sideOffset={4}
              className="w-(--radix-select-trigger-width) min-w-(--radix-select-trigger-width) rounded-md"
            >
              {years.map((option) => (
                <SelectItem key={option} value={String(option)} className="text-base">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setStatementsOpen(true)}
        >
          Statement
        </Button>
      </div>

      <section className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Monthly expenses</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 pl-3">
            {monthRows.map((row) => {
              const selected = row.month === activeMonth
              return (
                <button
                  key={row.month}
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => {
                    setSelectedMonth(row.month)
                    setExpandedDays([])
                  }}
                  className={cn(
                    'hover-fill grid w-full cursor-pointer grid-cols-[1fr_auto] items-baseline gap-4 rounded-lg py-2 pr-2.5 pl-1 text-left',
                    selected && 'hover-fill-active',
                  )}
                >
                  <span className={selected ? 'font-medium' : undefined}>
                    {monthName(row.month)}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums',
                      row.amount === 0 && 'text-muted-foreground',
                    )}
                  >
                    {formatUsd(row.amount)}
                  </span>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
            <CardTitle>Total expense</CardTitle>
            <CardAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditCategoriesOpen(true)}
              >
                Edit category
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-5">
            <p className="flex flex-wrap items-baseline gap-1.5 text-2xl font-medium tabular-nums">
              <span>{formatUsd(totalSpent)}</span>
              {monthStatus ? (
                <span
                  className={cn(
                    'text-sm font-normal',
                    monthOver ? OVER_BUDGET_TEXT : 'text-muted-foreground',
                  )}
                >
                  {monthStatus}
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-12">
              <div className="pl-2">
                <CategoryPie slices={slices} total={totalSpent} />
              </div>
              <ul className="grid min-w-[12rem] flex-1 gap-2">
                {slices.map((slice) => {
                  const delta =
                    slice.budget != null
                      ? budgetDelta(slice.amount, slice.budget)
                      : null
                  const over = delta != null && delta > 0.005
                  return (
                    <li
                      key={slice.id || 'uncategorized'}
                      className="grid grid-cols-[auto_auto_1fr_auto] items-start gap-x-2 text-sm"
                    >
                      <span
                        className="mt-1.5 size-2.5 shrink-0 rounded-full"
                        style={{ background: slice.color }}
                      />
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                        {slice.name}
                        {slice.budget != null ? (
                          <span className="text-muted-foreground">
                            {' · '}
                            {formatUsd(slice.budget)}
                          </span>
                        ) : null}
                      </span>
                      <span />
                      <span className="tabular-nums whitespace-nowrap">
                        {formatUsd(slice.amount)}
                        {delta != null ? (
                          <span
                            className={cn(
                              'ml-1 text-xs',
                              over
                                ? OVER_BUDGET_TEXT
                                : 'text-muted-foreground',
                            )}
                          >
                            {over
                              ? `${formatUsd(delta)} over`
                              : `${formatUsd(Math.abs(delta))} left`}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <CardTitle>Transactions</CardTitle>
          {dayRows.length > 0 ? (
            <CardAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const anyOpen = dayRows.some((row) =>
                    expandedDays.includes(row.date),
                  )
                  setExpandedDays(anyOpen ? [] : dayRows.map((row) => row.date))
                }}
              >
                {dayRows.some((row) => expandedDays.includes(row.date))
                  ? 'Close all'
                  : 'Expand all'}
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-1">
          {dayRows.map((row) => {
            const expanded = expandedDays.includes(row.date)
            return (
              <div key={row.date}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpandedDays((current) =>
                      current.includes(row.date)
                        ? current.filter((date) => date !== row.date)
                        : [...current, row.date],
                    )
                  }}
                  className="hover-fill hover-fill-plain grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_5.75rem_1rem] items-center gap-x-3 rounded-lg px-2.5 py-2 text-left"
                >
                  <span className={expanded ? 'font-medium' : undefined}>
                    {formatDateWithoutYear(row.date, 'short')}
                  </span>
                  <span className="w-[5.75rem] shrink-0 text-right tabular-nums">
                    {formatUsd(row.amount)}
                  </span>
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <ChevronDown
                      className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        expanded && 'rotate-180',
                      )}
                    />
                  </span>
                </button>
                {expanded ? (
                  <ul className="hover-fill-active grid gap-0.5 rounded-lg">
                    {row.items.map((txn) => (
                      <TransactionRow
                        key={txn.id}
                        txn={txn}
                        accounts={accounts}
                        categories={categories}
                        onClick={() => setEditing(txn)}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Dialog
        open={statementsOpen}
        onOpenChange={(open) => {
          setStatementsOpen(open)
          if (!open) {
            setExpandedStatementMonth(null)
            setExpandedUpload(null)
          }
        }}
      >
        <DialogContent
          className="flex max-h-[min(40rem,calc(100vh-2rem))] w-[min(48rem,calc(100%-2rem))] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-4 sm:max-w-[min(48rem,calc(100%-2rem))]"
        >
          <DialogHeader className="pb-3">
            <DialogTitle>Statements</DialogTitle>
            <DialogDescription className="sr-only">
              Uploaded statements grouped by month.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            {statementMonths.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No statements uploaded yet.
              </p>
            ) : (
              <div className="grid min-w-0 gap-1">
                {statementMonths.map((group) => {
                  const monthKey = `${group.year}-${group.month}`
                  const monthOpen = expandedStatementMonth === monthKey
                  return (
                    <div key={monthKey} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedStatementMonth(monthOpen ? null : monthKey)
                          if (monthOpen) setExpandedUpload(null)
                        }}
                        className="hover-fill grid w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2.5 py-2 text-left"
                      >
                        <span
                          className={cn(
                            'min-w-0',
                            monthOpen && 'font-medium',
                          )}
                        >
                          {group.label}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-sm">
                          {statementCountLabel(group.uploads.length)}
                        </span>
                        <ChevronDown
                          className={cn(
                            'size-4 shrink-0 text-muted-foreground transition-transform',
                            monthOpen && 'rotate-180',
                          )}
                        />
                      </button>
                      {monthOpen ? (
                        <div className="grid min-w-0 gap-1 py-1 pl-3">
                          {group.uploads.map((upload) => {
                            const items = sortSpendingTxns(
                              transactionsForUpload(
                                transactions,
                                upload,
                                uploads,
                              ),
                            )
                            const expanded = expandedUpload === upload.id
                            return (
                              <div key={upload.id} className="min-w-0">
                                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedUpload(
                                        expanded ? null : upload.id,
                                      )
                                    }
                                    className="hover-fill grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                                  >
                                    <span
                                      className={cn(
                                        'min-w-0 break-words [overflow-wrap:anywhere]',
                                        expanded && 'font-medium',
                                      )}
                                    >
                                      {upload.name}
                                    </span>
                                    <ChevronDown
                                      className={cn(
                                        'size-4 shrink-0 text-muted-foreground transition-transform',
                                        expanded && 'rotate-180',
                                      )}
                                    />
                                  </button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Remove ${upload.name}`}
                                    onClick={() => setRemoveUploadId(upload.id)}
                                  >
                                    <Trash2 />
                                  </Button>
                                </div>
                                {expanded ? (
                                  <ul className="grid min-w-0 gap-0.5 py-1 pl-2">
                                    {items.length === 0 ? (
                                      <li className="text-muted-foreground px-2.5 py-2 text-sm">
                                        No purchases from this file.
                                      </li>
                                    ) : (
                                      items.map((txn) => (
                                        <TransactionRow
                                          key={txn.id}
                                          txn={txn}
                                          accounts={accounts}
                                          categories={categories}
                                          showAccount={false}
                                          showDate
                                          onClick={() => setEditing(txn)}
                                        />
                                      ))
                                    )}
                                  </ul>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <EditTxnDialog
        txn={editing}
        accounts={accounts}
        categories={categories}
        uploads={uploads}
        onClose={() => setEditing(null)}
        onSave={(id, patch, rule) => {
          updateTransaction(id, patch)
          if (rule) addRule(rule)
          setEditing(null)
        }}
        onDelete={(id) => {
          removeTransaction(id)
          setEditing(null)
        }}
      />

      <EditCategoriesDialog
        open={editCategoriesOpen}
        categories={categories}
        expenses={expenses}
        groups={expenseGroups}
        onClose={() => setEditCategoriesOpen(false)}
        onSave={(next) => {
          replaceCategories(next)
          setEditCategoriesOpen(false)
        }}
      />

      <Dialog
        open={removeUploadId != null}
        onOpenChange={(next) => {
          if (!next) setRemoveUploadId(null)
        }}
      >
        <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove statement?</DialogTitle>
            <DialogDescription>
              {(() => {
                const upload = uploads.find((item) => item.id === removeUploadId)
                if (!upload) return 'This removes the statement and its purchases.'
                const count = transactionsForUpload(
                  transactions,
                  upload,
                  uploads,
                ).length
                const noun =
                  count === 1 ? '1 purchase' : `${count} purchases`
                return `Removing “${upload.name}” also deletes ${noun} from this file.`
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveUploadId(null)}
            >
              Keep statement
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (removeUploadId) removeUpload(removeUploadId)
                if (expandedUpload === removeUploadId) setExpandedUpload(null)
                setRemoveUploadId(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function CategoryPie({
  slices,
  total,
}: {
  slices: { amount: number; color: string }[]
  total: number
}) {
  const gradient =
    total <= 0
      ? 'var(--muted)'
      : (() => {
          let start = 0
          return slices
            .map((slice) => {
              const end = start + (slice.amount / total) * 100
              const stop = `${slice.color} ${start}% ${end}%`
              start = end
              return stop
            })
            .join(', ')
        })()

  return (
    <div
      className="relative size-36 shrink-0 rounded-full"
      style={{ background: `conic-gradient(${gradient})` }}
      aria-hidden
    >
      <div className="bg-card absolute inset-[8px] rounded-full" />
    </div>
  )
}

function TransactionRow({
  txn,
  accounts,
  categories,
  showAccount = true,
  showDate = false,
  onClick,
}: {
  txn: SpendingTxn
  accounts: { id: string; name: string }[]
  categories: SpendingCategory[]
  showAccount?: boolean
  showDate?: boolean
  onClick: () => void
}) {
  const category = categoryName(txn.categoryId, categories)
  return (
    <li className="min-w-0">
      <button
        type="button"
        className={cn(
          'hover-fill group grid w-full min-w-0 items-start gap-x-3 rounded-lg px-2.5 py-2 text-left',
          showAccount && showDate &&
            'grid-cols-[minmax(0,1fr)_minmax(0,8rem)_5.75rem_1rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_6rem_auto_5.75rem_1rem]',
          showAccount && !showDate &&
            'grid-cols-[minmax(0,1fr)_minmax(0,8rem)_5.75rem_1rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_6rem_5.75rem_1rem]',
          !showAccount && showDate &&
            'grid-cols-[minmax(0,1fr)_minmax(0,8rem)_auto_5.75rem_1rem]',
          !showAccount && !showDate &&
            'grid-cols-[minmax(0,1fr)_minmax(0,8rem)_5.75rem_1rem]',
        )}
        onClick={onClick}
      >
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
          {displayMerchant(txn)}
        </span>
        <span className="text-muted-foreground min-w-0 break-words pt-0.5 text-xs [overflow-wrap:anywhere]">
          {category}
        </span>
        {showAccount ? (
          <span className="text-muted-foreground hidden w-24 shrink-0 pt-0.5 text-xs sm:block">
            {accountName(txn.accountId, accounts)}
          </span>
        ) : null}
        {showDate ? (
          <span className="text-muted-foreground shrink-0 pt-0.5">
            {formatDateWithoutYear(txn.date, 'short')}
          </span>
        ) : null}
        <span
          className={cn(
            'w-[5.75rem] shrink-0 pt-0.5 text-right tabular-nums',
            txn.amount < 0 && 'text-muted-foreground',
          )}
        >
          {formatTxnAmount(txn.amount)}
        </span>
        <span className="flex size-4 shrink-0 items-center justify-center">
          <Pencil className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </span>
      </button>
    </li>
  )
}

function EditTxnDialog({
  txn,
  accounts,
  categories,
  uploads,
  onClose,
  onSave,
  onDelete,
}: {
  txn: SpendingTxn | null
  accounts: { id: string; name: string }[]
  categories: SpendingCategory[]
  uploads: SpendingUpload[]
  onClose: () => void
  onSave: (
    id: string,
    patch: Partial<Omit<SpendingTxn, 'id'>>,
    rule?: { match: string; merchant: string; categoryId?: string },
  ) => void
  onDelete: (id: string) => void
}) {
  return (
    <Dialog open={txn != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {txn ? (
          <EditTxnForm
            key={txn.id}
            txn={txn}
            accounts={accounts}
            categories={categories}
            uploads={uploads}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EditTxnForm({
  txn,
  accounts,
  categories,
  uploads,
  onSave,
  onDelete,
}: {
  txn: SpendingTxn
  accounts: { id: string; name: string }[]
  categories: SpendingCategory[]
  uploads: SpendingUpload[]
  onSave: (
    id: string,
    patch: Partial<Omit<SpendingTxn, 'id'>>,
    rule?: { match: string; merchant: string; categoryId?: string },
  ) => void
  onDelete: (id: string) => void
}) {
  const [merchant, setMerchant] = useState(() => displayMerchant(txn))
  const [amount, setAmount] = useState(Math.abs(txn.amount).toFixed(2))
  const [date, setDate] = useState(txn.date)
  const [accountId, setAccountId] = useState(txn.accountId)
  const [categoryId, setCategoryId] = useState(() => txn.categoryId ?? '')
  const categoryOptions = visibleSpendingCategories(categories)
  const [createRule, setCreateRule] = useState(false)
  const [match, setMatch] = useState(() => defaultRuleMatch(txn.description))
  const fromStatement = statementName(txn, uploads)
  const parsedAmount = parseAmount(amount)
  const deposit = txn.amount < 0
  const accountOptions =
    accountId && !accounts.some((account) => account.id === accountId)
      ? [{ id: accountId, name: 'Unknown' }, ...accounts]
      : accounts

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit purchase</DialogTitle>
        <DialogDescription>
          {fromStatement
            ? `From ${fromStatement}`
            : txn.description !== txn.merchant
              ? txn.description
              : 'Change the name, category, or amount.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Name</span>
          <Input value={merchant} onChange={(event) => setMerchant(event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Category</span>
          <Select
            value={categoryId || NONE}
            onValueChange={(value) => setCategoryId(value === NONE ? '' : value)}
          >
            <SelectTrigger className="w-full" aria-label="Category">
              <SelectValue placeholder="Uncategorized" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Uncategorized</SelectItem>
              {categoryOptions.map((category) => {
                const children = categories.filter(
                  (item) => item.parentId === category.id,
                )
                if (children.length === 0) {
                  return (
                    <SelectItem key={category.id} value={category.id}>
                      {toSentenceCase(category.name)}
                    </SelectItem>
                  )
                }
                return (
                  <SelectGroup key={category.id} className="p-0">
                    <SelectLabel>{toSentenceCase(category.name)}</SelectLabel>
                    {children.map((child) => (
                      <SelectItem
                        key={child.id}
                        value={child.id}
                        className="pl-3.5"
                      >
                        {toSentenceCase(child.name)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )
              })}
            </SelectContent>
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">
              {deposit ? 'Deposit' : 'Amount'}
            </span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Date</span>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Account</span>
          <Select value={accountId || undefined} onValueChange={setAccountId}>
            <SelectTrigger className="w-full" aria-label="Account">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button
          type="button"
          variant={createRule ? 'secondary' : 'outline'}
          onClick={() => setCreateRule((open) => !open)}
        >
          Create rule
        </Button>
        {createRule ? (
          <div className="grid gap-3 rounded-lg border p-3">
            <label className="grid gap-1.5">
              <span className="text-muted-foreground text-xs">
                If the description contains
              </span>
              <Input
                value={match}
                placeholder="CHEWY"
                onChange={(event) => setMatch(event.target.value)}
              />
            </label>
            <p className="text-muted-foreground text-xs">
              Matching purchases will be named {merchant.trim() || 'this'}
              {categoryId
                ? ` and filed under ${categoryName(categoryId, categories)}`
                : ''}
              .
            </p>
          </div>
        ) : null}
      </div>
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="destructive" onClick={() => onDelete(txn.id)}>
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
        <Button
          type="button"
          disabled={
            !merchant.trim() ||
            parsedAmount == null ||
            parsedAmount <= 0 ||
            !date ||
            (createRule && !match.trim())
          }
          onClick={() => {
            if (parsedAmount == null) return
            const signed = deposit ? -parsedAmount : parsedAmount
            const nextCategory = categoryId || undefined
            const nextName = toSentenceCase(merchant)
            onSave(
              txn.id,
              {
                merchant: nextName,
                amount: signed,
                date,
                accountId,
                categoryId: nextCategory,
                customName: nextName !== displayMerchant(txn) ? true : txn.customName,
                customCategory:
                  nextCategory !== txn.categoryId ? true : txn.customCategory,
              },
              createRule
                ? {
                    match: match.trim(),
                    merchant: nextName,
                    categoryId: nextCategory,
                  }
                : undefined,
            )
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

type ChildDraft = {
  id: string
  name: string
}

type GroupDraft = {
  id: string
  name: string
  expenseIds: string[]
  categories: ChildDraft[]
  open: boolean
}

function snapshotCategoryPicks(groups: GroupDraft[]) {
  return JSON.stringify(
    groups.map((group) => ({
      id: group.id,
      name: group.name.trim(),
      expenseIds: [...group.expenseIds].sort(),
      categories: group.categories.map((item) => ({
        id: item.id,
        name: item.name.trim(),
      })),
    })),
  )
}

const GHOST_FIELD =
  'edit-ghost-field border-transparent bg-transparent shadow-none transition-colors hover:bg-transparent focus-visible:ring-0 focus-visible:ring-transparent dark:bg-transparent dark:hover:bg-transparent'

function allotExpenseLabel(ids: string[], expenses: RecurringExpense[]) {
  if (ids.length === 0) return 'Allot expense'
  const total = ids.reduce((sum, id) => {
    const expense = expenses.find((item) => item.id === id)
    return sum + (expense ? monthlyAmount(expense) : 0)
  }, 0)
  const amount = formatUsdWholeUp(total)
  if (ids.length === 1) {
    const expense = expenses.find((item) => item.id === ids[0])
    if (!expense) return 'Allot expense'
    return `${toSentenceCase(expense.name)} · ${amount}`
  }
  return `${ids.length} expenses · ${amount}`
}

function expenseCountLabel(count: number) {
  if (count === 0) return 'No expenses selected'
  if (count === 1) return '1 expense selected'
  return `${count} expenses selected`
}

const MONTH_ALIASES = [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may', 'may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sep'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec'],
] as const

function monthFromStatementName(name: string) {
  const hay = name.toLowerCase().replace(/[_./]+/g, ' ')
  for (let month = 0; month < MONTH_ALIASES.length; month += 1) {
    const [full, short] = MONTH_ALIASES[month]
    if (new RegExp(`\\b${full}\\b`).test(hay)) return month
    if (new RegExp(`\\b${short}\\b`).test(hay)) return month
  }
  const iso = name.match(/(20\d{2})[-_./ ](0?[1-9]|1[0-2])/)
  if (iso) return Number(iso[2]) - 1
  const us = name.match(/(0?[1-9]|1[0-2])[-_./ ](20\d{2})/)
  if (us) return Number(us[1]) - 1
  return null
}

function yearFromStatementName(name: string) {
  const match = name.match(/\b(20\d{2})\b/)
  return match ? Number(match[1]) : null
}

function uploadMonthKey(
  upload: SpendingUpload,
  transactions: SpendingTxn[],
  uploads: SpendingUpload[],
) {
  const namedMonth = monthFromStatementName(upload.name)
  const namedYear = yearFromStatementName(upload.name)
  if (namedMonth != null) {
    if (namedYear != null) return { year: namedYear, month: namedMonth }
    const dated = transactionsForUpload(transactions, upload, uploads).find(
      (txn) => /^\d{4}-\d{2}/.test(txn.date),
    )
    const year = dated
      ? Number(dated.date.slice(0, 4))
      : new Date(upload.uploadedAt).getFullYear()
    return {
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      month: namedMonth,
    }
  }
  const dated = transactionsForUpload(transactions, upload, uploads).find(
    (txn) => /^\d{4}-\d{2}/.test(txn.date),
  )
  if (dated) {
    return {
      year: Number(dated.date.slice(0, 4)),
      month: Number(dated.date.slice(5, 7)) - 1,
    }
  }
  const uploaded = new Date(upload.uploadedAt)
  if (!Number.isFinite(uploaded.getTime())) return null
  return { year: uploaded.getFullYear(), month: uploaded.getMonth() }
}

function statementCountLabel(count: number) {
  return count === 1 ? '1 statement' : `${count} statements`
}

function statementName(txn: SpendingTxn, uploads: SpendingUpload[]) {
  if (txn.uploadId) {
    const upload = uploads.find((item) => item.id === txn.uploadId)
    if (upload) return upload.name
  }
  return txn.sourceFile ?? ''
}

function CategoryCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-[5px] border',
        checked ? 'border-neutral-400' : 'border-neutral-300',
      )}
      aria-hidden
    >
      {checked ? <Check className="size-3.5 text-neutral-600" /> : null}
    </span>
  )
}

function ExpenseSelectDropdown({
  className,
  count,
  label,
  lines,
  isSelected,
  onToggle,
}: {
  className?: string
  count: number
  label?: string
  lines: RecurringExpense[]
  isSelected: (id: string) => boolean
  onToggle: (id: string) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuWidth, setMenuWidth] = useState<number>()
  const ordered = [...lines].sort((left, right) => {
    const leftOn = isSelected(left.id) ? 0 : 1
    const rightOn = isSelected(right.id) ? 0 : 1
    return leftOn - rightOn
  })

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return
        const width = triggerRef.current?.getBoundingClientRect().width
        if (width) setMenuWidth(width)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 shrink-0 justify-between',
            GHOST_FIELD,
            className,
          )}
        >
          <span className="truncate">{label ?? expenseCountLabel(count)}</span>
          <ChevronDown className="size-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[60] max-h-72 min-w-0 overflow-x-hidden overflow-y-auto"
        style={
          menuWidth
            ? { width: menuWidth, minWidth: menuWidth, maxWidth: menuWidth }
            : undefined
        }
      >
        {ordered.length === 0 ? (
          <DropdownMenuItem
            className="text-muted-foreground"
            onSelect={(event) => event.preventDefault()}
          >
            No expenses
          </DropdownMenuItem>
        ) : (
          ordered.map((expense) => {
            const on = isSelected(expense.id)
            return (
              <DropdownMenuItem
                key={expense.id}
                className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                onSelect={(event) => {
                  event.preventDefault()
                  onToggle(expense.id)
                }}
              >
                <span className={cn('truncate', on && 'font-medium')}>
                  {toSentenceCase(expense.name)}
                </span>
                <CategoryCheck checked={on} />
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EditCategoriesDialog({
  open,
  categories,
  expenses,
  groups,
  onClose,
  onSave,
}: {
  open: boolean
  categories: SpendingCategory[]
  expenses: RecurringExpense[]
  groups: ExpenseCategoryGroup[]
  onClose: () => void
  onSave: (categories: SpendingCategory[]) => void
}) {
  const lines = useMemo(
    () => orderedExpenseLines(expenses, groups),
    [expenses, groups],
  )
  const listRef = useRef<HTMLDivElement>(null)
  const pendingScrollId = useRef<string | null>(null)
  const [drafts, setDrafts] = useState<GroupDraft[]>([])
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const children = new Map<string, ChildDraft[]>()
    for (const item of categories) {
      if (!item.parentId) continue
      const list = children.get(item.parentId) ?? []
      list.push({
        id: item.id,
        name: item.name,
      })
      children.set(item.parentId, list)
    }
    const nextDrafts: GroupDraft[] = []
    for (const item of categories) {
      if (item.parentId) continue
      if (
        !isGroupedSpendingCategory(item) &&
        !(isActiveSpendingCategory(item) && categoryExpenseIds(item).length > 0)
      ) {
        continue
      }
      nextDrafts.push({
        id: item.id,
        name: item.name,
        expenseIds: categoryExpenseIds(item),
        categories: children.get(item.id) ?? [],
        open: false,
      })
    }
    setDrafts(nextDrafts)
    setBaseline(snapshotCategoryPicks(nextDrafts))
    setConfirmOpen(false)
    pendingScrollId.current = null
  }, [categories, open])

  useLayoutEffect(() => {
    const id = pendingScrollId.current
    if (!id) return
    pendingScrollId.current = null
    const node = listRef.current?.querySelector(`[data-scroll-id="${id}"]`)
    if (!(node instanceof HTMLElement)) return
    node.scrollIntoView({ behavior: 'smooth', block: 'end' })
    node.querySelector('input')?.focus()
  }, [drafts])

  const dirty = snapshotCategoryPicks(drafts) !== baseline

  function closeClean() {
    setConfirmOpen(false)
    onClose()
  }

  function requestClose() {
    if (confirmOpen) return
    if (dirty) {
      setConfirmOpen(true)
      return
    }
    closeClean()
  }

  function updateGroup(id: string, patch: Partial<GroupDraft>) {
    setDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function addGroup() {
    const id = crypto.randomUUID()
    pendingScrollId.current = id
    setDrafts((current) => [
      ...current,
      { id, name: '', expenseIds: [], categories: [], open: true },
    ])
  }

  function addCategory(groupId: string) {
    const id = crypto.randomUUID()
    pendingScrollId.current = id
    setDrafts((current) =>
      current.map((item) =>
        item.id === groupId
          ? {
              ...item,
              open: true,
              categories: [...item.categories, { id, name: '' }],
            }
          : item,
      ),
    )
  }

  function toggleAllotment(groupId: string, expenseId: string) {
    setDrafts((current) => {
      const group = current.find((item) => item.id === groupId)
      const adding = group != null && !group.expenseIds.includes(expenseId)
      return current.map((item) => {
        if (item.id === groupId) {
          return {
            ...item,
            expenseIds: item.expenseIds.includes(expenseId)
              ? item.expenseIds.filter((id) => id !== expenseId)
              : [...item.expenseIds, expenseId],
          }
        }
        if (adding) {
          return {
            ...item,
            expenseIds: item.expenseIds.filter((id) => id !== expenseId),
          }
        }
        return item
      })
    })
  }

  function handleSave() {
    const next: SpendingCategory[] = []
    for (const group of drafts) {
      const name = toSentenceCase(group.name)
      if (!name) continue
      next.push({
        id: group.id,
        name,
        grouped: true,
        ...(group.expenseIds.length > 0 ? { expenseIds: group.expenseIds } : {}),
      })
      for (const child of group.categories) {
        const childName = toSentenceCase(child.name)
        if (!childName) continue
        next.push({
          id: child.id,
          name: childName,
          parentId: group.id,
        })
      }
    }
    for (const item of categories) {
      if (item.enabled !== false) continue
      if (item.parentId || item.grouped) continue
      if (next.some((row) => row.id === item.id)) continue
      next.push(item)
    }
    onSave(next)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose()
        }}
      >
        <DialogContent
          className="w-[min(46rem,calc(100%-2rem))] max-w-[calc(100%-2rem)] gap-0 p-4 sm:max-w-2xl"
          showCloseButton={false}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            if (confirmOpen) {
              setConfirmOpen(false)
              return
            }
            requestClose()
          }}
        >
          <div className="-mx-4 border-b px-4 pb-4">
            <div className="flex items-center justify-between gap-3">
              <DialogHeader>
                <DialogTitle className="pl-2.5 text-2xl tracking-tight">
                  Edit categories
                </DialogTitle>
              </DialogHeader>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={addGroup}
              >
                Add group
              </Button>
            </div>
          </div>

          <div
            ref={listRef}
            className="no-scrollbar max-h-[min(70vh,40rem)] overflow-y-auto py-3"
          >
            {drafts.length === 0 ? (
              <p className="text-muted-foreground px-2.5 py-2 text-sm">
                Add a group, allot an expense as its budget, then expand it to
                add categories like eating out or hobbies.
              </p>
            ) : (
              <ul className="divide-y divide-black/10">
                {drafts.map((group) => (
                  <li
                    key={group.id}
                    data-scroll-id={group.id}
                    className="py-1"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_28px_28px] items-center gap-2 py-1.5 pr-2.5 pl-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Input
                          className={cn('h-8 min-w-0 flex-1', GHOST_FIELD)}
                          value={group.name}
                          placeholder="Group"
                          aria-label="Group name"
                          onChange={(event) =>
                            updateGroup(group.id, { name: event.target.value })
                          }
                        />
                        <ExpenseSelectDropdown
                          className="w-[14.5rem]"
                          count={group.expenseIds.length}
                          label={allotExpenseLabel(group.expenseIds, lines)}
                          lines={lines}
                          isSelected={(id) => group.expenseIds.includes(id)}
                          onToggle={(id) => toggleAllotment(group.id, id)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-expanded={group.open}
                        aria-label={
                          group.open
                            ? `Collapse ${group.name || 'group'}`
                            : `Expand ${group.name || 'group'}`
                        }
                        onClick={() => updateGroup(group.id, { open: !group.open })}
                      >
                        <ChevronDown
                          className={cn(
                            'size-4 text-muted-foreground transition-transform',
                            group.open && 'rotate-180',
                          )}
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={`Remove ${group.name || 'group'}`}
                        onClick={() =>
                          setDrafts((current) =>
                            current.filter((item) => item.id !== group.id),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {group.open ? (
                      <div className="mb-1 grid gap-0.5">
                        {group.categories.map((child) => (
                          <div
                            key={child.id}
                            data-scroll-id={child.id}
                            className="grid grid-cols-[minmax(0,1fr)_28px_28px] items-center gap-2 py-1 pr-2.5 pl-2.5"
                          >
                            <Input
                              className={cn(
                                'h-8 min-w-0 flex-1 ml-4',
                                GHOST_FIELD,
                              )}
                              value={child.name}
                              placeholder="Category"
                              aria-label="Category name"
                              onChange={(event) =>
                                updateGroup(group.id, {
                                  categories: group.categories.map((item) =>
                                    item.id === child.id
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                            <span />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0"
                              aria-label={`Remove ${child.name || 'category'}`}
                              onClick={() =>
                                updateGroup(group.id, {
                                  categories: group.categories.filter(
                                    (item) => item.id !== child.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        ))}
                        <div className="grid grid-cols-[minmax(0,1fr)_28px_28px] items-center gap-2 pr-2.5 pl-2.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground ml-4 h-8 justify-start px-2.5 hover:bg-transparent hover:text-foreground"
                            onClick={() => addCategory(group.id)}
                          >
                            <Plus className="size-3.5" />
                            Add category
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="relative z-20 items-center sm:justify-end sm:gap-4">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!dirty} onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              You have unsaved edits. If you cancel, that information will be
              lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={closeClean}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
