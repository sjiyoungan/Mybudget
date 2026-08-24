import { useState, type FormEvent, type KeyboardEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
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
  const { accounts, expenses, addAccount, addExpense } = useBudget()
  const [open, setOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [name, setName] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [category, setCategory] = useState<ExpenseCategory>('recurring')
  const [bankName, setBankName] = useState('')
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
    setCategory('recurring')
    setAccountId(accounts[0]?.id ?? '')
    setPendingAccount(null)
  }

  function handleDueDayChange(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits === '') {
      setDueDay('')
      return
    }
    const day = Number.parseInt(digits, 10)
    if (day < 1 || day > 31) return
    setDueDay(String(day))
  }

  function handleDueDayKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Backspace' || dueDay === '') return
    event.preventDefault()
    setDueDay(dueDay.slice(0, -1))
  }

  function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const day = parseDay(dueDay)
    const parsed = parseAmount(amount)
    const resolvedAccountId = accountId || bankOptions[0]?.id || ''
    if (!name.trim() || day == null || parsed == null || parsed <= 0) return
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

  function handleAddAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!bankName.trim()) return
    const name = bankName.trim()
    const id = addAccount({
      name,
      kind: 'Checking',
      role: 'other',
    })
    setPendingAccount({ id, name })
    setAccountId(id)
    setBankName('')
    setAccountOpen(false)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>Total expenses</CardTitle>
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
        <CardContent className="grid gap-6">
          <div>
            <p className="text-2xl font-medium tabular-nums">
              {formatUsd(total)}
            </p>
            <p className="text-muted-foreground text-sm">Monthly</p>
          </div>
          <div className="grid gap-3">
            {expenseCategories.map((item) => (
              <div
                key={item.id}
                className="flex items-baseline justify-between gap-4"
              >
                <span>{item.label}</span>
                <span className="tabular-nums">
                  {formatUsd(totalForCategory(expenses, item.id))}
                </span>
              </div>
            ))}
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
              value={category}
              onValueChange={(value) => setCategory(value as ExpenseCategory)}
            >
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {expenseCategories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.id === 'recurring'
                      ? 'Recurring (water, gym, subscriptions)'
                      : item.id === 'variable'
                        ? 'Variable (spending, food)'
                        : item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="numeric"
              placeholder="Due day"
              value={dueDay ? formatDueDay(Number(dueDay)) : ''}
              onChange={(event) => handleDueDayChange(event.target.value)}
              onKeyDown={handleDueDayKeyDown}
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
            <div className="grid gap-2">
              <Select
                value={accountId || undefined}
                onValueChange={(value) => {
                  if (value) setAccountId(value)
                }}
                disabled={bankOptions.length === 0}
              >
                <SelectTrigger className="w-full" aria-label="Bank account">
                  <SelectValue placeholder="Bank" />
                </SelectTrigger>
                <SelectContent>
                  {bankOptions.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="bg-white"
                onClick={() => setAccountOpen(true)}
              >
                Add account
              </Button>
            </div>
            <DialogFooter className="col-span-full">
              <Button type="submit">Add expense</Button>
            </DialogFooter>
          </form>
        </DialogContent>
        <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add account</DialogTitle>
            </DialogHeader>
            <form className="grid gap-3" onSubmit={handleAddAccount}>
              <Input
                placeholder="Bank name"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                aria-label="Bank name"
              />
              <DialogFooter>
                <Button type="submit">Add account</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Dialog>
    </>
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
                          <span className="text-muted-foreground">
                            {' '}
                            · {formatDueDay(item.dueDay)}
                          </span>
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
