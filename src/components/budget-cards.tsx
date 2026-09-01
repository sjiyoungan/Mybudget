import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Menu,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Card,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MetricStrip } from '@/components/metric-strip'
import { useBudget } from '@/lib/budget-context'
import { averageMonthlyNet, currentMonthNet } from '@/lib/income'
import { usePaystubs } from '@/lib/paystub-context'
import {
  accountDepositNeed,
  billsAccount,
  billedAmountFromMonthly,
  chargeExpensesForDebt,
  chargesForDebt,
  hiddenChargeExpensesForDebt,
  depositLinesForAccount,
  monthlyAmount,
  monthlyDepositNeed,
  normalizeAccountKind,
  overflowAccount,
  paymentWithoutCharges,
  roundCents,
  DEBT_CATEGORY_ID,
  MORTGAGE_CATEGORY_ID,
  VARIABLE_CATEGORY_ID,
  isCreditCardDebt,
  normalizeDebtType,
  ceilCents,
  ceilDollars,
  formatPromoEndsOn,
  formatPromoSummary,
  parsePromoEndsOn,
  promoEndYearMonth,
  totalDebtPayments,
  totalForCategory,
  totalMonthlyExpenses,
  totalMonthlyExpensesExcluding,
  shownMonthlyPayment,
  storedAmountFromShownPayment,
  isDebtExpense,
  type AccountKind,
  type Debt,
  type DebtType,
  type ExpenseFrequency,
  type RecurringExpense,
} from '@/lib/budget'
import {
  loadDebtPlan,
  payoffMonth,
  plannedCurrentBalances,
  projectDebtPlan,
  sortDebtsByPayoff,
  withLiveMonthlyBudget,
  type PlannerMonth,
} from '@/lib/debt-plan'
import { formatUsd, formatUsdNumber, formatUsdWholeNumberUp, formatUsdWholeUp } from '@/lib/format'
import { cn } from '@/lib/utils'

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function parseDay(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return null
  return parsed
}

function outsideEventTarget(event: {
  target: EventTarget | null
  detail?: { originalEvent?: Event }
}) {
  const original = event.detail?.originalEvent?.target
  if (original instanceof EventTarget) return original
  return event.target
}

function isPortaledMenuTarget(target: EventTarget | null) {
  const node =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  if (!node) return false
  return (
    node.closest('[data-slot="select-content"]') != null ||
    node.closest('[data-slot="dropdown-menu-content"]') != null ||
    node.closest('[data-slot="popover-content"]') != null ||
    node.closest('[data-radix-popper-content-wrapper]') != null ||
    node.closest('[role="listbox"]') != null
  )
}

function editDialogDismiss(
  blocked: boolean,
  requestClose: () => void,
) {
  return {
    onFocusOutside: (event: { preventDefault: () => void }) => {
      event.preventDefault()
    },
    onPointerDownOutside: (event: {
      preventDefault: () => void
      target: EventTarget | null
      detail?: { originalEvent?: Event }
    }) => {
      event.preventDefault()
      if (blocked) return
      if (document.visibilityState === 'hidden') return
      if (isPortaledMenuTarget(outsideEventTarget(event))) return
      requestClose()
    },
    onInteractOutside: (event: { preventDefault: () => void }) => {
      event.preventDefault()
    },
  }
}

const EDIT_GHOST_FIELD =
  'edit-ghost-field border-transparent bg-transparent shadow-none transition-colors hover:bg-transparent focus-visible:ring-0 focus-visible:ring-transparent dark:bg-transparent dark:hover:bg-transparent'

const EDIT_GHOST_BOX =
  'edit-ghost-box rounded-lg border border-transparent transition-colors'

const DEBT_LABEL_LEFT = 'pl-2.5'
const DEBT_LABEL_RIGHT = 'pr-2.5 text-right'
const DEBT_LABEL_APR = 'pr-6 text-right'

function AprInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className={cn('flex h-8 items-center justify-end px-2.5', EDIT_GHOST_BOX)}>
      <input
        className="placeholder:text-muted-foreground h-full min-w-0 w-auto max-w-full bg-transparent text-right text-sm tabular-nums outline-none [field-sizing:content]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        inputMode="decimal"
        aria-label="APR"
        size={Math.max(value.length, 1)}
      />
      <span className="text-neutral-400 shrink-0 pl-0.5 text-sm">%</span>
    </div>
  )
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function promoDateInputValue(endsOn: string) {
  const parsed = parsePromoEndsOn(endsOn)
  if (!parsed) return endsOn
  return formatPromoEndsOn(parsed, true)
}

function PromoField({
  apr,
  endsOn,
  onChange,
}: {
  apr: string
  endsOn: string
  onChange: (next: { apr?: string; endsOn?: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [dateText, setDateText] = useState(promoDateInputValue(endsOn))
  const parsedEnd = promoEndYearMonth(endsOn)
  const [cursor, setCursor] = useState(() => new Date())

  useEffect(() => {
    if (!open) return
    setDateText(promoDateInputValue(endsOn))
    const end = promoEndYearMonth(endsOn)
    setCursor(end ? new Date(end.year, end.month, 1) : new Date())
  }, [open, endsOn])

  const summary = formatPromoSummary(
    apr.trim() === '' ? null : parseAmount(apr),
    parsePromoEndsOn(endsOn),
  )
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const selectedDay = parsedEnd?.day ?? null
  const selectedThisMonth =
    parsedEnd != null && parsedEnd.year === year && parsedEnd.month === month

  function commitDate(raw: string) {
    const parsed = parsePromoEndsOn(raw)
    if (raw.trim() === '') {
      onChange({ endsOn: '' })
      setDateText('')
      return
    }
    if (parsed == null) {
      setDateText(raw)
      return
    }
    onChange({ endsOn: parsed })
    setDateText(formatPromoEndsOn(parsed, true))
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 w-full items-center px-1.5 text-left text-sm',
            EDIT_GHOST_BOX,
          )}
          aria-label="Promo"
        >
          <span className="min-w-0 truncate tabular-nums">{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs">Rate</label>
            <div
              className={cn(
                'flex h-8 w-24 items-center justify-end border px-2',
                'rounded-lg',
              )}
            >
              <input
                className="h-full min-w-0 w-full bg-transparent text-right text-sm tabular-nums outline-none"
                value={apr}
                onChange={(event) => onChange({ apr: event.target.value })}
                placeholder="0"
                inputMode="decimal"
                aria-label="Promo rate"
                autoFocus
              />
              <span className="text-neutral-400 shrink-0 pl-0.5 text-sm">%</span>
            </div>
            <label className="text-muted-foreground text-xs">Ends</label>
            <input
              className="h-8 w-28 rounded-lg border bg-transparent px-2 text-sm outline-none"
              value={dateText}
              onChange={(event) => setDateText(event.target.value)}
              onBlur={() => commitDate(dateText)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitDate(dateText)
                }
              }}
              placeholder="12/26"
              aria-label="Promo end date"
            />
          </div>
          <div className="w-[15.5rem]">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className="hover-fill flex size-7 items-center justify-center rounded-md"
                aria-label="Previous month"
                onClick={() => setCursor(new Date(year, month - 1, 1))}
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className="text-sm font-medium">
                {cursor.toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
              <button
                type="button"
                className="hover-fill flex size-7 items-center justify-center rounded-md"
                aria-label="Next month"
                onClick={() => setCursor(new Date(year, month + 1, 1))}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {WEEKDAYS.map((day) => (
                <span
                  key={day}
                  className="text-muted-foreground text-[0.65rem] font-medium"
                >
                  {day}
                </span>
              ))}
              {Array.from({ length: startWeekday }, (_, index) => (
                <span key={`e-${index}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const day = index + 1
                const selected = selectedThisMonth && selectedDay === day
                const monthSelected = selectedThisMonth && selectedDay == null
                return (
                  <button
                    key={day}
                    type="button"
                    className={cn(
                      'hover-fill mx-auto flex size-7 items-center justify-center rounded-md text-sm tabular-nums',
                      selected && 'bg-foreground text-background hover:bg-foreground',
                      monthSelected && 'bg-[#f0f0f0]',
                    )}
                    onClick={() => {
                      const next = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      onChange({ endsOn: next })
                      setDateText(formatPromoEndsOn(next, true))
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function formatMoneyField(value: string) {
  if (value.trim() === '') return ''
  const parsed = parseAmount(value)
  if (parsed == null) return value
  return formatUsdNumber(parsed)
}

function DebtMoneyInput({
  value,
  onChange,
  ariaLabel,
  title,
  roundUp = false,
  whole = false,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  title?: string
  roundUp?: boolean
  whole?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(value)
  useEffect(() => {
    if (!focused) setText(value)
  }, [value, focused])

  function commit(raw: string) {
    if (raw.trim() === '') {
      if (value !== '') onChange('')
      return
    }
    const parsed = parseAmount(raw)
    if (parsed == null) {
      onChange(raw)
      return
    }
    const next = whole
      ? ceilDollars(parsed)
      : roundUp
        ? ceilCents(parsed)
        : parsed
    const current = parseAmount(value)
    if (current != null) {
      const same = whole
        ? ceilDollars(current) === next
        : roundCents(current) === roundCents(next)
      if (same) return
    }
    onChange(whole ? formatUsdWholeNumberUp(next) : formatUsdNumber(next))
  }

  const parsedValue = parseAmount(value)
  const display = focused
    ? text
    : whole
      ? parsedValue == null
        ? value
        : formatUsdWholeNumberUp(parsedValue)
      : formatMoneyField(value)
  return (
    <div className={cn('flex h-8 items-center justify-end px-2.5', EDIT_GHOST_BOX)}>
      <span className="text-neutral-400 shrink-0 pr-0.5 text-sm">$</span>
      <input
        className="placeholder:text-muted-foreground h-full min-w-0 w-auto max-w-full bg-transparent text-right text-sm tabular-nums outline-none [field-sizing:content]"
        value={display}
        title={title}
        size={Math.max(display.length, 4)}
        onFocus={() => {
          setFocused(true)
          setText(value)
        }}
        onBlur={() => {
          setFocused(false)
          commit(text)
        }}
        onChange={(event) => {
          setText(event.target.value)
          onChange(event.target.value)
        }}
        placeholder={whole ? '0' : '0.00'}
        inputMode={whole ? 'numeric' : 'decimal'}
        aria-label={ariaLabel}
      />
    </div>
  )
}

function DebtMoneyDisplay({
  amount,
  ariaLabel,
  whole = false,
  muted = false,
}: {
  amount: number
  ariaLabel: string
  whole?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex h-8 cursor-default items-center justify-end px-2.5 text-sm tabular-nums',
        muted && 'text-neutral-400',
      )}
      aria-label={ariaLabel}
    >
      <span className="text-neutral-400 shrink-0 pr-0.5">$</span>
      <span>{whole ? formatUsdWholeNumberUp(amount) : formatUsdNumber(amount)}</span>
    </div>
  )
}

function chargeLineAmount(expense: RecurringExpense) {
  return ceilDollars(monthlyAmount(expense))
}

function ChargesBreakdown({
  amount,
  items,
  hiddenItems,
}: {
  amount: number
  items: RecurringExpense[]
  hiddenItems: RecurringExpense[]
}) {
  const hasDetail = items.length > 0 || hiddenItems.length > 0
  const body = (
    <div
      className={cn(
        'flex h-8 w-full items-center justify-end px-2.5 text-sm tabular-nums text-neutral-400',
        hasDetail && 'cursor-pointer',
      )}
      aria-label="Charges"
    >
      <span className="text-neutral-400 shrink-0 pr-0.5">$</span>
      <span>{formatUsdWholeNumberUp(amount)}</span>
    </div>
  )
  if (!hasDetail) return body
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full min-w-0">
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-muted-foreground mb-2 text-xs font-medium">
          Expenses on this card
        </p>
        <div className="grid gap-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-baseline gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="tabular-nums text-neutral-600">
                {formatUsdWholeUp(chargeLineAmount(item))}
              </span>
            </div>
          ))}
          {hiddenItems.map((item) => (
            <div
              key={item.id}
              className="flex items-baseline gap-2 text-sm opacity-60"
            >
              <EyeOff className="text-muted-foreground size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="tabular-nums text-neutral-600">
                {formatUsdWholeUp(chargeLineAmount(item))}
              </span>
            </div>
          ))}
        </div>
        {hiddenItems.length > 0 ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Hidden expenses are not included in Charges.
          </p>
        ) : null}
        {items.length > 0 ? (
          <div className="mt-2 flex items-baseline gap-2 border-t pt-2 text-sm">
            <span className="min-w-0 flex-1">Charges</span>
            <span className="tabular-nums">{formatUsdWholeUp(amount)}</span>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function DebtColRule() {
  return (
    <span
      className="bg-border -my-1 block min-h-8 w-px justify-self-center self-stretch"
      aria-hidden
    />
  )
}

function DebtTypeSelect({
  value,
  onChange,
  quiet = false,
}: {
  value: DebtType
  onChange: (value: DebtType) => void
  quiet?: boolean
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next === value) return
        onChange(next as DebtType)
      }}
    >
      <SelectTrigger
        className={cn('h-8 w-full', quiet && EDIT_GHOST_FIELD)}
        chevron="hover"
        aria-label="Debt type"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="credit-card">Credit card</SelectItem>
        <SelectItem value="loan">Loan</SelectItem>
      </SelectContent>
    </Select>
  )
}

function BankSelect({
  accounts,
  value,
  onChange,
  onAdded,
  includeCards = true,
  quiet = false,
  hideLastFour = false,
  ariaLabel = 'Bank account',
  placeholder = 'Bank',
}: {
  accounts: {
    id: string
    name: string
    lastFour?: string
    kind?: string
  }[]
  value: string
  onChange: (id: string) => void
  onAdded?: (account: { id: string; name: string }) => void
  includeCards?: boolean
  quiet?: boolean
  hideLastFour?: boolean
  ariaLabel?: string
  placeholder?: string
}) {
  const { addAccount, debts } = useBudget()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [bankName, setBankName] = useState('')
  const checking = accounts.filter(
    (account) => normalizeAccountKind(account.kind) === 'checking',
  )
  const cards = includeCards
    ? debts.filter((debt) => isCreditCardDebt(debt))
    : []

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!bankName.trim()) return
    const name = bankName.trim()
    const id = addAccount({
      name,
      kind: 'checking',
      role: 'other',
    })
    onChange(id)
    onAdded?.({ id, name })
    setBankName('')
    setAdding(false)
    setOpen(false)
  }

  function accountOption(account: {
    id: string
    name: string
    lastFour?: string
  }) {
    return (
      <SelectItem key={account.id} value={account.id}>
        {account.lastFour && !hideLastFour
          ? `${account.name} \u00b7 ${account.lastFour}`
          : account.name}
      </SelectItem>
    )
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
      onValueChange={(id) => {
        if (id === value) return
        onChange(id)
      }}
    >
      <SelectTrigger
        className={cn('w-full', quiet && EDIT_GHOST_FIELD)}
        chevron="hover"
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Checking</SelectLabel>
          {checking.map(accountOption)}
        </SelectGroup>
        {includeCards ? (
          <SelectGroup>
            <SelectLabel>Credit card</SelectLabel>
            {cards.map((debt) => (
              <SelectItem key={debt.id} value={debt.id}>
                {debt.lender}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
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

type CategoryDraft = {
  id: string
  name: string
}

type ExpenseDraft = {
  id: string
  name: string
  amount: string
  frequency: ExpenseFrequency
  dueDay: string
  category: string
  accountId: string
  hidden: boolean
}

const EXPENSE_ROW =
  'grid-cols-[minmax(7rem,12rem)_5.75rem_6.75rem_4.75rem_minmax(7rem,1fr)_28px_28px]' as const

function ExpenseColumnLabels() {
  return (
    <>
      <span className={cn(DEBT_LABEL_LEFT, 'w-full')}>Name</span>
      <span className={cn(DEBT_LABEL_RIGHT, 'w-full')}>Amount</span>
      <span className={cn(DEBT_LABEL_LEFT, 'w-full')}>Frequency</span>
      <span className={cn(DEBT_LABEL_RIGHT, 'w-full')}>Due day</span>
      <span className={cn(DEBT_LABEL_LEFT, 'w-full')}>Bank</span>
      <span />
      <span />
    </>
  )
}

function newExpenseDraft(accountId: string, category = ''): ExpenseDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    amount: '',
    frequency: 'monthly',
    dueDay: '',
    category,
    accountId,
    hidden: false,
  }
}

function expenseToDraft(item: RecurringExpense): ExpenseDraft {
  return {
    id: item.id,
    name: item.name,
    amount: String(item.amount),
    frequency: item.frequency,
    dueDay: item.dueDay ? String(item.dueDay) : '',
    category: item.category,
    accountId: item.accountId,
    hidden: item.hidden === true,
  }
}

function expenseToEditorDraft(
  item: RecurringExpense,
  expenses: RecurringExpense[],
  debts: Debt[],
): ExpenseDraft {
  const draft = expenseToDraft(item)
  if (!isDebtExpense(item)) return draft
  return {
    ...draft,
    amount: String(
      billedAmountFromMonthly(
        shownMonthlyPayment(item, expenses, debts),
        item.frequency,
      ),
    ),
  }
}

function draftAmountToStore(
  draft: ExpenseDraft,
  expenses: RecurringExpense[],
  debts: Debt[],
) {
  const parsed = parseAmount(draft.amount) ?? 0
  const existing = expenses.find((item) => item.id === draft.id)
  if (!existing || !isDebtExpense(existing)) return ceilDollars(parsed)
  return storedAmountFromShownPayment(
    monthlyAmount({ amount: ceilDollars(parsed), frequency: draft.frequency }),
    existing,
    expenses,
    debts,
    draft.frequency,
  )
}

function editorSnapshot(
  categories: CategoryDraft[],
  drafts: ExpenseDraft[],
) {
  return JSON.stringify({
    categories: categories.map((item) => ({
      id: item.id,
      name: item.name.trim(),
    })),
    drafts: drafts.map((draft) => ({
      id: draft.id,
      name: draft.name.trim(),
      amount: draft.amount.trim(),
      frequency: draft.frequency,
      dueDay: draft.dueDay.trim(),
      category: draft.category,
      accountId: draft.accountId,
      hidden: draft.hidden,
    })),
  })
}

function isDueDayInvalid(dueDay: string) {
  if (dueDay.trim() === '') return false
  return parseDay(dueDay) == null
}

function draftHasData(draft: ExpenseDraft) {
  return (
    draft.name.trim() !== '' ||
    draft.amount.trim() !== '' ||
    draft.dueDay.trim() !== ''
  )
}

function draftIsComplete(draft: ExpenseDraft, categoryIds: Set<string>) {
  const amount = parseAmount(draft.amount)
  return (
    draft.name.trim() !== '' &&
    categoryIds.has(draft.category) &&
    amount != null &&
    amount > 0 &&
    !isDueDayInvalid(draft.dueDay)
  )
}

function reorderDraft(
  drafts: ExpenseDraft[],
  draftId: string,
  category: string,
  targetId?: string,
) {
  const from = drafts.findIndex((item) => item.id === draftId)
  if (from < 0) return drafts
  const item = drafts[from]
  if (!item) return drafts
  const updated = { ...item, category }

  if (targetId && targetId !== draftId) {
    const to = drafts.findIndex((entry) => entry.id === targetId)
    if (to < 0) return drafts
    const next = [...drafts]
    next.splice(from, 1)
    next.splice(to, 0, updated)
    if (
      item.category === category &&
      next.every((entry, index) => entry.id === drafts[index]?.id)
    ) {
      return drafts
    }
    return next
  }

  const next = [...drafts]
  next.splice(from, 1)
  let insertAt = next.length
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i]?.category === category) {
      insertAt = i + 1
      break
    }
  }
  if (from === insertAt && item.category === category) return drafts
  next.splice(insertAt, 0, updated)
  return next
}

function ordinalSuffix(day: number) {
  const j = day % 10
  const k = day % 100
  if (j === 1 && k !== 11) return 'st'
  if (j === 2 && k !== 12) return 'nd'
  if (j === 3 && k !== 13) return 'rd'
  return 'th'
}

function MoneyInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="w-full">
      <DebtMoneyInput
        value={value}
        onChange={onChange}
        ariaLabel="Amount"
        roundUp
        whole
      />
    </div>
  )
}

function ModalDueDayInput({
  value,
  onChange,
  onCommit,
  invalid = false,
}: {
  value: string
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  invalid?: boolean
}) {
  const day = parseDay(value)
  return (
    <div
      className={cn(
        'flex h-8 w-full items-center justify-end rounded-lg border px-2.5',
        invalid
          ? 'border-destructive focus-within:border-destructive'
          : EDIT_GHOST_BOX,
      )}
    >
      <input
        className="h-full w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
        onBlur={(event) => onCommit?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        }}
        inputMode="numeric"
        aria-label="Due day"
      />
      {day != null ? (
        <span className="text-muted-foreground shrink-0 text-[10px] leading-none">
          {ordinalSuffix(day)}
        </span>
      ) : null}
    </div>
  )
}

function CategoryDropGroup({
  categoryId,
  active,
  children,
}: {
  categoryId?: string
  active: boolean
  children: ReactNode
}) {
  return (
    <section
      data-category-id={categoryId}
      className={cn(
        'space-y-1 rounded-lg py-1',
        active && 'bg-neutral-50 ring-1 ring-neutral-200',
      )}
    >
      {children}
    </section>
  )
}

function FrequencySelect({
  value,
  onChange,
}: {
  value: ExpenseFrequency
  onChange: (value: ExpenseFrequency) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next === value) return
        onChange(next as ExpenseFrequency)
      }}
    >
      <SelectTrigger className={cn('w-full', EDIT_GHOST_FIELD)} chevron="hover" aria-label="Frequency">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="monthly">Monthly</SelectItem>
        <SelectItem value="annual">Annual</SelectItem>
      </SelectContent>
    </Select>
  )
}

function ExpenseDraftRow({
  draft,
  accounts,
  dragging,
  dueDayError,
  drafts,
  setDueDayError,
  onUpdate,
  onRemove,
  onMovePointerDown,
  canRemove,
  autoFocus = false,
  showHandle = true,
}: {
  draft: ExpenseDraft
  accounts: { id: string; name: string }[]
  dragging: boolean
  dueDayError: boolean
  drafts: ExpenseDraft[]
  setDueDayError: (value: boolean) => void
  onUpdate: (id: string, patch: Partial<ExpenseDraft>) => void
  onRemove: () => void
  onMovePointerDown: (event: { button: number; preventDefault: () => void }, id: string) => void
  canRemove: boolean
  autoFocus?: boolean
  showHandle?: boolean
}) {
  return (
    <div
      data-draft-id={draft.id}
      className={cn(
        'group/row relative grid items-center gap-2 py-0.5 pr-4 pl-4',
        EXPENSE_ROW,
        dragging && 'opacity-50',
        draft.hidden && 'opacity-50',
      )}
    >
      {showHandle ? (
        <button
          type="button"
          data-drag-handle
          aria-label={`Move ${draft.name || 'expense'}`}
          onPointerDown={(event) => onMovePointerDown(event, draft.id)}
          onMouseDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            onMovePointerDown(event, draft.id)
          }}
          className="text-neutral-400 hover:text-foreground group/handle absolute inset-y-0 left-0 z-10 flex w-4 cursor-grab items-center justify-center touch-none active:cursor-grabbing"
        >
          <Menu className="size-3.5 opacity-0 group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-active/handle:opacity-100" />
        </button>
      ) : null}
      <Input
        className={cn('h-8', EDIT_GHOST_FIELD)}
        value={draft.name}
        onChange={(event) => onUpdate(draft.id, { name: event.target.value })}
        placeholder="Name"
        aria-label="Expense name"
        autoFocus={autoFocus}
      />
      <MoneyInput
        value={draft.amount}
        onChange={(value) => onUpdate(draft.id, { amount: value })}
      />
      <FrequencySelect
        value={draft.frequency}
        onChange={(frequency) => onUpdate(draft.id, { frequency })}
      />
      <ModalDueDayInput
        value={draft.dueDay}
        invalid={dueDayError && isDueDayInvalid(draft.dueDay)}
        onChange={(value) => {
          onUpdate(draft.id, { dueDay: value })
          if (dueDayError) {
            setDueDayError(
              drafts.some((item) =>
                isDueDayInvalid(item.id === draft.id ? value : item.dueDay),
              ),
            )
          }
        }}
        onCommit={(value) => {
          setDueDayError(
            drafts.some((item) =>
              isDueDayInvalid(item.id === draft.id ? value : item.dueDay),
            ),
          )
        }}
      />
      <BankSelect
        accounts={accounts}
        value={draft.accountId}
        onChange={(id) => onUpdate(draft.id, { accountId: id })}
        quiet
        hideLastFour
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground justify-self-end hover:bg-transparent"
        onClick={() => onUpdate(draft.id, { hidden: !draft.hidden })}
        aria-label={draft.hidden ? 'Show expense' : 'Hide expense'}
        aria-pressed={draft.hidden}
      >
        {draft.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground justify-self-end hover:bg-transparent"
        disabled={!canRemove}
        onClick={onRemove}
        title="Remove expense"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

function EditExpensesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, categories, expenses, debts, replaceCategories, replaceExpenses } =
    useBudget()
  const defaultAccountId = accounts[0]?.id ?? ''
  const linkedDebtIds = useMemo(
    () => new Set(debts.map((debt) => debt.id)),
    [debts],
  )
  const [categoryDrafts, setCategoryDrafts] = useState<CategoryDraft[]>([])
  const [drafts, setDrafts] = useState<ExpenseDraft[]>([])
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [dueDayError, setDueDayError] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropCategoryId, setDropCategoryId] = useState<string | null>(null)
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [focusDraftId, setFocusDraftId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listWrapRef = useRef<HTMLDivElement>(null)
  const pendingScrollCategoryId = useRef<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const moveDraftUnderPointerRef = useRef<(x: number, y: number) => void>(() => {})
  const stopDragListenersRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const nextCategories = categories.map((item) => ({ ...item }))
    const nextDrafts = expenses.map((item) =>
      expenseToEditorDraft(item, expenses, debts),
    )
    setCategoryDrafts(nextCategories)
    setDrafts(nextDrafts)
    setBaseline(editorSnapshot(nextCategories, nextDrafts))
    setConfirmOpen(false)
    setRemoveId(null)
    setDueDayError(false)
    setDraggingId(null)
    setDropCategoryId(null)
    draggingIdRef.current = null
    stopDragListenersRef.current?.()
    stopDragListenersRef.current = null
    setAddCategoryOpen(false)
    setNewCategoryName('')
    setFocusDraftId(null)
    pendingScrollCategoryId.current = null
  }, [open])

  useLayoutEffect(() => {
    const id = pendingScrollCategoryId.current
    if (!id) return
    pendingScrollCategoryId.current = null
    const node = listRef.current?.querySelector(
      `[data-category-id="${id}"]`,
    )
    node?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [categoryDrafts])

  useLayoutEffect(() => {
    if (!focusDraftId) return
    const node = listRef.current?.querySelector(
      `[data-draft-id="${focusDraftId}"]`,
    )
    node?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusDraftId])

  useLayoutEffect(() => {
    if (!open) return
    let cancelled = false
    function updateMoreBelow() {
      if (cancelled) return
      const el = listRef.current
      const wrap = listWrapRef.current
      if (!el || !wrap) return
      wrap.toggleAttribute(
        'data-more',
        el.scrollHeight - el.scrollTop - el.clientHeight > 2,
      )
    }
    function waitForNodes() {
      if (cancelled) return
      if (!listRef.current || !listWrapRef.current) {
        requestAnimationFrame(waitForNodes)
        return
      }
      updateMoreBelow()
    }
    waitForNodes()
    const el = listRef.current
    if (!el) return () => {
      cancelled = true
    }
    const resize = new ResizeObserver(updateMoreBelow)
    resize.observe(el)
    const mutation = new MutationObserver(updateMoreBelow)
    mutation.observe(el, { childList: true, subtree: true })
    el.addEventListener('scroll', updateMoreBelow, { passive: true })
    return () => {
      cancelled = true
      resize.disconnect()
      mutation.disconnect()
      el.removeEventListener('scroll', updateMoreBelow)
    }
  }, [open, drafts, categoryDrafts])

  const namedCategoryIds = useMemo(
    () =>
      new Set(
        categoryDrafts
          .filter((item) => item.name.trim() !== '')
          .map((item) => item.id),
      ),
    [categoryDrafts],
  )
  const dirty = useMemo(
    () => editorSnapshot(categoryDrafts, drafts) !== baseline,
    [categoryDrafts, drafts, baseline],
  )
  const canSubmit =
    dirty &&
    !drafts.some((draft) => isDueDayInvalid(draft.dueDay)) &&
    drafts.filter(draftHasData).every((draft) =>
      draftIsComplete(draft, namedCategoryIds),
    )
  const removeTarget = removeId
    ? drafts.find((draft) => draft.id === removeId)
    : undefined
  const uncategorized = drafts.filter(
    (draft) => !categoryDrafts.some((item) => item.id === draft.category),
  )

  function updateDraft(id: string, patch: Partial<ExpenseDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    )
  }

  function addExpenseToCategory(categoryId: string) {
    const draft = newExpenseDraft(defaultAccountId, categoryId)
    setFocusDraftId(draft.id)
    setDrafts((current) => [...current, draft])
  }

  function handleAddCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return
    const id = crypto.randomUUID()
    pendingScrollCategoryId.current = id
    setCategoryDrafts((current) => [...current, { id, name }])
    setNewCategoryName('')
    setAddCategoryOpen(false)
  }

  function closeClean() {
    setConfirmOpen(false)
    setRemoveId(null)
    setAddCategoryOpen(false)
    setNewCategoryName('')
    onOpenChange(false)
  }

  function requestClose() {
    if (confirmOpen || removeId || addCategoryOpen) return
    if (dirty) {
      setConfirmOpen(true)
      return
    }
    closeClean()
  }

  function requestRemove(id: string) {
    const draft = drafts.find((item) => item.id === id)
    if (!draft) return
    const existed = expenses.some((item) => item.id === id)
    if (existed || draftHasData(draft)) {
      setRemoveId(id)
      return
    }
    setDrafts((current) => current.filter((item) => item.id !== id))
  }

  function handleSave() {
    if (!canSubmit) return
    const nextCategories = categoryDrafts
      .filter((item) => item.name.trim() !== '')
      .map((item) => ({ id: item.id, name: item.name.trim() }))
    const allowed = new Set(nextCategories.map((item) => item.id))
    replaceCategories(nextCategories)
    replaceExpenses(
      drafts
        .filter((draft) => draftIsComplete(draft, allowed))
        .map((draft) => ({
          id: draft.id,
          name: draft.name.trim(),
          dueDay: draft.dueDay === '' ? null : parseDay(draft.dueDay),
          amount: draftAmountToStore(draft, expenses, debts),
          frequency: draft.frequency,
          accountId: draft.accountId,
          category: draft.category,
          hidden: draft.hidden,
        })),
    )
    closeClean()
  }

  function canDropInCategory(id: string, categoryId: string) {
    return !(linkedDebtIds.has(id) && categoryId !== DEBT_CATEGORY_ID)
  }

  function handleMovePointerDown(
    event: { button: number; preventDefault: () => void },
    id: string,
  ) {
    if (event.button !== 0) return
    event.preventDefault()
    draggingIdRef.current = id
    setDraggingId(id)
    if (stopDragListenersRef.current) return

    function onMove(moveEvent: { clientX: number; clientY: number }) {
      moveDraftUnderPointerRef.current(moveEvent.clientX, moveEvent.clientY)
    }
    function onUp() {
      stopDragListenersRef.current?.()
      stopDragListenersRef.current = null
      draggingIdRef.current = null
      setDraggingId(null)
      setDropCategoryId(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('pointercancel', onUp)
    stopDragListenersRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }

  function moveDraftUnderPointer(clientX: number, clientY: number) {
    const id = draggingIdRef.current
    if (!id) return
    const el = document.elementFromPoint(clientX, clientY)
    if (!(el instanceof Element)) return
    const row = el.closest('[data-draft-id]')
    const section = el.closest('[data-category-id]')
    const categoryId = section?.getAttribute('data-category-id') ?? ''
    if (!canDropInCategory(id, categoryId)) return
    setDropCategoryId(categoryId)
    const targetId = row?.getAttribute('data-draft-id')
    if (targetId && targetId !== id) {
      setDrafts((current) => reorderDraft(current, id, categoryId, targetId))
      return
    }
    if (section && !row) {
      setDrafts((current) => {
        const item = current.find((draft) => draft.id === id)
        if (item?.category === categoryId) return current
        return reorderDraft(current, id, categoryId)
      })
    }
  }

  moveDraftUnderPointerRef.current = moveDraftUnderPointer

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true)
        }}
      >
        <DialogContent
          className="w-max max-w-[calc(100%-2rem)] gap-0 p-4 sm:max-w-none"
          showCloseButton={false}
          {...editDialogDismiss(
            confirmOpen || removeId != null || addCategoryOpen,
            requestClose,
          )}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            if (addCategoryOpen) {
              setAddCategoryOpen(false)
              return
            }
            if (removeId) {
              setRemoveId(null)
              return
            }
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
                  Edit expenses
                </DialogTitle>
              </DialogHeader>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() => {
                  setNewCategoryName('')
                  setAddCategoryOpen(true)
                }}
              >
                Add category
              </Button>
            </div>
          </div>

          <div
            ref={listWrapRef}
            className="scroll-more relative -mx-4 mt-5"
          >
          <div
            ref={listRef}
            onScroll={() => {
              const el = listRef.current
              const wrap = listWrapRef.current
              if (!el || !wrap) return
              wrap.toggleAttribute(
                'data-more',
                el.scrollHeight - el.scrollTop - el.clientHeight > 2,
              )
            }}
            className={cn(
              'no-scrollbar max-h-[min(70vh,40rem)] space-y-4 overflow-y-auto',
              draggingId && 'select-none',
            )}
          >
            <div
              className={cn(
                'bg-popover sticky top-0 z-10 grid gap-2 pb-1 pr-4 pl-4 text-xs font-medium text-muted-foreground',
                EXPENSE_ROW,
              )}
            >
              <ExpenseColumnLabels />
            </div>

            {uncategorized.length > 0 ? (
              <CategoryDropGroup
                categoryId=""
                active={dropCategoryId === ''}
              >
                <div>
                  <p className="text-muted-foreground pl-4 text-sm font-semibold">
                    <span className="pl-2.5">Uncategorized</span>
                  </p>
                  <div className="bg-border mx-4 mt-1.5 h-px" aria-hidden />
                </div>
                {uncategorized.map((draft) => (
                  <ExpenseDraftRow
                    key={draft.id}
                    draft={draft}
                    accounts={accounts}
                    dragging={draggingId === draft.id}
                    dueDayError={dueDayError}
                    drafts={drafts}
                    setDueDayError={setDueDayError}
                    onUpdate={updateDraft}
                    onRemove={() => requestRemove(draft.id)}
                    onMovePointerDown={handleMovePointerDown}
                    canRemove={drafts.length > 1}
                    autoFocus={focusDraftId === draft.id}
                  />
                ))}
              </CategoryDropGroup>
            ) : null}

            {categoryDrafts.map((category) => {
              const items = drafts.filter(
                (draft) => draft.category === category.id,
              )
              return (
                <CategoryDropGroup
                  key={category.id}
                  categoryId={category.id}
                  active={dropCategoryId === category.id}
                >
                  <div>
                    <div className="flex items-center gap-2 pl-4">
                    <p className="pl-2.5 text-sm font-semibold">{category.name}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        EDIT_GHOST_FIELD,
                        'text-neutral-500 hover:bg-transparent hover:text-neutral-700',
                      )}
                      aria-label={`Add expense to ${category.name}`}
                      onClick={() => addExpenseToCategory(category.id)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    </div>
                    <div className="bg-border mx-4 mt-1.5 h-px" aria-hidden />
                  </div>
                  {items.map((draft) => (
                    <ExpenseDraftRow
                      key={draft.id}
                      draft={draft}
                      accounts={accounts}
                      dragging={draggingId === draft.id}
                      dueDayError={dueDayError}
                      drafts={drafts}
                      setDueDayError={setDueDayError}
                      onUpdate={updateDraft}
                      onRemove={() => requestRemove(draft.id)}
                      onMovePointerDown={handleMovePointerDown}
                      canRemove={drafts.length > 1}
                      autoFocus={focusDraftId === draft.id}
                      showHandle={!linkedDebtIds.has(draft.id)}
                    />
                  ))}
                  {items.length === 0 ? (
                    <p className="text-muted-foreground py-2 pl-4 text-xs">
                      <span className="pl-2.5">Drop an expense here</span>
                    </p>
                  ) : null}
                </CategoryDropGroup>
              )
            })}

            {dueDayError ? (
              <p className="text-destructive px-4 text-xs">
                Due day can&apos;t be more than the days in a month.
              </p>
            ) : null}
          </div>
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
            <Button type="button" disabled={!canSubmit} onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addCategoryOpen}
        onOpenChange={(next) => {
          setAddCategoryOpen(next)
          if (!next) setNewCategoryName('')
        }}
      >
        <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
          <form id="add-category-form" onSubmit={handleAddCategory}>
            <DialogHeader>
              <DialogTitle>Add category</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              className="mt-4"
              placeholder="Name"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              aria-label="Category name"
            />
          </form>
          <DialogFooter className="sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddCategoryOpen(false)
                setNewCategoryName('')
              }}
            >
              Cancel
            </Button>
            <Button
              form="add-category-form"
              type="submit"
              disabled={!newCategoryName.trim()}
            >
              Add
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

      <Dialog
        open={!!removeId}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRemoveId(null)
        }}
      >
        <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove expense?</DialogTitle>
            <DialogDescription>
              {removeTarget?.name
                ? `Removing â€œ${removeTarget.name}â€ will delete it from this list.`
                : 'Removing this expense will delete it from this list.'}
              {removeId && linkedDebtIds.has(removeId)
                ? ' It will also be removed from Debt.'
                : ''}{' '}
              This can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveId(null)}
            >
              Keep expense
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!removeId) return
                setDrafts((current) =>
                  current.filter((item) => item.id !== removeId),
                )
                setRemoveId(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function oneExpenseSnapshot(draft: ExpenseDraft) {
  return JSON.stringify({
    name: draft.name.trim(),
    amount: draft.amount.trim(),
    frequency: draft.frequency,
    dueDay: draft.dueDay.trim(),
    category: draft.category,
    accountId: draft.accountId,
    hidden: draft.hidden,
  })
}

function EditOneExpenseDialog({
  expenseId,
  onOpenChange,
}: {
  expenseId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, categories, expenses, debts, updateExpense, removeExpense } =
    useBudget()
  const expense = expenses.find((item) => item.id === expenseId)
  const linkedDebt = expense?.category === DEBT_CATEGORY_ID
  const [draft, setDraft] = useState<ExpenseDraft | null>(null)
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [dueDayError, setDueDayError] = useState(false)

  useLayoutEffect(() => {
    if (!expenseId || !expense) {
      setDraft(null)
      setBaseline('')
      setConfirmOpen(false)
      setRemoveOpen(false)
      setDueDayError(false)
      return
    }
    const next = expenseToEditorDraft(expense, expenses, debts)
    setDraft(next)
    setBaseline(oneExpenseSnapshot(next))
    setConfirmOpen(false)
    setRemoveOpen(false)
    setDueDayError(false)
  }, [expenseId])

  useEffect(() => {
    if (expenseId != null && expense == null) {
      onOpenChange(false)
    }
  }, [expense, expenseId, onOpenChange])

  const namedCategoryIds = useMemo(
    () => new Set(categories.map((item) => item.id)),
    [categories],
  )
  const dirty = draft != null && oneExpenseSnapshot(draft) !== baseline
  const canSubmit =
    draft != null &&
    dirty &&
    !isDueDayInvalid(draft.dueDay) &&
    draftIsComplete(draft, namedCategoryIds)

  function closeClean() {
    setConfirmOpen(false)
    setRemoveOpen(false)
    onOpenChange(false)
  }

  function requestClose() {
    if (confirmOpen || removeOpen) return
    if (dirty) {
      setConfirmOpen(true)
      return
    }
    closeClean()
  }

  function handleSave() {
    if (!draft || !canSubmit) return
    updateExpense(draft.id, {
      name: draft.name.trim(),
      dueDay: draft.dueDay === '' ? null : parseDay(draft.dueDay),
      amount: draftAmountToStore(draft, expenses, debts),
      frequency: draft.frequency,
      accountId: draft.accountId,
      category: draft.category,
      hidden: draft.hidden,
    })
    closeClean()
  }

  const open = expenseId != null && draft != null

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true)
        }}
      >
        <DialogContent
          className="w-max max-w-[calc(100%-2rem)] gap-0 pt-4 pr-4 pb-4 pl-6 sm:max-w-none"
          showCloseButton={false}
          {...editDialogDismiss(confirmOpen || removeOpen, requestClose)}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            if (removeOpen) {
              setRemoveOpen(false)
              return
            }
            if (confirmOpen) {
              setConfirmOpen(false)
              return
            }
            requestClose()
          }}
        >
          <div className="-ml-6 -mr-4 border-b px-6 pr-4 pb-4">
            <DialogHeader>
              <DialogTitle className="text-2xl tracking-tight">
                Edit expense
              </DialogTitle>
            </DialogHeader>
          </div>

          {draft ? (
            <div className="mt-5 space-y-4">
              <div className="grid max-w-56 gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Category
                </span>
                <Select
                  value={draft.category}
                  onValueChange={(category) =>
                    setDraft((current) =>
                      current ? { ...current, category } : current,
                    )
                  }
                  disabled={linkedDebt}
                >
                  <SelectTrigger
                    className={EDIT_GHOST_FIELD}
                    chevron="hover"
                    aria-label="Category"
                  >
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={cn(
                  'grid gap-2 text-xs font-medium text-muted-foreground',
                  EXPENSE_ROW,
                )}
              >
                <ExpenseColumnLabels />
              </div>

              <ExpenseDraftRow
                draft={draft}
                accounts={accounts}
                dragging={false}
                dueDayError={dueDayError}
                drafts={[draft]}
                setDueDayError={setDueDayError}
                onUpdate={(_id, patch) =>
                  setDraft((current) =>
                    current ? { ...current, ...patch } : current,
                  )
                }
                onRemove={() => setRemoveOpen(true)}
                onMovePointerDown={() => {}}
                canRemove
                showHandle={false}
              />

              {dueDayError ? (
                <p className="text-destructive text-xs">
                  Due day can&apos;t be more than the days in a month.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="-ml-6 -mr-4 mt-5 items-center px-6 py-4 sm:justify-end sm:gap-4">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={handleSave}>
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

      <Dialog
        open={removeOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRemoveOpen(false)
        }}
      >
        <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove expense?</DialogTitle>
            <DialogDescription>
              {draft?.name
                ? `Removing â€œ${draft.name}â€ will delete it from this list.`
                : 'Removing this expense will delete it from this list.'}
              {linkedDebt
                ? ' It will also be removed from Debt.'
                : ''}{' '}
              This can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveOpen(false)}
            >
              Keep expense
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!draft) return
                removeExpense(draft.id)
                closeClean()
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ExpenseAmountEdit({
  expense,
  editing,
  onEdit,
  muted,
}: {
  expense: RecurringExpense
  editing: boolean
  onEdit: (id: string | null) => void
  muted?: boolean
}) {
  const { expenses, debts, updateExpense } = useBudget()
  const monthly = shownMonthlyPayment(expense, expenses, debts)
  const [draft, setDraft] = useState(() => String(ceilDollars(monthly)))
  const draftRef = useRef(draft)
  const skipCommit = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const monthlyRef = useRef(monthly)
  const frequencyRef = useRef(expense.frequency)
  const updateRef = useRef(updateExpense)
  const expenseRef = useRef(expense)
  const expensesRef = useRef(expenses)
  const debtsRef = useRef(debts)
  draftRef.current = draft
  monthlyRef.current = monthly
  frequencyRef.current = expense.frequency
  updateRef.current = updateExpense
  expenseRef.current = expense
  expensesRef.current = expenses
  debtsRef.current = debts

  useEffect(() => {
    if (!editing) return
    skipCommit.current = false
    setDraft(String(ceilDollars(monthly)))
  }, [editing, monthly])

  useEffect(() => {
    if (!editing) return
    const node = inputRef.current
    if (!node) return
    node.focus()
    node.select()
  }, [editing])

  useEffect(() => {
    if (!editing) return
    return () => {
      if (skipCommit.current) return
      const parsed = parseAmount(draftRef.current)
      const next =
        parsed != null && parsed >= 0 ? ceilDollars(parsed) : null
      if (next != null && next !== ceilDollars(monthlyRef.current)) {
        updateRef.current(expense.id, {
          amount: storedAmountFromShownPayment(
            next,
            expenseRef.current,
            expensesRef.current,
            debtsRef.current,
            frequencyRef.current,
          ),
        })
      }
    }
  }, [editing, expense.id])

  useEffect(() => {
    if (!editing) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (wrapRef.current?.contains(target)) return
      onEdit(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [editing, onEdit])

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          'cursor-text w-full text-right tabular-nums',
          muted && 'text-neutral-600',
        )}
        onClick={(event) => {
          event.stopPropagation()
          onEdit(expense.id)
        }}
      >
        {formatUsdWholeUp(shownMonthlyPayment(expense, expenses, debts))}
      </button>
    )
  }

  return (
    <div
      ref={wrapRef}
      className="focus-within:border-ring focus-within:ring-ring/30 ml-auto flex h-7 w-[5.75rem] items-center rounded-lg border border-input px-1.5 hover:border-neutral-400 focus-within:ring-3"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="pr-1 text-sm text-neutral-500">$</span>
      <input
        ref={inputRef}
        className="h-full w-full bg-transparent text-right text-sm tabular-nums outline-none"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onEdit(null)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            skipCommit.current = true
            onEdit(null)
          }
        }}
        inputMode="decimal"
        aria-label={`${expense.name} amount`}
      />
    </div>
  )
}

function EmptyNote({ children }: { children: string }) {
  return <p className="text-muted-foreground text-sm">{children}</p>
}

export function ExpenseDetailCards() {
  const { expenses } = useBudget()
  const total = totalMonthlyExpenses(expenses)
  const withoutMortgage = totalMonthlyExpensesExcluding(expenses, [
    MORTGAGE_CATEGORY_ID,
    DEBT_CATEGORY_ID,
  ])
  const withoutMortgageOrVariable = totalMonthlyExpensesExcluding(expenses, [
    MORTGAGE_CATEGORY_ID,
    VARIABLE_CATEGORY_ID,
    DEBT_CATEGORY_ID,
  ])
  const withoutVariable = totalMonthlyExpensesExcluding(expenses, [
    VARIABLE_CATEGORY_ID,
    DEBT_CATEGORY_ID,
  ])

  return (
    <div className="grid gap-6">
      <MetricStrip>
        <ExpenseMetric label="Total expenses" amount={total} />
        <ExpenseMetric label="w/o mortgage" amount={withoutMortgage} />
        <ExpenseMetric
          label="w/o mortgage plus variables"
          amount={withoutMortgageOrVariable}
        />
        <ExpenseMetric label="w/o variables" amount={withoutVariable} />
      </MetricStrip>

      <section className="grid items-start gap-6 lg:grid-cols-2">
        <ExpensesCard />
        <div className="grid gap-6">
          <DebtExpensesCard />
          <AccountsCard />
        </div>
      </section>
    </div>
  )
}

function ExpenseMetric({
  label,
  amount,
}: {
  label: string
  amount: number
}) {
  return (
    <div>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-4 text-2xl font-normal tabular-nums">
        {formatUsdWholeUp(amount)}
      </p>
    </div>
  )
}

function ExpensesCard() {
  return (
    <CategoryExpensesCard
      title="Total monthly expenses"
      mode="expenses"
    />
  )
}

function DebtExpensesCard() {
  return <CategoryExpensesCard title="Debt" mode="debt" />
}

function ExpenseLine({
  expense,
  editingAmount,
  onEditAmount,
  onEditName,
  nested,
}: {
  expense: RecurringExpense
  editingAmount: boolean
  onEditAmount: (id: string | null) => void
  onEditName: (id: string) => void
  nested?: boolean
}) {
  return (
    <>
      <button
        type="button"
        className={cn(
          'cursor-pointer text-left',
          nested
            ? 'pl-1 text-neutral-600 hover:text-foreground'
            : 'py-2',
        )}
        onClick={() => {
          onEditAmount(null)
          onEditName(expense.id)
        }}
      >
        {expense.name}
      </button>
      <div
        className={
          nested
            ? 'w-full text-right'
            : 'flex w-full items-baseline justify-end py-2'
        }
      >
        <ExpenseAmountEdit
          expense={expense}
          editing={editingAmount}
          onEdit={onEditAmount}
          muted={nested}
        />
      </div>
    </>
  )
}

function CategoryExpensesCard({
  title,
  mode,
}: {
  title: string
  mode: 'expenses' | 'debt'
}) {
  const { categories, expenses, debts } = useBudget()
  const [open, setOpen] = useState(false)
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null)
  const [amountEditId, setAmountEditId] = useState<string | null>(null)

  const shownCategories = categories.filter((item) =>
    mode === 'debt'
      ? item.id === DEBT_CATEGORY_ID
      : item.id !== DEBT_CATEGORY_ID,
  )
  const debtItems = expenses.filter(
    (expense) => expense.category === DEBT_CATEGORY_ID && !expense.hidden,
  )
  const total =
    mode === 'debt'
      ? debtItems.reduce(
          (sum, expense) =>
            sum + shownMonthlyPayment(expense, expenses, debts),
          0,
        )
      : totalMonthlyExpensesExcluding(expenses, [DEBT_CATEGORY_ID])

  return (
    <>
      <Card className="self-start">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>{title}</CardTitle>
            <CardGearButton
              label={mode === 'debt' ? 'Edit debts' : 'Edit expenses'}
              onClick={() => setOpen(true)}
            />
          </div>
        </CardHeader>
        <CardContent className="grid">
          <p className="pb-4 text-2xl font-medium tabular-nums">
            {formatUsdWholeUp(total)}
          </p>
          <div className="border-border border-t" />
          <div className="pt-2">
            {mode === 'debt' ? (
              <div className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4">
                {debtItems.length === 0 ? (
                  <div className="col-span-2">
                    <EmptyNote>No debt payments yet.</EmptyNote>
                  </div>
                ) : (
                  debtItems.map((expense) => (
                    <ExpenseLine
                      key={expense.id}
                      expense={expense}
                      editingAmount={amountEditId === expense.id}
                      onEditAmount={setAmountEditId}
                      onEditName={setEditExpenseId}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-3">
                {shownCategories.map((item) => {
                  const details = expenses.filter(
                    (expense) =>
                      expense.category === item.id && !expense.hidden,
                  )
                  return (
                    <div
                      key={item.id}
                      className="col-span-2 grid grid-cols-subgrid"
                    >
                      <div className="col-span-2 grid grid-cols-subgrid items-baseline py-2">
                        <span>{item.name}</span>
                        <span className="text-right tabular-nums">
                          {formatUsdWholeUp(totalForCategory(expenses, item.id))}
                        </span>
                      </div>
                      {details.length > 0 ? (
                        <div className="col-span-2 grid grid-cols-subgrid items-center gap-y-1 rounded-[6px] bg-[#f6f6f6] py-1">
                          {details.map((expense) => (
                            <ExpenseLine
                              key={expense.id}
                              expense={expense}
                              editingAmount={amountEditId === expense.id}
                              onEditAmount={setAmountEditId}
                              onEditName={setEditExpenseId}
                              nested
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {mode === 'debt' ? (
        <EditDebtsDialog open={open} onOpenChange={setOpen} />
      ) : (
        <EditExpensesDialog open={open} onOpenChange={setOpen} />
      )}
      <EditOneExpenseDialog
        expenseId={editExpenseId}
        onOpenChange={(next) => {
          if (!next) setEditExpenseId(null)
        }}
      />
    </>
  )
}

function AccountLabel({
  name,
  lastFour,
}: {
  name: string
  lastFour?: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{name}</span>
      {lastFour ? (
        <>
          <span
            aria-hidden
            className="bg-foreground size-1 shrink-0 rounded-full"
          />
          <span className="tabular-nums">{lastFour}</span>
        </>
      ) : null}
    </span>
  )
}

const amountColClass = 'w-20 shrink-0 text-right tabular-nums'
const lastFourColClass = 'w-[4.75rem] shrink-0 tabular-nums'
const ACCOUNT_EDIT_GRID =
  'grid grid-cols-[minmax(10rem,16rem)_5.5rem_7rem_28px] items-center gap-2'

export function CardGearButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="gear-button inline-flex size-7 items-center justify-center rounded-md text-foreground"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Settings className="size-4" />
    </button>
  )
}

function AmountCols({
  left,
  right,
  header = false,
}: {
  left: string
  right: string
  header?: boolean
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 gap-6',
        header && 'text-muted-foreground text-xs font-medium',
      )}
    >
      <span className={amountColClass}>{left}</span>
      <span className={amountColClass}>{right}</span>
    </div>
  )
}

function DebtListRow({
  creditor,
  minimum,
  balance,
  paidOff,
  header = false,
}: {
  creditor: string
  minimum: string
  balance: string
  paidOff: string
  header?: boolean
}) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-4 items-baseline',
        header
          ? 'text-muted-foreground text-xs font-medium uppercase'
          : 'py-2',
      )}
    >
      <span className="min-w-0 truncate">{creditor}</span>
      <span className={cn('text-right', !header && 'tabular-nums')}>
        {minimum}
      </span>
      <span className={cn('text-right', !header && 'tabular-nums')}>
        {balance}
      </span>
      <span
        className={cn(
          'whitespace-nowrap text-right',
          !header && 'tabular-nums',
        )}
      >
        {paidOff}
      </span>
    </div>
  )
}

function AccountsCard() {
  const { accounts, expenses, debts } = useBudget()
  const { paystubs } = usePaystubs()
  const [open, setOpen] = useState(false)
  const [drawerAccount, setDrawerAccount] = useState<string | null>(null)
  const listed = useMemo(
    () => accounts.filter((account) => account.kind === 'checking'),
    [accounts],
  )
  const monthlyNet = useMemo(
    () => averageMonthlyNet(paystubs, new Date().getFullYear()),
    [paystubs],
  )

  return (
    <>
      <Card className="self-start">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>Deposits</CardTitle>
            <CardGearButton
              label="Edit accounts"
              onClick={() => setOpen(true)}
            />
          </div>
        </CardHeader>
        <CardContent className="grid">
          <div className="grid gap-y-1">
              <div className="flex items-baseline">
                <span className="text-muted-foreground min-w-0 flex-1 text-xs font-medium">
                  Account name
                </span>
                <span
                  className={cn(
                    lastFourColClass,
                    'text-muted-foreground mr-6 text-xs font-medium',
                  )}
                >
                  Last four
                </span>
                <AmountCols header left="Bi-weekly" right="Monthly" />
              </div>
              {listed.map((account) => {
                const selected = drawerAccount === account.id
                const need = accountDepositNeed(
                  expenses,
                  debts,
                  account,
                  accounts,
                  monthlyNet,
                )
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() =>
                      setDrawerAccount((current) =>
                        current === account.id ? null : account.id,
                      )
                    }
                    className={cn(
                      'hover-fill flex w-full cursor-pointer items-baseline rounded-lg py-2 text-left',
                      selected && 'hover-fill-active',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {account.name}
                    </span>
                    <span
                      className={cn(
                        lastFourColClass,
                        'text-muted-foreground mr-6',
                      )}
                    >
                      {account.lastFour || ''}
                    </span>
                    <AmountCols
                      left={formatUsdWholeUp(need / 2)}
                      right={formatUsdWholeUp(need)}
                    />
                  </button>
                )
              })}
            </div>
        </CardContent>
      </Card>

      <EditAccountsDialog open={open} onOpenChange={setOpen} />

      <AccountDrawer
        accountId={drawerAccount}
        onClose={() => setDrawerAccount(null)}
      />
    </>
  )
}

type AccountDraft = {
  id: string
  name: string
  lastFour: string
  kind: AccountKind
  leftover: boolean
}

function accountSnapshot(drafts: AccountDraft[]) {
  return JSON.stringify(
    drafts.map((draft) => ({
      id: draft.id,
      name: draft.name.trim(),
      lastFour: draft.lastFour,
      kind: draft.kind,
      leftover: draft.leftover,
    })),
  )
}

function EditAccountsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, replaceAccounts } = useBudget()
  const [drafts, setDrafts] = useState<AccountDraft[]>([])
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const next = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      lastFour: account.lastFour,
      kind: account.kind,
      leftover: account.role === 'overflow',
    }))
    setDrafts(next)
    setBaseline(accountSnapshot(next))
    setConfirmOpen(false)
    setRemoveId(null)
    setFocusId(null)
  }, [open])

  const dirty = useMemo(
    () => accountSnapshot(drafts) !== baseline,
    [drafts, baseline],
  )
  const existingIds = useMemo(
    () => new Set(accounts.map((account) => account.id)),
    [accounts],
  )
  const canSubmit =
    dirty &&
    drafts
      .filter(
        (draft) =>
          existingIds.has(draft.id) ||
          draft.name.trim() !== '' ||
          draft.lastFour !== '',
      )
      .every((draft) => draft.name.trim() !== '')
  const removeTarget = removeId
    ? drafts.find((draft) => draft.id === removeId)
    : undefined

  function updateDraft(id: string, patch: Partial<AccountDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    )
  }

  function setLeftover(id: string, leftover: boolean) {
    setDrafts((current) =>
      current.map((draft) => ({
        ...draft,
        leftover: leftover ? draft.id === id : draft.id === id ? false : draft.leftover,
      })),
    )
  }

  function closeClean() {
    setConfirmOpen(false)
    setRemoveId(null)
    onOpenChange(false)
  }

  function requestClose() {
    if (confirmOpen || removeId) return
    if (dirty) {
      setConfirmOpen(true)
      return
    }
    closeClean()
  }

  function requestRemove(id: string) {
    const draft = drafts.find((item) => item.id === id)
    if (!draft) return
    if (existingIds.has(id) || draft.name.trim() !== '' || draft.lastFour !== '') {
      setRemoveId(id)
      return
    }
    setDrafts((current) => current.filter((item) => item.id !== id))
  }

  function handleSave() {
    if (!canSubmit) return
    const kept = drafts.filter((draft) => draft.name.trim() !== '')
    const previous = new Map(accounts.map((account) => [account.id, account]))
    const leftoverId = kept.find(
      (draft) => draft.leftover && draft.kind === 'checking',
    )?.id
    replaceAccounts(
      kept.map((draft) => {
        const current = previous.get(draft.id)
        let role = current?.role ?? 'other'
        if (draft.id === leftoverId) role = 'overflow'
        else if (role === 'overflow') role = 'other'
        return {
          id: draft.id,
          name: draft.name.trim(),
          kind: draft.kind,
          lastFour: draft.lastFour,
          role,
          balance: current?.balance ?? 0,
        }
      }),
    )
    closeClean()
  }

  function addAccountRow() {
    const id = crypto.randomUUID()
    setFocusId(id)
    setDrafts((current) => [
      ...current,
      { id, name: '', lastFour: '', kind: 'checking', leftover: false },
    ])
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true)
        }}
      >
        <DialogContent
          className="w-max max-w-[calc(100%-2rem)] gap-0 pt-4 pr-4 pb-4 pl-3.5 sm:max-w-none"
          showCloseButton={false}
          {...editDialogDismiss(confirmOpen || removeId != null, requestClose)}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            if (removeId) {
              setRemoveId(null)
              return
            }
            if (confirmOpen) {
              setConfirmOpen(false)
              return
            }
            requestClose()
          }}
        >
          <div className="-ml-3.5 -mr-4 border-b pr-4 pb-4 pl-3.5">
            <DialogHeader>
              <DialogTitle className="pl-2.5 text-2xl tracking-tight">
                Edit accounts
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="mt-5 max-h-[min(70vh,40rem)] space-y-2 overflow-y-auto">
            <div
              className={cn(
                ACCOUNT_EDIT_GRID,
                'text-xs font-medium text-muted-foreground',
              )}
            >
              <span className={DEBT_LABEL_LEFT}>Name</span>
              <span>Last four</span>
              <span
                className="text-center leading-tight"
                title="The rest of the paycheck goes into this account"
              >
                Rest of paycheck
              </span>
              <span />
            </div>
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className={ACCOUNT_EDIT_GRID}
              >
                <Input
                  className={cn('h-8', EDIT_GHOST_FIELD)}
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft(draft.id, { name: event.target.value })
                  }
                  placeholder="Name"
                  aria-label="Account name"
                  autoFocus={focusId === draft.id}
                />
                <Input
                  className={cn('h-8 tabular-nums', EDIT_GHOST_FIELD)}
                  value={draft.lastFour}
                  onChange={(event) =>
                    updateDraft(draft.id, {
                      lastFour: event.target.value.replace(/\D/g, '').slice(0, 4),
                    })
                  }
                  placeholder="0000"
                  inputMode="numeric"
                  maxLength={4}
                  aria-label="Last four digits"
                />
                {draft.kind === 'checking' ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={draft.leftover}
                    aria-label="Rest of paycheck goes here"
                    title="Rest of paycheck goes here"
                    className={cn(
                      'flex size-8 cursor-pointer items-center justify-center justify-self-center outline-none',
                      EDIT_GHOST_BOX,
                    )}
                    onClick={() => setLeftover(draft.id, !draft.leftover)}
                  >
                    {draft.leftover ? (
                      <Check className="size-3.5 text-neutral-500" />
                    ) : null}
                  </button>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground justify-self-end hover:bg-transparent"
                  onClick={() => requestRemove(draft.id)}
                  title="Remove account"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="gap-1"
              onClick={addAccountRow}
            >
              <Plus className="size-3.5" />
              Add account
            </Button>
          </div>

          <DialogFooter className="-ml-3.5 -mr-4 mt-5 items-center px-6 py-4 sm:justify-end sm:gap-4">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={handleSave}>
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

      <Dialog
        open={!!removeId}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRemoveId(null)
        }}
      >
        <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove account?</DialogTitle>
            <DialogDescription>
              {removeTarget?.name
                ? `Removing "${removeTarget.name}" will delete it from this list.`
                : 'Removing this account will delete it from this list.'}{' '}
              This can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveId(null)}
            >
              Keep account
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!removeId) return
                setDrafts((current) =>
                  current.filter((item) => item.id !== removeId),
                )
                setRemoveId(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AccountDrawer({
  accountId,
  onClose,
}: {
  accountId: string | null
  onClose: () => void
}) {
  const { accounts, expenses, debts, updateExpense } = useBudget()
  const { paystubs } = usePaystubs()
  const account = accounts.find((item) => item.id === accountId)
  const billsId = billsAccount(accounts)?.id
  const monthlyNet = useMemo(
    () => averageMonthlyNet(paystubs, new Date().getFullYear()),
    [paystubs],
  )
  const isLeftover = account?.role === 'overflow'
  const lines = accountId
    ? depositLinesForAccount(expenses, debts, accountId, billsId)
    : []
  const checkingLines = lines.filter((line) => line.kind === 'checking')
  const debtLines = lines.filter((line) => line.kind === 'debt')
  const sections = [
    { title: 'Checking', items: checkingLines },
    { title: 'Debt', items: debtLines },
  ].filter((section) => section.items.length > 0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftAccountId, setDraftAccountId] = useState('')
  const editRowRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    setEditingId(null)
    setDraftAccountId('')
  }, [accountId])

  const editingExpense = expenses.find((item) => item.id === editingId)

  function cancelEdit() {
    setEditingId(null)
    setDraftAccountId('')
  }

  function closeDrawer() {
    cancelEdit()
    onClose()
  }

  useEffect(() => {
    if (!editingId) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (editRowRef.current?.contains(target)) return
      if (target.closest('[data-slot="select-content"]')) return
      if (target.closest('[data-radix-popper-content-wrapper]')) return
      cancelEdit()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [editingId])

  function startEdit(item: RecurringExpense) {
    setEditingId(item.id)
    setDraftAccountId(item.accountId)
  }

  function saveEdit() {
    if (!editingId || !draftAccountId) return
    if (draftAccountId !== editingExpense?.accountId) {
      updateExpense(editingId, { accountId: draftAccountId })
    }
    cancelEdit()
  }

  const monthlyTotal = account
    ? accountDepositNeed(expenses, debts, account, accounts, monthlyNet)
    : 0
  const biweeklyTotal = monthlyTotal / 2

  return (
    <Drawer
      direction="right"
      open={accountId != null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDrawer()
      }}
    >
      <DrawerContent className="account-drawer overflow-x-visible data-[vaul-drawer-direction=right]:h-full">
        <DrawerHeader>
          <DrawerTitle>
            {account ? (
              <AccountLabel name={account.name} lastFour={account.lastFour} />
            ) : (
              'Account'
            )}
          </DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {lines.length === 0 && !isLeftover ? (
            <p className="text-muted-foreground text-sm">
              No expenses assigned to this account yet.
            </p>
          ) : (
            <div className="grid gap-y-1">
              <div className="flex items-baseline">
                <span className="min-w-0 flex-1" />
                <AmountCols header left="Bi-weekly" right="Monthly" />
              </div>
              {sections.map((section, index) => (
                <div
                  key={section.title}
                  className={cn('grid gap-y-1', index > 0 && 'pt-4')}
                >
                  <p className="text-muted-foreground px-1 text-xs font-medium">
                    {section.title}
                  </p>
                  {section.items.map((line) => {
                const isEditing = editingId === line.expense?.id
                const chargeTotal =
                  line.kind === 'debt'
                    ? chargesForDebt(expenses, { id: line.id })
                    : 0
                const completeMonthly = ceilDollars(line.monthly + chargeTotal)
                const hasChargeList =
                  line.charges.length > 0 || line.hiddenCharges.length > 0
                return (
                  <div key={line.id} className="grid gap-y-1">
                    <div
                      ref={isEditing ? editRowRef : undefined}
                      className="hover-fill flex items-center rounded-lg py-2 pr-1 pl-1 [&:hover_.edit-pencil]:opacity-100"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate">{line.name}</span>
                        {line.expense && !isEditing ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            className="edit-pencil border-neutral-200 bg-white text-neutral-600 opacity-0 hover:bg-neutral-50 hover:text-foreground"
                            onClick={() => startEdit(line.expense!)}
                            title="Edit bank"
                            aria-label={`Edit bank for ${line.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                      {isEditing && line.expense ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <div className="w-44">
                            <BankSelect
                              accounts={accounts}
                              value={draftAccountId}
                              onChange={setDraftAccountId}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            className="bg-white"
                            onClick={saveEdit}
                            title="Save bank"
                            aria-label="Save bank"
                          >
                            <Check className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <AmountCols
                          left={formatUsdWholeUp(completeMonthly / 2)}
                          right={formatUsdWholeUp(completeMonthly)}
                        />
                      )}
                    </div>
                    {hasChargeList ? (
                      <div className="rounded-[6px] bg-[#f6f6f6] px-1.5 py-1">
                        <div className="flex items-baseline py-1 pr-1 pl-1">
                          <span className="text-neutral-600 min-w-0 flex-1 pl-2">
                            Total payment
                          </span>
                          <span className="text-neutral-600">
                            <AmountCols
                              left={formatUsdWholeUp(line.monthly / 2)}
                              right={formatUsdWholeUp(line.monthly)}
                            />
                          </span>
                        </div>
                        <p className="text-muted-foreground px-1 pt-3 pb-0.5 text-[10px] font-semibold uppercase">
                          On this card
                        </p>
                        {line.charges.map((charge) => {
                          const chargeEditing = editingId === charge.id
                          return (
                            <div
                              key={charge.id}
                              ref={chargeEditing ? editRowRef : undefined}
                              className="flex items-center py-1 pr-1 pl-1 [&:hover_.edit-pencil]:opacity-100"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <span className="truncate pl-2 text-neutral-600">
                                  {charge.name}
                                </span>
                                {chargeEditing ? null : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-xs"
                                    className="edit-pencil border-neutral-200 bg-white text-neutral-600 opacity-0 hover:bg-neutral-50 hover:text-foreground"
                                    onClick={() => startEdit(charge)}
                                    title="Edit bank"
                                    aria-label={`Edit bank for ${charge.name}`}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                )}
                              </div>
                              {chargeEditing ? (
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <div className="w-44">
                                    <BankSelect
                                      accounts={accounts}
                                      value={draftAccountId}
                                      onChange={setDraftAccountId}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-xs"
                                    className="bg-white"
                                    onClick={saveEdit}
                                    title="Save bank"
                                    aria-label="Save bank"
                                  >
                                    <Check className="size-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-neutral-600">
                                  <AmountCols
                                    left={formatUsdWholeUp(monthlyAmount(charge) / 2)}
                                    right={formatUsdWholeUp(monthlyAmount(charge))}
                                  />
                                </span>
                              )}
                            </div>
                          )
                        })}
                        {line.charges.length > 0 ? (
                          <div className="border-border mt-1 flex items-baseline border-t py-1 pr-1 pl-1">
                            <span className="text-neutral-600 min-w-0 flex-1 pl-2">
                              Total expenses
                            </span>
                            <span className="text-neutral-600">
                              <AmountCols
                                left={formatUsdWholeUp(chargeTotal / 2)}
                                right={formatUsdWholeUp(chargeTotal)}
                              />
                            </span>
                          </div>
                        ) : null}
                        {line.hiddenCharges.map((charge) => {
                          const chargeEditing = editingId === charge.id
                          return (
                            <div
                              key={charge.id}
                              ref={chargeEditing ? editRowRef : undefined}
                              className="flex items-center py-1 pr-1 pl-1 opacity-60 [&:hover_.edit-pencil]:opacity-100"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <EyeOff className="text-muted-foreground size-3.5 shrink-0" />
                                <span className="truncate text-neutral-600">
                                  {charge.name}
                                </span>
                                {chargeEditing ? null : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-xs"
                                    className="edit-pencil border-neutral-200 bg-white text-neutral-600 opacity-0 hover:bg-neutral-50 hover:text-foreground"
                                    onClick={() => startEdit(charge)}
                                    title="Edit bank"
                                    aria-label={`Edit bank for ${charge.name}`}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                )}
                              </div>
                              {chargeEditing ? (
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <div className="w-44">
                                    <BankSelect
                                      accounts={accounts}
                                      value={draftAccountId}
                                      onChange={setDraftAccountId}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-xs"
                                    className="bg-white"
                                    onClick={saveEdit}
                                    title="Save bank"
                                    aria-label="Save bank"
                                  >
                                    <Check className="size-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-neutral-600">
                                  <AmountCols
                                    left={formatUsdWholeUp(monthlyAmount(charge) / 2)}
                                    right={formatUsdWholeUp(monthlyAmount(charge))}
                                  />
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
                </div>
              ))}
              <div className="border-border mt-1 border-t" />
              <div className="flex items-baseline py-2 pr-1 pl-1">
                <span className="min-w-0 flex-1">Total</span>
                <AmountCols
                  left={formatUsdWholeUp(biweeklyTotal)}
                  right={formatUsdWholeUp(monthlyTotal)}
                />
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export function DebtsCard() {
  const { debts, expenses } = useBudget()
  const { paystubs } = usePaystubs()
  const [open, setOpen] = useState(false)
  const now = useMemo(() => new Date(), [])
  const monthlyNet = useMemo(
    () => Math.round(averageMonthlyNet(paystubs, now.getFullYear())),
    [paystubs, now],
  )
  const months = useMemo(() => {
    const plan = withLiveMonthlyBudget(
      loadDebtPlan(),
      debts,
      expenses,
      monthlyNet,
    )
    return projectDebtPlan(debts, plan, expenses, 120, now)
  }, [debts, expenses, monthlyNet, now])
  const upcoming = useMemo(
    () => months.filter((row) => row.source === 'plan'),
    [months],
  )
  const listed = useMemo(
    () => sortDebtsByPayoff(debts, upcoming),
    [debts, upcoming],
  )
  const totalBalance = debts.reduce((sum, item) => sum + item.balance, 0)
  const totalPayment = totalDebtPayments(debts)
  const extraThisMonth =
    months.find(
      (row) =>
        row.source === 'plan' &&
        row.year === now.getFullYear() &&
        row.month === now.getMonth(),
    )?.extraPaid ?? 0

  return (
    <>
      <Card className="self-start gap-0 overflow-hidden pt-0">
        <div className="hover-fill relative">
          <Link
            to="/debt"
            className="absolute inset-0 z-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Open debt details"
          />
          <CardHeader className="relative z-10 pointer-events-none pt-(--card-spacing)">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-semibold tracking-tight">
                  Debt
                </CardTitle>
                <div className="pointer-events-auto">
                  <CardGearButton
                    label="Edit debts"
                    onClick={() => setOpen(true)}
                  />
                </div>
              </div>
              <ChevronRight className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <div className="relative z-10 pointer-events-none px-(--card-spacing) pt-4 pb-4">
            <MetricStrip className="metric-grid-row">
              <DebtMetric label="Total balance" amount={totalBalance} wholeUp />
              <DebtMetric label="Total payments" amount={totalPayment} wholeUp />
              <DebtMetric label="Extra this month" amount={extraThisMonth} wholeUp />
              <DebtMetric
                label="Total towards debt"
                amount={totalPayment + extraThisMonth}
                wholeUp
              />
            </MetricStrip>
          </div>
        </div>
        <CardContent className="grid">
          <div className="border-border border-t" />
          <div className="pt-6">
            <div className="grid gap-y-1">
              <DebtListRow
                header
                creditor="Creditor"
                minimum="Payment"
                balance="Balance"
                paidOff="Paid off"
              />
              {listed.map((item) => {
                const last = payoffMonth(upcoming, item.id)
                return (
                  <DebtListRow
                    key={item.id}
                    creditor={item.lender}
                    minimum={formatUsd(paymentWithoutCharges(item))}
                    balance={formatUsd(item.balance)}
                    paidOff={last ? formatMonthsLeft(last, now) : '—'}
                  />
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <EditDebtsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function formatDuration(count: number) {
  if (count <= 0) return 'This month'
  const years = Math.floor(count / 12)
  const months = count % 12
  const parts: string[] = []
  if (years > 0) parts.push(`${years} yr`)
  if (months > 0) parts.push(`${months} mo`)
  return parts.join(' ')
}

function formatMonthsLeft(last: PlannerMonth, now: Date) {
  return formatDuration(
    (last.year - now.getFullYear()) * 12 + (last.month - now.getMonth()),
  )
}

function DebtMetric({
  label,
  amount,
  wholeUp = false,
}: {
  label: string
  amount: number
  wholeUp?: boolean
}) {
  return (
    <div>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 text-xl font-medium tabular-nums">
        {wholeUp ? formatUsdWholeUp(amount) : formatUsd(amount)}
      </p>
    </div>
  )
}

type DebtDraft = {
  id: string
  lender: string
  type: DebtType
  minimum: string
  extraPayment: string
  paidFromAccountId: string
  chargeAccountId: string
  balance: string
  apr: string
  promoApr: string
  promoEndsOn: string
}

const DEBT_ROW =
  'grid-cols-[minmax(4rem,6.5rem)_7rem_minmax(5rem,8rem)_5.5rem_4.5rem_1px_5.75rem_5.25rem_4.75rem_6rem_1px_6.5rem_7rem_28px]'

type DebtSortKey = 'balance' | 'apr' | 'minimum' | 'total'
type DebtSortDir = 'asc' | 'desc'

const DEBT_SORT_OPTIONS: { key: DebtSortKey; label: string }[] = [
  { key: 'balance', label: 'Current balance' },
  { key: 'apr', label: 'APR' },
  { key: 'minimum', label: 'Minimum payments' },
  { key: 'total', label: 'Total payments' },
]

function debtSnapshot(drafts: DebtDraft[]) {
  return JSON.stringify(
    drafts.map((draft) => ({
      id: draft.id,
      lender: draft.lender.trim(),
      type: draft.type,
      minimum: draft.minimum.trim(),
      extraPayment: draft.extraPayment.trim(),
      paidFromAccountId: draft.paidFromAccountId,
      balance: draft.balance.trim(),
      apr: draft.apr.trim(),
      promoApr: draft.promoApr.trim(),
      promoEndsOn: draft.promoEndsOn,
    })),
  )
}

function emptyDebtDraft(id: string): DebtDraft {
  return {
    id,
    lender: '',
    type: 'credit-card',
    minimum: '',
    extraPayment: '',
    paidFromAccountId: '',
    chargeAccountId: '',
    balance: '',
    apr: '',
    promoApr: '',
    promoEndsOn: '',
  }
}

function moneyField(value: string) {
  if (value.trim() === '') return 0
  return parseAmount(value)
}

function aprField(value: string) {
  if (value.trim() === '') return 0
  const parsed = parseAmount(value)
  if (parsed == null || parsed < 0) return null
  return parsed
}

function promoAprField(value: string) {
  if (value.trim() === '') return null
  const parsed = parseAmount(value)
  if (parsed == null || parsed < 0) return null
  return parsed
}

function draftToDebt(
  draft: DebtDraft,
  previous: Debt | undefined,
): Debt | null {
  const minimum = moneyField(draft.minimum)
  const extraPayment = moneyField(draft.extraPayment)
  const balance = moneyField(draft.balance)
  const apr = aprField(draft.apr)
  if (minimum == null || extraPayment == null || balance == null || apr == null)
    return null
  return {
    id: draft.id,
    lender: draft.lender.trim() || previous?.lender || 'New',
    dueDay: previous?.dueDay ?? null,
    minimum: ceilCents(minimum),
    extraPayment,
    paidFromAccountId: draft.paidFromAccountId,
    chargeAccountId: previous?.chargeAccountId ?? draft.chargeAccountId,
    type: draft.type,
    apr,
    promoApr: promoAprField(draft.promoApr),
    promoEndsOn: parsePromoEndsOn(draft.promoEndsOn),
    balance,
  }
}

export function EditDebtsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, expenses, debts, replaceDebts } = useBudget()
  const { paystubs } = usePaystubs()
  const monthlyNet = useMemo(
    () => Math.round(currentMonthNet(paystubs)),
    [paystubs],
  )
  const [drafts, setDrafts] = useState<DebtDraft[]>([])
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [totalFocusId, setTotalFocusId] = useState<string | null>(null)
  const [totalText, setTotalText] = useState('')
  const [sortKey, setSortKey] = useState<DebtSortKey | null>(null)
  const [sortDir, setSortDir] = useState<DebtSortDir>('desc')
  const now = useMemo(() => new Date(), [open])

  useLayoutEffect(() => {
    if (!open) return
    const loaded = debts.map((debt) => ({
      id: debt.id,
      lender: debt.lender,
      type: normalizeDebtType(debt.type, debt.lender),
      minimum: String(debt.minimum),
      extraPayment:
        debt.extraPayment === 0 ? '' : String(debt.extraPayment),
      paidFromAccountId: debt.paidFromAccountId,
      chargeAccountId: debt.chargeAccountId,
      balance: String(debt.balance),
      apr: String(debt.apr),
      promoApr: debt.promoApr == null ? '' : String(debt.promoApr),
      promoEndsOn: debt.promoEndsOn ?? '',
    }))
    setDrafts(loaded)
    setBaseline(debtSnapshot(loaded))
    setConfirmOpen(false)
    setRemoveId(null)
    setFocusId(null)
    setTotalFocusId(null)
    setTotalText('')
    setSortKey(null)
    setSortDir('desc')
  }, [open])

  const dirty = useMemo(
    () => debtSnapshot(drafts) !== baseline,
    [drafts, baseline],
  )
  const existingIds = useMemo(
    () => new Set(debts.map((debt) => debt.id)),
    [debts],
  )
  const filled = drafts.filter(
    (draft) =>
      existingIds.has(draft.id) ||
      draft.lender.trim() !== '' ||
      draft.minimum.trim() !== '' ||
      draft.extraPayment.trim() !== '' ||
      draft.balance.trim() !== '' ||
      draft.apr.trim() !== '' ||
      draft.paidFromAccountId !== '',
  )
  const canSubmit =
    dirty &&
    filled.every(
      (draft) =>
        draft.lender.trim() !== '' &&
        moneyField(draft.minimum) != null &&
        moneyField(draft.extraPayment) != null &&
        moneyField(draft.balance) != null &&
        aprField(draft.apr) != null,
    )
  const removeTarget = removeId
    ? drafts.find((draft) => draft.id === removeId)
    : undefined
  const previousById = useMemo(
    () => new Map(debts.map((debt) => [debt.id, debt])),
    [debts],
  )
  const currentById = useMemo(() => {
    if (!open) return new Map<string, number>()
    const projected = drafts
      .map((draft) => draftToDebt(draft, previousById.get(draft.id)))
      .filter((item): item is Debt => item != null)
    if (projected.length === 0) return new Map<string, number>()
    return plannedCurrentBalances(
      projected,
      withLiveMonthlyBudget(loadDebtPlan(), projected, expenses, monthlyNet),
      expenses,
      now,
    )
  }, [open, drafts, previousById, expenses, monthlyNet, now])

  function updateDraft(id: string, patch: Partial<DebtDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    )
  }

  function chargesAmount(draft: DebtDraft) {
    return chargesForDebt(expenses, { id: draft.id })
  }

  function computedTotal(draft: DebtDraft) {
    return ceilDollars(
      (moneyField(draft.minimum) ?? 0) + (moneyField(draft.extraPayment) ?? 0),
    )
  }

  function handleTotalChange(draft: DebtDraft, value: string) {
    setTotalText(value)
    const parsed = parseAmount(value)
    if (parsed == null) return
    const extra = roundCents(
      ceilDollars(parsed) - (moneyField(draft.minimum) ?? 0),
    )
    updateDraft(draft.id, {
      extraPayment: extra === 0 ? '' : String(extra),
    })
  }

  function closeClean() {
    setConfirmOpen(false)
    setRemoveId(null)
    onOpenChange(false)
  }

  function requestClose() {
    if (confirmOpen || removeId) return
    if (dirty) {
      setConfirmOpen(true)
      return
    }
    closeClean()
  }

  function requestRemove(id: string) {
    const draft = drafts.find((item) => item.id === id)
    if (!draft) return
    if (
      existingIds.has(id) ||
      draft.lender.trim() !== '' ||
      draft.minimum.trim() !== '' ||
      draft.extraPayment.trim() !== '' ||
      draft.balance.trim() !== '' ||
      draft.apr.trim() !== '' ||
      draft.paidFromAccountId !== ''
    ) {
      setRemoveId(id)
      return
    }
    setDrafts((current) => current.filter((item) => item.id !== id))
  }

  function handleSave() {
    if (!canSubmit) return
    const previous = new Map(debts.map((debt) => [debt.id, debt]))
    const kept = filled
      .map((draft) => draftToDebt(draft, previous.get(draft.id)))
      .filter((item): item is Debt => item != null)
    replaceDebts(kept)
    closeClean()
  }

  function addDebtRow() {
    const id = crypto.randomUUID()
    setFocusId(id)
    setDrafts((current) => [...current, emptyDebtDraft(id)])
  }

  function handleSort(key: DebtSortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('desc')
  }

  function sortValue(draft: DebtDraft) {
    if (sortKey === 'apr') return aprField(draft.apr) ?? 0
    if (sortKey === 'minimum') return moneyField(draft.minimum) ?? 0
    if (sortKey === 'total') return computedTotal(draft)
    return currentById.get(draft.id) ?? moneyField(draft.balance) ?? 0
  }

  const listedDrafts =
    sortKey == null
      ? drafts
      : [...drafts].sort((left, right) => {
          const delta = sortValue(left) - sortValue(right)
          return sortDir === 'asc' ? delta : -delta
        })

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true)
        }}
      >
        <DialogContent
          className="w-max max-w-[calc(100%-2rem)] gap-0 pt-4 pr-4 pb-4 pl-3.5 sm:max-w-none"
          showCloseButton={false}
          onOpenAutoFocus={(event) => event.preventDefault()}
          {...editDialogDismiss(confirmOpen || removeId != null, requestClose)}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            if (removeId) {
              setRemoveId(null)
              return
            }
            if (confirmOpen) {
              setConfirmOpen(false)
              return
            }
            requestClose()
          }}
        >
          <div className="-ml-3.5 -mr-4 border-b pr-4 pb-4 pl-3.5">
            <div className="flex items-center justify-between gap-3">
              <DialogHeader>
                <DialogTitle className="pl-2.5 text-2xl tracking-tight">
                  Edit debts
                </DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white gap-1"
                  onClick={addDebtRow}
                >
                  <Plus className="size-3.5" />
                  Add debt
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="bg-white"
                      aria-label="Sort debts"
                      title="Sort"
                    >
                      <ChevronsUpDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {DEBT_SORT_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.key}
                        className="justify-between gap-6"
                        onSelect={() => handleSort(option.key)}
                      >
                        <span>{option.label}</span>
                        {sortKey === option.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <div className="mt-5 max-h-[min(70vh,40rem)] overflow-x-auto overflow-y-auto">
            <div
              className={cn(
                'grid items-center gap-3 py-1 text-xs font-medium text-muted-foreground',
                DEBT_ROW,
              )}
            >
              <span className={DEBT_LABEL_LEFT}>Lender</span>
              <span className={DEBT_LABEL_LEFT}>Type</span>
              <span className={DEBT_LABEL_LEFT}>Paid from</span>
              <span className={DEBT_LABEL_LEFT}>Promos</span>
              <span className={DEBT_LABEL_APR}>APR</span>
              <DebtColRule />
              <span className={DEBT_LABEL_RIGHT}>Minimum</span>
              <span className={DEBT_LABEL_RIGHT}>Extra</span>
              <span className={DEBT_LABEL_RIGHT}>Charges</span>
              <span className={cn(DEBT_LABEL_RIGHT, 'whitespace-nowrap')}>
                Total payments
              </span>
              <DebtColRule />
              <span className={cn(DEBT_LABEL_RIGHT, 'whitespace-nowrap')}>
                Starting balance
              </span>
              <span className={cn(DEBT_LABEL_RIGHT, 'whitespace-nowrap')}>
                Current balance
              </span>
              <span />
            </div>
            {listedDrafts.map((draft) => (
              <div
                key={draft.id}
                className={cn('grid items-center gap-3 py-1', DEBT_ROW)}
              >
                <Input
                  className={cn('h-8', EDIT_GHOST_FIELD)}
                  value={draft.lender}
                  onChange={(event) =>
                    updateDraft(draft.id, { lender: event.target.value })
                  }
                  placeholder="Lender"
                  aria-label="Lender"
                  autoFocus={focusId === draft.id}
                />
                <DebtTypeSelect
                  value={draft.type}
                  onChange={(type) => updateDraft(draft.id, { type })}
                  quiet
                />
                <BankSelect
                  accounts={accounts}
                  value={draft.paidFromAccountId}
                  onChange={(id) =>
                    updateDraft(draft.id, { paidFromAccountId: id })
                  }
                  includeCards={false}
                  quiet
                  hideLastFour
                  ariaLabel="Paid from"
                  placeholder="Paid from"
                />
                <PromoField
                  apr={draft.promoApr}
                  endsOn={draft.promoEndsOn}
                  onChange={(next) =>
                    updateDraft(draft.id, {
                      ...(next.apr != null ? { promoApr: next.apr } : {}),
                      ...(next.endsOn != null ? { promoEndsOn: next.endsOn } : {}),
                    })
                  }
                />
                <AprInput
                  value={draft.apr}
                  onChange={(apr) => updateDraft(draft.id, { apr })}
                />
                <DebtColRule />
                <DebtMoneyInput
                  value={draft.minimum}
                  onChange={(minimum) => updateDraft(draft.id, { minimum })}
                  ariaLabel="Minimum payment"
                  roundUp
                />
                <DebtMoneyInput
                  value={draft.extraPayment}
                  onChange={(extraPayment) =>
                    updateDraft(draft.id, { extraPayment })
                  }
                  ariaLabel="Extra payment"
                />
                <ChargesBreakdown
                  amount={chargesAmount(draft)}
                  items={chargeExpensesForDebt(expenses, { id: draft.id })}
                  hiddenItems={hiddenChargeExpensesForDebt(expenses, { id: draft.id })}
                />
                <DebtMoneyInput
                  value={
                    totalFocusId === draft.id
                      ? totalText
                      : String(computedTotal(draft))
                  }
                  onChange={(value) => handleTotalChange(draft, value)}
                  ariaLabel="Total payments"
                  roundUp
                  whole
                />
                <DebtColRule />
                <DebtMoneyInput
                  value={draft.balance}
                  onChange={(balance) => updateDraft(draft.id, { balance })}
                  ariaLabel="Starting balance"
                />
                <DebtMoneyDisplay
                  amount={
                    currentById.get(draft.id) ?? moneyField(draft.balance) ?? 0
                  }
                  ariaLabel="Current balance"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground justify-self-end hover:bg-transparent"
                  onClick={() => requestRemove(draft.id)}
                  title="Remove debt"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter className="-ml-3.5 -mr-4 mt-5 items-center px-6 py-4 sm:justify-end sm:gap-4">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={handleSave}>
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

      <Dialog
        open={!!removeId}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRemoveId(null)
        }}
      >
        <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove debt?</DialogTitle>
            <DialogDescription>
              {removeTarget?.lender
                ? `Removing â€œ${removeTarget.lender}â€ will delete it from this list.`
                : 'Removing this debt will delete it from this list.'}{' '}
              This can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveId(null)}
            >
              Keep debt
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!removeId) return
                setDrafts((current) =>
                  current.filter((item) => item.id !== removeId),
                )
                setRemoveId(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CalculationsPanel() {
  const { accounts, expenses, debts, updateAccountBalance } = useBudget()
  const bills = billsAccount(accounts)
  const overflow = overflowAccount(accounts)
  const need = bills ? monthlyDepositNeed(expenses, debts, bills.id) : 0
  const have = bills?.balance ?? 0
  const shortfall = Math.max(0, need - have)
  const overflowHave = overflow?.balance ?? 0
  const transfer = Math.min(shortfall, overflowHave)
  const leftover = overflowHave - transfer
  const stillShort = shortfall - transfer

  return (
    <div className="grid gap-6 md:grid-cols-2">
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
    </div>
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
