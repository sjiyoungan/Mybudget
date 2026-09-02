import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBudget } from '@/lib/budget-context'
import {
  formatDateWithoutYear,
  formatLongDate,
  formatUsd,
} from '@/lib/format'
import { useSpending } from '@/lib/spending-context'
import {
  sortSpendingTxns,
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

function padMonth(month: number) {
  return String(month).padStart(2, '0')
}

function monthKey(year: number, month: number) {
  return `${year}-${padMonth(month + 1)}`
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
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
  return categories.find((item) => item.id === categoryId)?.name ?? 'Uncategorized'
}

function defaultRuleMatch(description: string) {
  const tokens = description
    .replace(/[^A-Za-z0-9&.'+\- ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
  return tokens[0] ?? description.trim()
}

function availableMonthKeys(transactions: SpendingTxn[], now = new Date()) {
  const keys = new Set(transactions.map((txn) => txn.date.slice(0, 7)))
  keys.add(monthKey(now.getFullYear(), now.getMonth()))
  return [...keys].sort((left, right) => right.localeCompare(left))
}

export function SpendingPage() {
  const {
    transactions,
    categories,
    updateTransaction,
    removeTransaction,
    addCategory,
    addRule,
  } = useSpending()
  const { accounts } = useBudget()
  const months = useMemo(
    () => availableMonthKeys(transactions),
    [transactions],
  )
  const [month, setMonth] = useState(() => months[0])
  const selectedMonth = months.includes(month) ? month : (months[0] ?? month)
  const [editing, setEditing] = useState<SpendingTxn | null>(null)
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)

  const monthTxns = useMemo(
    () =>
      sortSpendingTxns(
        transactions.filter((txn) => txn.date.startsWith(`${selectedMonth}-`)),
      ),
    [selectedMonth, transactions],
  )
  const spentTxns = useMemo(
    () => monthTxns.filter((txn) => txn.amount > 0),
    [monthTxns],
  )
  const totalSpent = spentTxns.reduce((sum, txn) => sum + txn.amount, 0)
  const slices = useMemo(() => {
    const totals = new Map(categories.map((category) => [category.id, 0]))
    let uncategorized = 0
    for (const txn of spentTxns) {
      const key = txn.categoryId ?? ''
      if (key && totals.has(key)) {
        totals.set(key, (totals.get(key) ?? 0) + txn.amount)
      } else {
        uncategorized += txn.amount
      }
    }
    const rows = categories.map((category, index) => ({
      id: category.id,
      name: category.name,
      amount: totals.get(category.id) ?? 0,
      color: SLICE_COLORS[index % SLICE_COLORS.length],
    }))
    if (uncategorized > 0) {
      rows.push({
        id: '',
        name: 'Uncategorized',
        amount: uncategorized,
        color: 'var(--muted-foreground)',
      })
    }
    return rows.sort(
      (left, right) =>
        right.amount - left.amount || left.name.localeCompare(right.name),
    )
  }, [categories, spentTxns])
  const dayRows = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const txn of spentTxns) {
      byDay.set(txn.date, (byDay.get(txn.date) ?? 0) + txn.amount)
    }
    return [...byDay.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([date, amount]) => ({ date, amount }))
  }, [spentTxns])
  const dayTxns = useMemo(
    () => (dayKey ? monthTxns.filter((txn) => txn.date === dayKey) : []),
    [dayKey, monthTxns],
  )

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-medium">Spending</h1>
        <Select value={selectedMonth} onValueChange={setMonth}>
          <SelectTrigger
            aria-label="Spending month"
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
            {months.map((key) => (
              <SelectItem key={key} value={key} className="text-base">
                {monthLabel(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <CardTitle>Total expense</CardTitle>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddCategoryOpen(true)}
            >
              <Plus data-icon="inline-start" />
              Category
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-5">
          <p className="text-2xl font-medium tabular-nums">{formatUsd(totalSpent)}</p>
          <div className="flex flex-wrap items-center gap-6">
            <CategoryPie slices={slices} total={totalSpent} />
            <ul className="grid min-w-[12rem] flex-1 gap-2">
              {slices.map((slice) => (
                <li
                  key={slice.id || 'uncategorized'}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: slice.color }}
                  />
                  <span className="truncate">{slice.name}</span>
                  <span className="tabular-nums">{formatUsd(slice.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By day</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {dayRows.length === 0 ? (
            <p className="text-muted-foreground px-4 pb-2 text-sm">
              No purchase days in this month.
            </p>
          ) : (
            <ul>
              {dayRows.map((row) => (
                <li key={row.date} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
                    onClick={() => setDayKey(row.date)}
                  >
                    <span>{formatDateWithoutYear(row.date, 'short')}</span>
                    <span className="tabular-nums">{formatUsd(row.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {monthTxns.length === 0 ? (
            <p className="text-muted-foreground px-4 pb-2 text-sm">
              Upload a statement from the Upload menu to log purchases.
            </p>
          ) : (
            <ul>
              {monthTxns.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  txn={txn}
                  accounts={accounts}
                  categories={categories}
                  onClick={() => setEditing(txn)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Drawer
        direction="right"
        open={dayKey != null}
        onOpenChange={(open) => {
          if (!open) setDayKey(null)
        }}
      >
        <DrawerContent className="data-[vaul-drawer-direction=right]:h-full sm:max-w-md">
          <DrawerHeader>
            <DrawerTitle>
              {dayKey ? formatLongDate(dayKey) : 'Day'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
            {dayTxns.length === 0 ? (
              <p className="text-muted-foreground px-2 text-sm">
                No transactions on this day.
              </p>
            ) : (
              <ul>
                {dayTxns.map((txn) => (
                  <TransactionRow
                    key={txn.id}
                    txn={txn}
                    accounts={accounts}
                    categories={categories}
                    onClick={() => setEditing(txn)}
                  />
                ))}
              </ul>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <EditTxnDialog
        txn={editing}
        accounts={accounts}
        categories={categories}
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

      <AddCategoryDialog
        open={addCategoryOpen}
        onClose={() => setAddCategoryOpen(false)}
        onAdd={(name) => {
          addCategory(name)
          setAddCategoryOpen(false)
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
    <li className="border-b last:border-b-0">
      <button
        type="button"
        className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-2.5 text-left"
        onClick={onClick}
      >
        <span className="text-muted-foreground w-[4.5rem] shrink-0 text-xs">
          {formatDateWithoutYear(txn.date, 'short')}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {txn.merchant}
          <span className="text-muted-foreground ml-2 hidden text-xs sm:inline">
            {categoryName(txn.categoryId, categories)}
          </span>
        </span>
        <span className="text-muted-foreground hidden w-24 shrink-0 truncate text-xs sm:block">
          {accountName(txn.accountId, accounts)}
        </span>
        <span
          className={cn(
            'w-[5.5rem] shrink-0 text-right tabular-nums',
            txn.amount < 0 && 'text-muted-foreground',
          )}
        >
          {formatTxnAmount(txn.amount)}
        </span>
        <Pencil className="text-muted-foreground size-3.5 shrink-0" />
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
  const [merchant, setMerchant] = useState(txn.merchant)
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
                  {category.name}
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
            onSave(
              txn.id,
              {
                merchant: merchant.trim(),
                amount: signed,
                date,
                accountId,
                categoryId: nextCategory,
                customName: merchant.trim() !== txn.merchant ? true : txn.customName,
                customCategory:
                  nextCategory !== txn.categoryId ? true : txn.customCategory,
              },
              createRule
                ? {
                    match: match.trim(),
                    merchant: merchant.trim(),
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

function AddCategoryDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (name: string) => void
}) {
  const [name, setName] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName('')
          onClose()
        }
      }}
    >
      <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
        <form
          id="add-spending-category-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            onAdd(name.trim())
            setName('')
          }}
        >
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            className="mt-4"
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Category name"
          />
        </form>
        <DialogFooter className="sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="add-spending-category-form"
            type="submit"
            disabled={!name.trim()}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
