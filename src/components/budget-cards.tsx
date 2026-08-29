import { Fragment, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useBudget } from '@/lib/budget-context'
import {
  billsAccount,
  expenseCategories,
  formatDueDay,
  monthlyNeedForAccount,
  overflowAccount,
  totalForCategory,
  type AccountRole,
  type ExpenseCategory,
  type RecurringExpense,
} from '@/lib/budget'
import { formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDay(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return null
  return parsed
}

function categoryOptionLabel(id: ExpenseCategory) {
  if (id === 'recurring') return 'Recurring (water, gym, subscriptions)'
  if (id === 'variable') return 'Variable (spending, food)'
  return expenseCategories.find((item) => item.id === id)?.label ?? id
}

function DueDayInput({
  value,
  onChange,
  className,
  placeholder = 'Due day',
  ...props
}: {
  value: string
  onChange: (value: string) => void
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  function handleChange(next: string) {
    const digits = next.replace(/\D/g, '')
    if (digits === '') {
      onChange('')
      return
    }
    const day = Number.parseInt(digits, 10)
    if (day < 1 || day > 31) return
    onChange(String(day))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Backspace' || value === '') return
    event.preventDefault()
    onChange(value.slice(0, -1))
  }

  return (
    <Input
      className={className}
      inputMode="numeric"
      placeholder={placeholder}
      value={value ? formatDueDay(Number(value)) : ''}
      onChange={(event) => handleChange(event.target.value)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  )
}

function BankSelect({
  accounts,
  value,
  onChange,
  onAdded,
}: {
  accounts: { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
  onAdded?: (account: { id: string; name: string }) => void
}) {
  const { addAccount } = useBudget()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [bankName, setBankName] = useState('')

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!bankName.trim()) return
    const name = bankName.trim()
    const id = addAccount({
      name,
      kind: 'Checking',
      role: 'other',
    })
    onChange(id)
    onAdded?.({ id, name })
    setBankName('')
    setAdding(false)
    setOpen(false)
  }

  return (
    <Select
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setAdding(false)
          setBankName('')
        }
      }}
      value={value || undefined}
      onValueChange={onChange}
    >
      <SelectTrigger className="w-full" aria-label="Bank account">
        <SelectValue placeholder="Bank" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        {adding ? (
          <form
            className="grid gap-2 p-1"
            onSubmit={handleAdd}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Input
              autoFocus
              placeholder="Bank name"
              value={bankName}
              onChange={(event) => setBankName(event.target.value)}
              aria-label="Bank name"
            />
            <Button type="submit" size="sm">
              Add account
            </Button>
          </form>
        ) : (
          <button
            type="button"
            className="hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-default items-center rounded-md py-1 pr-8 pl-1.5 text-left text-sm outline-hidden"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setAdding(true)}
          >
            Add account
          </button>
        )}
      </SelectContent>
    </Select>
  )
}

function EmptyNote({ children }: { children: string }) {
  return <p className="text-muted-foreground text-sm">{children}</p>
}

function RowRemove({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      onClick={onClick}
    >
      <Trash2 />
    </Button>
  )
}

export function BudgetCards() {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <ExpensesCard />
      <AccountsCard />
      <DebtsCard />
      <ByAccountCard />
      <DepositsCard />
      <CalculationsCard />
    </section>
  )
}

function ExpensesCard() {
  const { accounts, expenses, addExpense } = useBudget()
  const [open, setOpen] = useState(false)
  const [viewAll, setViewAll] = useState(false)
  const [drawerCategory, setDrawerCategory] = useState<ExpenseCategory | null>(
    null,
  )
  const [name, setName] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [category, setCategory] = useState<ExpenseCategory | ''>('')
  const [pendingAccount, setPendingAccount] = useState<{
    id: string
    name: string
  } | null>(null)

  const total = expenses.reduce((sum, item) => sum + item.amount, 0)
  const bankOptions =
    pendingAccount && !accounts.some((account) => account.id === pendingAccount.id)
      ? [...accounts, pendingAccount]
      : accounts

  function resetExpenseForm() {
    setName('')
    setDueDay('')
    setAmount('')
    setCategory('')
    setAccountId(accounts[0]?.id ?? '')
    setPendingAccount(null)
  }

  function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseAmount(amount)
    const day = dueDay === '' ? null : parseDay(dueDay)
    const resolvedAccountId = accountId || bankOptions[0]?.id || ''
    if (!name.trim() || !category || parsed == null || parsed <= 0) return
    if (dueDay !== '' && day == null) return
    if (bankOptions.length > 0 && !resolvedAccountId) return
    addExpense({
      name: name.trim(),
      dueDay: day,
      amount: parsed,
      accountId: resolvedAccountId,
      category,
    })
    resetExpenseForm()
    setOpen(false)
  }

  return (
    <>
      <Card className="self-start">
        <CardHeader className="px-2.5">
          <div className="flex items-start justify-between gap-3 px-1.5">
            <CardTitle>Total monthly expenses</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={() => setOpen(true)}
            >
              Add expense
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid px-2.5">
          <p className="px-1.5 pb-6 text-2xl font-medium tabular-nums">
            {formatUsd(total)}
          </p>
          <div className="border-border border-t" />
          <div className="pt-4">
            <div
              className={cn(
                'grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4',
                viewAll ? 'gap-y-3' : 'gap-y-1',
              )}
            >
              {expenseCategories.map((item) => {
                const selected = drawerCategory === item.id
                const details = expenses.filter(
                  (expense) => expense.category === item.id,
                )
                return (
                  <div
                    key={item.id}
                    className="col-span-2 grid grid-cols-subgrid gap-y-1"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setDrawerCategory((current) =>
                          current === item.id ? null : item.id,
                        )
                      }
                      className={cn(
                        'hover-fill col-span-2 grid cursor-pointer grid-cols-subgrid items-baseline px-1.5 py-2 text-left',
                        viewAll ? 'rounded-[6px] bg-[#f6f6f6]' : 'rounded-lg',
                        selected && 'hover-fill-active',
                      )}
                    >
                      <span>{item.label}</span>
                      <span className="text-right tabular-nums">
                        {formatUsd(totalForCategory(expenses, item.id))}
                      </span>
                    </button>
                    {viewAll && details.length > 0
                      ? details.map((expense) => (
                          <Fragment key={expense.id}>
                            <span className="text-neutral-600 pl-3.5">
                              {expense.name}
                            </span>
                            <span className="pr-1.5 text-right text-neutral-600 tabular-nums">
                              {formatUsd(expense.amount)}
                            </span>
                          </Fragment>
                        ))
                      : null}
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex justify-end px-1.5">
              <button
                type="button"
                className="cursor-pointer bg-transparent p-0 text-sm"
                aria-expanded={viewAll}
                onClick={() => setViewAll((visible) => !visible)}
              >
                {viewAll ? 'Hide' : 'View all'}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) resetExpenseForm()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={handleAddExpense}>
            <Input
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Expense name"
            />
            <Select
              value={category || undefined}
              onValueChange={(value) => setCategory(value as ExpenseCategory)}
            >
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {expenseCategories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {categoryOptionLabel(item.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DueDayInput
              value={dueDay}
              onChange={setDueDay}
              aria-label="Due day of month"
            />
            <div className="relative">
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
                $
              </span>
              <Input
                className="pl-5"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-label="Monthly amount"
              />
            </div>
            <BankSelect
              accounts={bankOptions}
              value={accountId}
              onChange={setAccountId}
              onAdded={setPendingAccount}
            />
            <DialogFooter className="col-span-full">
              <Button type="submit">Add expense</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CategoryDrawer
        category={drawerCategory}
        onClose={() => setDrawerCategory(null)}
      />
    </>
  )
}

function CategoryDrawer({
  category,
  onClose,
}: {
  category: ExpenseCategory | null
  onClose: () => void
}) {
  const { expenses } = useBudget()
  const meta = expenseCategories.find((item) => item.id === category)
  const items = expenses.filter((item) => item.category === category)

  return (
    <Drawer
      direction="right"
      open={category != null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DrawerContent className="data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:w-max data-[vaul-drawer-direction=right]:max-w-[min(92vw,52rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(92vw,52rem)]">
        <DrawerHeader>
          <DrawerTitle>{meta?.label ?? 'Expenses'}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No expenses in this category yet.
            </p>
          ) : (
            <div className="grid min-w-[28rem] gap-4">
              {items.map((item) => (
                <ExpenseEditor key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function ExpenseEditor({ item }: { item: RecurringExpense }) {
  const { accounts, updateExpense, removeExpense } = useBudget()
  const [name, setName] = useState(item.name)
  const [dueDay, setDueDay] = useState(item.dueDay ? String(item.dueDay) : '')
  const [amount, setAmount] = useState(String(item.amount))

  useEffect(() => {
    setName(item.name)
    setDueDay(item.dueDay ? String(item.dueDay) : '')
    setAmount(String(item.amount))
  }, [item.id, item.name, item.dueDay, item.amount])

  function persistName() {
    const next = name.trim()
    if (!next) {
      setName(item.name)
      return
    }
    if (next !== item.name) updateExpense(item.id, { name: next })
  }

  function persistDueDay() {
    const day = dueDay === '' ? null : parseDay(dueDay)
    if (dueDay !== '' && day == null) {
      setDueDay(item.dueDay ? String(item.dueDay) : '')
      return
    }
    if (day !== item.dueDay) updateExpense(item.id, { dueDay: day })
  }

  function persistAmount() {
    const parsed = parseAmount(amount)
    if (parsed == null || parsed <= 0) {
      setAmount(String(item.amount))
      return
    }
    if (parsed !== item.amount) updateExpense(item.id, { amount: parsed })
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[minmax(8rem,1fr)_5.5rem_6.5rem_minmax(9rem,1fr)_auto] items-center gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={persistName}
          aria-label={`${item.name} name`}
        />
        <DueDayInput
          value={dueDay}
          onChange={setDueDay}
          onBlur={persistDueDay}
          aria-label={`${item.name} due day`}
        />
        <div className="relative">
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
            $
          </span>
          <Input
            className="pl-5"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={persistAmount}
            aria-label={`${item.name} amount`}
          />
        </div>
        <BankSelect
          accounts={accounts}
          value={item.accountId}
          onChange={(id) => updateExpense(item.id, { accountId: id })}
        />
        <RowRemove
          label={`Remove ${item.name}`}
          onClick={() => removeExpense(item.id)}
        />
      </div>
    </div>
  )
}

function AccountsCard() {
  const { accounts, addAccount, setAccountRole, removeAccount } = useBudget()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('Checking')
  const [role, setRole] = useState<AccountRole>('other')

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    addAccount({ name: name.trim(), kind: kind.trim() || 'Checking', role })
    setName('')
    setKind('Checking')
    setRole('other')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank accounts</CardTitle>
        <CardDescription>
          Mark one account as bills (Bank of America) and one as leftover
          (Discover) for the transfer math.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {accounts.length === 0 ? (
          <EmptyNote>No accounts yet.</EmptyNote>
        ) : (
          <div className="grid gap-3">
            {accounts.map((account, index) => (
              <div key={account.id}>
                {index > 0 ? <Separator className="mb-3" /> : null}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {account.kind}
                      {account.role === 'bills'
                        ? ' · Bills account'
                        : account.role === 'overflow'
                          ? ' · Leftover account'
                          : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select
                      value={account.role}
                      onValueChange={(value) =>
                        setAccountRole(account.id, value as AccountRole)
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`Role for ${account.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bills">Bills</SelectItem>
                        <SelectItem value="overflow">Leftover</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <RowRemove
                      label={`Remove ${account.name}`}
                      onClick={() => removeAccount(account.id)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={handleAdd}>
          <Input
            placeholder="Account name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Account name"
          />
          <Input
            placeholder="Type, like Checking"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-label="Account type"
          />
          <Select
            value={role}
            onValueChange={(value) => setRole(value as AccountRole)}
          >
            <SelectTrigger className="w-full" aria-label="Account role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bills">Bills</SelectItem>
              <SelectItem value="overflow">Leftover</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">
            <Plus data-icon="inline-start" />
            Add account
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function DebtsCard() {
  const { debts, addDebt, removeDebt } = useBudget()
  const [lender, setLender] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [minimum, setMinimum] = useState('')
  const [apr, setApr] = useState('')
  const [balance, setBalance] = useState('')

  const totalBalance = debts.reduce((sum, item) => sum + item.balance, 0)
  const totalMinimum = debts.reduce((sum, item) => sum + item.minimum, 0)

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const day = parseDay(dueDay)
    const min = parseAmount(minimum)
    const rate = parseAmount(apr)
    const owed = parseAmount(balance)
    if (
      !lender.trim() ||
      day == null ||
      min == null ||
      rate == null ||
      owed == null
    ) {
      return
    }
    addDebt({
      lender: lender.trim(),
      dueDay: day,
      minimum: min,
      apr: rate,
      balance: owed,
    })
    setLender('')
    setDueDay('')
    setMinimum('')
    setApr('')
    setBalance('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Debt</CardTitle>
        <CardDescription>
          Lender, due date, minimum, APR, and balance.{' '}
          {formatUsd(totalBalance)} owed · {formatUsd(totalMinimum)} minimum.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {debts.length === 0 ? (
          <EmptyNote>No debts yet.</EmptyNote>
        ) : (
          <div className="grid gap-3">
            {debts.map((item, index) => (
              <div key={item.id}>
                {index > 0 ? <Separator className="mb-3" /> : null}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.lender}</p>
                    <p className="text-muted-foreground text-xs">
                      Due {formatDueDay(item.dueDay)} · Min{' '}
                      {formatUsd(item.minimum)} · {item.apr}% APR
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="tabular-nums">
                      {formatUsd(item.balance)}
                    </span>
                    <RowRemove
                      label={`Remove ${item.lender}`}
                      onClick={() => removeDebt(item.id)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={handleAdd}>
          <Input
            placeholder="Lender"
            value={lender}
            onChange={(event) => setLender(event.target.value)}
            aria-label="Lender"
          />
          <Input
            type="number"
            min={1}
            max={31}
            placeholder="Due day"
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
            aria-label="Debt due day"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Minimum"
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
            aria-label="Minimum payment"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="APR"
            value={apr}
            onChange={(event) => setApr(event.target.value)}
            aria-label="APR percent"
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Balance"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            aria-label="Debt balance"
            className="sm:col-span-2"
          />
          <Button type="submit" className="sm:col-span-2">
            <Plus data-icon="inline-start" />
            Add debt
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ByAccountCard() {
  const { accounts, expenses } = useBudget()

  return (
    <Card>
      <CardHeader>
        <CardTitle>By account</CardTitle>
        <CardDescription>
          Bills pulling from each bank account this month.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {accounts.length === 0 ? (
          <EmptyNote>Add an account to group bills.</EmptyNote>
        ) : (
          accounts.map((account, index) => {
            const items = expenses.filter(
              (item) => item.accountId === account.id,
            )
            const need = monthlyNeedForAccount(expenses, account.id)
            return (
              <div key={account.id}>
                {index > 0 ? <Separator className="mb-4" /> : null}
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="font-medium">{account.name}</p>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {formatUsd(need)}
                  </p>
                </div>
                {items.length === 0 ? (
                  <EmptyNote>Nothing assigned here.</EmptyNote>
                ) : (
                  <div className="grid gap-1.5">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span>
                          {item.name}
                          {item.dueDay != null ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {formatDueDay(item.dueDay)}
                            </span>
                          ) : null}
                        </span>
                        <span className="tabular-nums">
                          {formatUsd(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function DepositsCard() {
  const { accounts, expenses, updateAccountBalance } = useBudget()
  const monthlyTotal = expenses.reduce((sum, item) => sum + item.amount, 0)
  const onHand = accounts.reduce((sum, account) => sum + account.balance, 0)

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Total deposits</CardTitle>
        <CardDescription>
          What is in each account versus what that account needs this month.{' '}
          {formatUsd(onHand)} on hand · {formatUsd(monthlyTotal)} in monthly
          bills.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {accounts.length === 0 ? (
          <EmptyNote>Add accounts to track deposits.</EmptyNote>
        ) : (
          accounts.map((account, index) => {
            const need = monthlyNeedForAccount(expenses, account.id)
            const difference = account.balance - need
            return (
              <div key={account.id}>
                {index > 0 ? <Separator className="mb-4" /> : null}
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-muted-foreground text-xs">
                      Needs {formatUsd(need)} this month
                    </p>
                  </div>
                  <div className="grid gap-1">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor={`balance-${account.id}`}
                    >
                      In account
                    </label>
                    <Input
                      id={`balance-${account.id}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={Number.isFinite(account.balance) ? account.balance : ''}
                      onChange={(event) => {
                        const parsed = parseAmount(event.target.value)
                        updateAccountBalance(account.id, parsed ?? 0)
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      'text-sm tabular-nums sm:text-right',
                      difference < 0
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {difference >= 0 ? 'Left ' : 'Short '}
                    {formatUsd(Math.abs(difference))}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function CalculationsCard() {
  const { accounts, expenses, updateAccountBalance } = useBudget()
  const bills = billsAccount(accounts)
  const overflow = overflowAccount(accounts)
  const need = bills ? monthlyNeedForAccount(expenses, bills.id) : 0
  const have = bills?.balance ?? 0
  const shortfall = Math.max(0, need - have)
  const overflowHave = overflow?.balance ?? 0
  const transfer = Math.min(shortfall, overflowHave)
  const leftover = overflowHave - transfer
  const stillShort = shortfall - transfer

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Calculations</CardTitle>
        <CardDescription>
          Fill in what is in Bank of America and Discover. Need comes from the
          bills assigned to the bills account.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="grid gap-3">
          <p className="font-medium">
            {bills?.name ?? 'Mark an account as Bills'}
          </p>
          {bills ? (
            <>
              <div className="grid gap-1">
                <label
                  className="text-muted-foreground text-xs"
                  htmlFor="bills-have"
                >
                  How much I have
                </label>
                <Input
                  id="bills-have"
                  type="number"
                  min={0}
                  step="0.01"
                  value={Number.isFinite(have) ? have : ''}
                  onChange={(event) => {
                    const parsed = parseAmount(event.target.value)
                    updateAccountBalance(bills.id, parsed ?? 0)
                  }}
                />
              </div>
              <CalcLine label="How much I need" value={formatUsd(need)} />
              <CalcLine
                label="Still need in this account"
                value={formatUsd(shortfall)}
                warn={shortfall > 0}
              />
            </>
          ) : (
            <EmptyNote>
              Set an account role to Bills to use this side.
            </EmptyNote>
          )}
        </div>
        <div className="grid gap-3">
          <p className="font-medium">
            {overflow?.name ?? 'Mark an account as Leftover'}
          </p>
          {overflow ? (
            <>
              <div className="grid gap-1">
                <label
                  className="text-muted-foreground text-xs"
                  htmlFor="overflow-have"
                >
                  How much I have
                </label>
                <Input
                  id="overflow-have"
                  type="number"
                  min={0}
                  step="0.01"
                  value={Number.isFinite(overflowHave) ? overflowHave : ''}
                  onChange={(event) => {
                    const parsed = parseAmount(event.target.value)
                    updateAccountBalance(overflow.id, parsed ?? 0)
                  }}
                />
              </div>
              <CalcLine
                label={`Transfer to ${bills?.name ?? 'bills account'}`}
                value={formatUsd(transfer)}
              />
              <CalcLine
                label="Left after the transfer"
                value={formatUsd(leftover)}
              />
              {stillShort > 0 ? (
                <CalcLine
                  label="Still short after transferring"
                  value={formatUsd(stillShort)}
                  warn
                />
              ) : null}
            </>
          ) : (
            <EmptyNote>
              Set an account role to Leftover to use this side.
            </EmptyNote>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CalcLine({
  label,
  value,
  warn = false,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', warn && 'text-destructive')}>
        {value}
      </span>
    </div>
  )
}
