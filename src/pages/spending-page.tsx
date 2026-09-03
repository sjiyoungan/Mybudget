import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Pencil, Trash2 } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
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
import { formatDateWithoutYear, formatUsd } from '@/lib/format'
import { monthName } from '@/lib/income'
import { useSpending } from '@/lib/spending-context'
import {
  displayMerchant,
  isActiveSpendingCategory,
  isSpendingPurchase,
  sortSpendingTxns,
  toSentenceCase,
  type SpendingCategory,
  type SpendingTxn,
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

function budgetDeltaLabel(spent: number, budget: number) {
  const delta = Math.round((spent - budget) * 100) / 100
  if (Math.abs(delta) < 0.005) return `On budget · ${formatUsd(budget)}`
  if (delta > 0) return `${formatUsd(delta)} over ${formatUsd(budget)}`
  return `${formatUsd(-delta)} under ${formatUsd(budget)}`
}

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
  if (!categoryId) return 'Uncategorized'
  const name = categories.find((item) => item.id === categoryId)?.name
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
  } = useSpending()
  const { accounts, expenses, categories: expenseGroups } = useBudget()
  const activeCategories = useMemo(
    () => categories.filter(isActiveSpendingCategory),
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
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [editCategoriesOpen, setEditCategoriesOpen] = useState(false)

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
      const key = txn.categoryId ?? ''
      if (key && totals.has(key)) {
        totals.set(key, (totals.get(key) ?? 0) + txn.amount)
      } else {
        uncategorized += txn.amount
      }
    }
    const rows = activeCategories.map((category, index) => {
      const expense = category.expenseId
        ? expenses.find((item) => item.id === category.expenseId)
        : undefined
      return {
        id: category.id,
        name: toSentenceCase(category.name),
        amount: totals.get(category.id) ?? 0,
        budget: expense ? monthlyAmount(expense) : null,
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
  }, [activeCategories, expenses, spentTxns])
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

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-medium">Spending</h1>
        <Select
          value={String(selectedYear)}
          onValueChange={(value) => {
            const next = Number(value)
            setYear(next)
            setSelectedMonth(null)
            setExpandedDay(null)
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
                    setExpandedDay(null)
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
            <div>
              <p className="text-2xl font-medium tabular-nums">
                {formatUsd(totalSpent)}
              </p>
              {monthBudget > 0 ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  {budgetDeltaLabel(totalSpent, monthBudget)}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <CategoryPie slices={slices} total={totalSpent} />
              <ul className="grid min-w-[12rem] flex-1 gap-2">
                {slices.map((slice) => (
                  <li
                    key={slice.id || 'uncategorized'}
                    className="grid grid-cols-[auto_1fr_auto] items-start gap-x-2 gap-y-0.5 text-sm"
                  >
                    <span
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ background: slice.color }}
                    />
                    <span className="min-w-0">
                      <span className="break-words [overflow-wrap:anywhere]">
                        {slice.name}
                      </span>
                      {slice.budget != null ? (
                        <span className="text-muted-foreground block text-xs">
                          {budgetDeltaLabel(slice.amount, slice.budget)}
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums">{formatUsd(slice.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          {dayRows.map((row) => {
            const expanded = expandedDay === row.date
            return (
              <div key={row.date}>
                <button
                  type="button"
                  onClick={() => setExpandedDay(expanded ? null : row.date)}
                  className="hover-fill grid w-full cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                >
                  <span className={expanded ? 'font-medium' : undefined}>
                    {formatDateWithoutYear(row.date, 'short')}
                  </span>
                  <span className="tabular-nums">{formatUsd(row.amount)}</span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      expanded && 'rotate-180',
                    )}
                  />
                </button>
                {expanded ? (
                  <ul className="grid gap-0.5 py-1 pr-8 pl-[22px]">
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

      <EditTxnDialog
        txn={editing}
        accounts={accounts}
        categories={activeCategories}
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
  onClick,
}: {
  txn: SpendingTxn
  accounts: { id: string; name: string }[]
  categories: SpendingCategory[]
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className="hover-fill flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left"
        onClick={onClick}
      >
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
          {displayMerchant(txn)}
          <span className="text-muted-foreground ml-2 hidden text-xs sm:inline">
            {categoryName(txn.categoryId, categories)}
          </span>
        </span>
        <span className="text-muted-foreground hidden w-24 shrink-0 pt-0.5 text-xs sm:block">
          {accountName(txn.accountId, accounts)}
        </span>
        <span
          className={cn(
            'w-[5.5rem] shrink-0 pt-0.5 text-right tabular-nums',
            txn.amount < 0 && 'text-muted-foreground',
          )}
        >
          {formatTxnAmount(txn.amount)}
        </span>
        <Pencil className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      </button>
    </li>
  )
}

function EditTxnDialog({
  txn,
  accounts,
  categories,
  onClose,
  onSave,
  onDelete,
}: {
  txn: SpendingTxn | null
  accounts: { id: string; name: string }[]
  categories: SpendingCategory[]
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
  onSave,
  onDelete,
}: {
  txn: SpendingTxn
  accounts: { id: string; name: string }[]
  categories: SpendingCategory[]
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
  const [categoryId, setCategoryId] = useState(txn.categoryId ?? '')
  const [createRule, setCreateRule] = useState(false)
  const [match, setMatch] = useState(() => defaultRuleMatch(txn.description))
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
          {txn.description !== txn.merchant
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
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {toSentenceCase(category.name)}
                </SelectItem>
              ))}
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

type ExtraDraft = {
  id: string
  name: string
  enabled: boolean
}

function snapshotCategoryPicks(
  checked: string[],
  extras: ExtraDraft[],
) {
  return JSON.stringify({
    checked: [...checked].sort(),
    extras: extras.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      enabled: item.enabled,
    })),
  })
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
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [extras, setExtras] = useState<ExtraDraft[]>([])
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const nextChecked = categories
      .filter(
        (item) => item.expenseId && isActiveSpendingCategory(item),
      )
      .map((item) => item.expenseId as string)
    const nextExtras = categories
      .filter((item) => !item.expenseId)
      .map((item) => ({
        id: item.id,
        name: item.name,
        enabled: isActiveSpendingCategory(item),
      }))
    setCheckedIds(nextChecked)
    setExtras(nextExtras)
    setBaseline(snapshotCategoryPicks(nextChecked, nextExtras))
    setConfirmOpen(false)
  }, [categories, open])

  const dirty = snapshotCategoryPicks(checkedIds, extras) !== baseline
  const checked = new Set(checkedIds)

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

  function toggleExpense(id: string) {
    setCheckedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  function addBlank() {
    setExtras((current) => [
      ...current,
      { id: crypto.randomUUID(), name: '', enabled: true },
    ])
  }

  function handleSave() {
    const next: SpendingCategory[] = []
    for (const expense of lines) {
      const existing = categories.find((item) => item.expenseId === expense.id)
      if (checked.has(expense.id)) {
        next.push({
          id: existing?.id ?? crypto.randomUUID(),
          name: toSentenceCase(expense.name),
          expenseId: expense.id,
        })
      } else if (existing) {
        next.push({
          id: existing.id,
          name: toSentenceCase(expense.name),
          expenseId: expense.id,
          enabled: false,
        })
      }
    }
    for (const extra of extras) {
      const name = toSentenceCase(extra.name)
      if (!name) continue
      next.push({
        id: extra.id,
        name,
        ...(extra.enabled ? {} : { enabled: false }),
      })
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
          className="w-max max-w-[calc(100%-2rem)] gap-0 p-4 sm:max-w-md"
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
                onClick={addBlank}
              >
                Add category
              </Button>
            </div>
          </div>

          <div className="no-scrollbar max-h-[min(70vh,40rem)] overflow-y-auto py-3">
            <ul className="grid gap-0.5">
              {lines.map((expense) => {
                const on = checked.has(expense.id)
                return (
                  <li key={expense.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleExpense(expense.id)}
                      className="hover-fill grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-4 rounded-lg py-2 pr-2.5 pl-2.5 text-left"
                    >
                      <span className={on ? 'font-medium' : undefined}>
                        {toSentenceCase(expense.name)}
                      </span>
                      <span className="flex size-5 items-center justify-center">
                        {on ? (
                          <Check className="size-4 text-neutral-500" />
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {extras.length > 0 ? (
              <ul className="mt-3 grid gap-1.5 border-t pt-3">
                {extras.map((extra) => (
                  <li
                    key={extra.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 px-2.5"
                  >
                    <Input
                      value={extra.name}
                      placeholder="Name"
                      aria-label="Category name"
                      onChange={(event) =>
                        setExtras((current) =>
                          current.map((item) =>
                            item.id === extra.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={extra.enabled}
                      aria-label={`Show ${extra.name || 'category'} on the pie`}
                      className="flex size-8 cursor-pointer items-center justify-center"
                      onClick={() =>
                        setExtras((current) =>
                          current.map((item) =>
                            item.id === extra.id
                              ? { ...item, enabled: !item.enabled }
                              : item,
                          ),
                        )
                      }
                    >
                      {extra.enabled ? (
                        <Check className="size-4 text-neutral-500" />
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${extra.name || 'category'}`}
                      onClick={() =>
                        setExtras((current) =>
                          current.filter((item) => item.id !== extra.id),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
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
