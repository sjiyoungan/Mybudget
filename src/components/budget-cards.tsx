import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronRight, Menu, Pencil, Plus, Settings, Trash2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
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
import {
  billsAccount,
  billedAmountFromMonthly,
  chargesForDebt,
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
  totalDebtPayments,
  totalForCategory,
  totalMonthlyExpenses,
  totalMonthlyExpensesExcluding,
  type AccountKind,
  type Debt,
  type DebtType,
  type ExpenseFrequency,
  type RecurringExpense,
} from '@/lib/budget'
import {
  loadDebtPlan,
  payoffMonth,
  projectDebtPlan,
  sortDebtsByPayoff,
  yearToDateInterest,
  type PlannerMonth,
} from '@/lib/debt-plan'
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

const DEBT_GHOST_FIELD =
  'border-transparent bg-transparent shadow-none hover:border-input hover:bg-transparent focus-visible:border-input focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent data-[state=open]:border-input'

function AprInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex h-8 items-center justify-end rounded-lg border border-transparent px-2 hover:border-input focus-within:border-input">
      <input
        className="placeholder:text-muted-foreground h-full min-w-0 w-full bg-transparent text-right text-sm tabular-nums outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        inputMode="decimal"
        aria-label="APR"
      />
      <span className="text-neutral-400 shrink-0 pl-0.5 text-sm">%</span>
    </div>
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
    <Select value={value} onValueChange={(next) => onChange(next as DebtType)}>
      <SelectTrigger
        className={cn('h-8 w-full', quiet && DEBT_GHOST_FIELD)}
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
        {account.lastFour
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
      onValueChange={onChange}
    >
      <SelectTrigger
        className={cn('w-full', quiet && DEBT_GHOST_FIELD)}
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
}

const EXPENSE_ROW =
  'grid-cols-[minmax(7rem,12rem)_5.75rem_6.75rem_4.75rem_minmax(7rem,1fr)_28px]' as const

function newExpenseDraft(accountId: string, category = ''): ExpenseDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    amount: '',
    frequency: 'monthly',
    dueDay: '',
    category,
    accountId,
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
  }
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

function moveDraftToCategory(
  drafts: ExpenseDraft[],
  draftId: string,
  category: string,
) {
  const from = drafts.findIndex((item) => item.id === draftId)
  if (from < 0) return drafts
  const next = [...drafts]
  const [item] = next.splice(from, 1)
  if (!item) return drafts
  const updated = { ...item, category }
  let insertAt = next.length
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i]?.category === category) {
      insertAt = i + 1
      break
    }
  }
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
    <div className="focus-within:border-ring focus-within:ring-ring/30 flex h-8 items-center rounded-lg border border-input px-1.5 hover:border-neutral-400 focus-within:ring-3">
      <span className="pr-1 text-sm text-neutral-500">$</span>
      <input
        className="placeholder:text-muted-foreground/50 h-full w-full bg-transparent text-right text-sm tabular-nums outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        }}
        inputMode="decimal"
        placeholder="0"
        aria-label="Amount"
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
        'flex h-8 items-center justify-end rounded-lg border px-1.5',
        invalid
          ? 'border-destructive focus-within:border-destructive focus-within:ring-destructive/25 focus-within:ring-3'
          : 'focus-within:border-ring focus-within:ring-ring/30 border-input hover:border-neutral-400 focus-within:ring-3',
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
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  categoryId?: string
  active: boolean
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  children: ReactNode
}) {
  return (
    <section
      data-category-id={categoryId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'space-y-2 rounded-lg p-1',
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
      onValueChange={(next) => onChange(next as ExpenseFrequency)}
    >
      <SelectTrigger className="w-full" aria-label="Frequency">
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
  onDragStart,
  onDragEnd,
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
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: string) => void
  onDragEnd: () => void
  canRemove: boolean
  autoFocus?: boolean
  showHandle?: boolean
}) {
  return (
    <div
      data-draft-id={draft.id}
      className={cn(
        'group/row relative grid items-center gap-2',
        EXPENSE_ROW,
        dragging && 'opacity-50',
      )}
    >
      {showHandle ? (
        <button
          type="button"
          draggable
          title="Drag to a category"
          aria-label={`Move ${draft.name || 'expense'}`}
          onDragStart={(event) => onDragStart(event, draft.id)}
          onDragEnd={onDragEnd}
          className={cn(
            'text-neutral-400 hover:text-foreground absolute top-1/2 right-full mr-1 flex h-8 w-5 -translate-y-1/2 cursor-grab items-center justify-center active:cursor-grabbing',
            dragging
              ? 'opacity-100'
              : 'opacity-0 group-hover/row:opacity-100',
          )}
        >
          <Menu className="size-3.5" />
        </button>
      ) : null}
      <Input
        className="h-8"
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
      />
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
  const pendingScrollCategoryId = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const nextCategories = categories.map((item) => ({ ...item }))
    const nextDrafts = expenses.map(expenseToDraft)
    setCategoryDrafts(nextCategories)
    setDrafts(nextDrafts)
    setBaseline(editorSnapshot(nextCategories, nextDrafts))
    setConfirmOpen(false)
    setRemoveId(null)
    setDueDayError(false)
    setDraggingId(null)
    setDropCategoryId(null)
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
          amount: parseAmount(draft.amount) ?? 0,
          frequency: draft.frequency,
          accountId: draft.accountId,
          category: draft.category,
        })),
    )
    closeClean()
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  function handleDragOver(event: DragEvent<HTMLElement>, categoryId: string) {
    if (draggingId && linkedDebtIds.has(draggingId) && categoryId !== DEBT_CATEGORY_ID) {
      event.dataTransfer.dropEffect = 'none'
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropCategoryId(categoryId)
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setDropCategoryId(null)
  }

  function handleDrop(event: DragEvent<HTMLElement>, categoryId: string) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || draggingId
    if (id && linkedDebtIds.has(id) && categoryId !== DEBT_CATEGORY_ID) {
      setDraggingId(null)
      setDropCategoryId(null)
      return
    }
    if (id) {
      setDrafts((current) => moveDraftToCategory(current, id, categoryId))
    }
    setDraggingId(null)
    setDropCategoryId(null)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropCategoryId(null)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true)
            return
          }
          if (confirmOpen || removeId || addCategoryOpen) return
          if (document.visibilityState === 'hidden') return
          requestClose()
        }}
      >
        <DialogContent
          className="w-max max-w-[calc(100%-2rem)] gap-0 pt-4 pr-4 pb-4 pl-6 sm:max-w-none"
          showCloseButton={false}
          onPointerDownOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeId || addCategoryOpen) return
            if (document.visibilityState === 'hidden') return
            requestClose()
          }}
          onInteractOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeId || addCategoryOpen) return
            if (document.visibilityState === 'hidden') return
            requestClose()
          }}
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
          <div className="-ml-6 -mr-4 border-b px-6 pr-4 pb-4">
            <div className="flex items-center justify-between gap-3">
              <DialogHeader>
                <DialogTitle className="text-2xl tracking-tight">
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
            ref={listRef}
            className="-ml-6 mt-5 max-h-[min(70vh,40rem)] space-y-4 overflow-y-auto pl-6"
          >
            <div
              className={cn(
                'bg-popover sticky top-0 z-10 grid gap-2 pb-1 text-xs font-medium text-muted-foreground',
                EXPENSE_ROW,
              )}
            >
              <span>Name</span>
              <span>Amount</span>
              <span>Frequency</span>
              <span>Due day</span>
              <span>Bank</span>
              <span />
            </div>

            {uncategorized.length > 0 ? (
              <CategoryDropGroup
                categoryId=""
                active={dropCategoryId === ''}
                onDragOver={(event) => handleDragOver(event, '')}
                onDragLeave={handleDragLeave}
                onDrop={(event) => handleDrop(event, '')}
              >
                <p className="text-muted-foreground text-sm font-medium">
                  Uncategorized
                </p>
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
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
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
                  onDragOver={(event) => handleDragOver(event, category.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(event) => handleDrop(event, category.id)}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{category.name}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      className="border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                      aria-label={`Add expense to ${category.name}`}
                      onClick={() => addExpenseToCategory(category.id)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
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
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      canRemove={drafts.length > 1}
                      autoFocus={focusDraftId === draft.id}
                      showHandle={!linkedDebtIds.has(draft.id)}
                    />
                  ))}
                  {items.length === 0 ? (
                    <p className="text-muted-foreground px-1 py-2 text-xs">
                      Drop an expense here
                    </p>
                  ) : null}
                </CategoryDropGroup>
              )
            })}

            {dueDayError ? (
              <p className="text-destructive text-xs">
                Due day can&apos;t be more than the days in a month.
              </p>
            ) : null}
          </div>

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
  })
}

function EditOneExpenseDialog({
  expenseId,
  onOpenChange,
}: {
  expenseId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, categories, expenses, updateExpense, removeExpense } =
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
    const next = expenseToDraft(expense)
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
      amount: parseAmount(draft.amount) ?? 0,
      frequency: draft.frequency,
      accountId: draft.accountId,
      category: draft.category,
    })
    closeClean()
  }

  const open = expenseId != null && draft != null

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true)
            return
          }
          if (confirmOpen || removeOpen) return
          if (document.visibilityState === 'hidden') return
          requestClose()
        }}
      >
        <DialogContent
          className="w-max max-w-[calc(100%-2rem)] gap-0 pt-4 pr-4 pb-4 pl-6 sm:max-w-none"
          showCloseButton={false}
          onPointerDownOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeOpen) return
            if (document.visibilityState === 'hidden') return
            requestClose()
          }}
          onInteractOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeOpen) return
            if (document.visibilityState === 'hidden') return
            requestClose()
          }}
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
                  <SelectTrigger aria-label="Category">
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
                <span>Name</span>
                <span>Amount</span>
                <span>Frequency</span>
                <span>Due day</span>
                <span>Bank</span>
                <span />
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
                onDragStart={() => {}}
                onDragEnd={() => {}}
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
  const { updateExpense } = useBudget()
  const monthly = monthlyAmount(expense)
  const [draft, setDraft] = useState(String(monthly))
  const draftRef = useRef(draft)
  const skipCommit = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const monthlyRef = useRef(monthly)
  const frequencyRef = useRef(expense.frequency)
  const updateRef = useRef(updateExpense)
  draftRef.current = draft
  monthlyRef.current = monthly
  frequencyRef.current = expense.frequency
  updateRef.current = updateExpense

  useEffect(() => {
    if (!editing) return
    skipCommit.current = false
    setDraft(String(monthlyAmount(expense)))
  }, [editing, expense.amount, expense.frequency])

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
      if (
        parsed != null &&
        parsed >= 0 &&
        parsed !== monthlyRef.current
      ) {
        updateRef.current(expense.id, {
          amount: billedAmountFromMonthly(parsed, frequencyRef.current),
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
        {formatUsd(monthlyAmount(expense))}
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
        {formatUsd(amount)}
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
  const { categories, expenses } = useBudget()
  const [open, setOpen] = useState(false)
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null)
  const [amountEditId, setAmountEditId] = useState<string | null>(null)

  const shownCategories = categories.filter((item) =>
    mode === 'debt'
      ? item.id === DEBT_CATEGORY_ID
      : item.id !== DEBT_CATEGORY_ID,
  )
  const debtItems = expenses.filter((expense) => expense.category === DEBT_CATEGORY_ID)
  const total =
    mode === 'debt'
      ? totalForCategory(expenses, DEBT_CATEGORY_ID)
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
            {formatUsd(total)}
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
                    (expense) => expense.category === item.id,
                  )
                  return (
                    <div
                      key={item.id}
                      className="col-span-2 grid grid-cols-subgrid"
                    >
                      <div className="col-span-2 grid grid-cols-subgrid items-baseline py-2">
                        <span>{item.name}</span>
                        <span className="text-right tabular-nums">
                          {formatUsd(totalForCategory(expenses, item.id))}
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
  const [open, setOpen] = useState(false)
  const [drawerAccount, setDrawerAccount] = useState<string | null>(null)
  const listed = useMemo(
    () => accounts.filter((account) => account.kind === 'checking'),
    [accounts],
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
                const need = monthlyDepositNeed(expenses, debts, account.id)
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
                      left={formatUsd(need / 2)}
                      right={formatUsd(need)}
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
}

function accountSnapshot(drafts: AccountDraft[]) {
  return JSON.stringify(
    drafts.map((draft) => ({
      id: draft.id,
      name: draft.name.trim(),
      lastFour: draft.lastFour,
      kind: draft.kind,
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
    replaceAccounts(
      kept.map((draft) => {
        const current = previous.get(draft.id)
        return {
          id: draft.id,
          name: draft.name.trim(),
          kind: draft.kind,
          lastFour: draft.lastFour,
          role: current?.role ?? 'other',
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
      { id, name: '', lastFour: '', kind: 'checking' },
    ])
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true)
            return
          }
          if (confirmOpen || removeId) return
          if (document.visibilityState === 'hidden') return
          requestClose()
        }}
      >
        <DialogContent
          className="w-max max-w-[calc(100%-2rem)] gap-0 pt-4 pr-4 pb-4 pl-6 sm:max-w-none"
          showCloseButton={false}
          onPointerDownOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeId) return
            if (document.visibilityState === 'hidden') return
            requestClose()
          }}
          onInteractOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeId) return
            if (document.visibilityState === 'hidden') return
            requestClose()
          }}
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
          <div className="-ml-6 -mr-4 border-b px-6 pr-4 pb-4">
            <DialogHeader>
              <DialogTitle className="text-2xl tracking-tight">
                Edit accounts
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="mt-5 max-h-[min(70vh,40rem)] space-y-2 overflow-y-auto">
            <div className="grid grid-cols-[minmax(10rem,16rem)_5.5rem_28px] items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>Name</span>
              <span>Last four</span>
              <span />
            </div>
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="grid grid-cols-[minmax(10rem,16rem)_5.5rem_28px] items-center gap-2"
              >
                <Input
                  className="h-8"
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft(draft.id, { name: event.target.value })
                  }
                  placeholder="Name"
                  aria-label="Account name"
                  autoFocus={focusId === draft.id}
                />
                <Input
                  className="h-8 tabular-nums"
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
                ? `Removing â€œ${removeTarget.name}â€ will delete it from this list.`
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
  const account = accounts.find((item) => item.id === accountId)
  const lines = accountId
    ? depositLinesForAccount(expenses, debts, accountId)
    : []
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

  const monthlyTotal = accountId
    ? monthlyDepositNeed(expenses, debts, accountId)
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
          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No expenses assigned to this account yet.
            </p>
          ) : (
            <div className="grid gap-y-1">
              <div className="flex items-baseline">
                <span className="min-w-0 flex-1" />
                <AmountCols header left="Bi-weekly" right="Monthly" />
              </div>
              {lines.map((line) => {
                const isEditing = editingId === line.expense?.id
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
                          left={formatUsd(line.monthly / 2)}
                          right={formatUsd(line.monthly)}
                        />
                      )}
                    </div>
                    {line.charges.length > 0 ? (
                      <div className="rounded-[6px] bg-[#f6f6f6] px-1.5 py-1">
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
                                    left={formatUsd(monthlyAmount(charge) / 2)}
                                    right={formatUsd(monthlyAmount(charge))}
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
              <div className="border-border mt-1 border-t" />
              <div className="flex items-baseline py-2 pr-1 pl-1">
                <span className="min-w-0 flex-1">Total</span>
                <AmountCols
                  left={formatUsd(biweeklyTotal)}
                  right={formatUsd(monthlyTotal)}
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
  const [open, setOpen] = useState(false)
  const now = useMemo(() => new Date(), [])
  const months = useMemo(() => {
    const plan = loadDebtPlan()
    return projectDebtPlan(debts, plan, expenses, 120, now)
  }, [debts, expenses, now])
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
  const ytdInterest = yearToDateInterest(
    months,
    now.getFullYear(),
    now.getMonth(),
  )

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
              <DebtMetric label="Total balance" amount={totalBalance} />
              <DebtMetric label="Total payments" amount={totalPayment} />
              <DebtMetric label="Extra this month" amount={extraThisMonth} />
              <DebtMetric
                label="Interest paid this year"
                amount={ytdInterest}
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
                    paidOff={last ? formatMonthsLeft(last, now) : 'â€”'}
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
}: {
  label: string
  amount: number
}) {
  return (
    <div>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 text-xl font-medium tabular-nums">{formatUsd(amount)}</p>
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
}

const DEBT_ROW =
  'grid-cols-[minmax(6.5rem,10.5rem)_8.5rem_5.25rem_5.25rem_5.25rem_5.25rem_minmax(8rem,11rem)_7rem_4.5rem_28px]'

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

export function EditDebtsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, expenses, debts, replaceDebts } = useBudget()
  const [drafts, setDrafts] = useState<DebtDraft[]>([])
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [totalFocusId, setTotalFocusId] = useState<string | null>(null)
  const [totalText, setTotalText] = useState('')

  useLayoutEffect(() => {
    if (!open) return
    const next = debts.map((debt) => ({
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
    }))
    setDrafts(next)
    setBaseline(debtSnapshot(next))
    setConfirmOpen(false)
    setRemoveId(null)
    setFocusId(null)
    setTotalFocusId(null)
    setTotalText('')
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

  function updateDraft(id: string, patch: Partial<DebtDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    )
  }

  function chargesAmount(draft: DebtDraft) {
    return chargesForDebt(expenses, {
      id: draft.id,
      chargeAccountId: draft.chargeAccountId,
    })
  }

  function computedTotal(draft: DebtDraft) {
    return roundCents(
      (moneyField(draft.minimum) ?? 0) +
        (moneyField(draft.extraPayment) ?? 0) +
        chargesAmount(draft),
    )
  }

  function handleTotalChange(draft: DebtDraft, value: string) {
    setTotalText(value)
    const parsed = parseAmount(value)
    if (parsed == null) return
    const extra = roundCents(
      parsed - (moneyField(draft.minimum) ?? 0) - chargesAmount(draft),
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
      .map((draft) => {
        const minimum = moneyField(draft.minimum)
        const balance = moneyField(draft.balance)
        const apr = aprField(draft.apr)
        const extraPayment = moneyField(draft.extraPayment)
        if (minimum == null || extraPayment == null || balance == null || apr == null)
          return null
        const current = previous.get(draft.id)
        return {
          id: draft.id,
          lender: draft.lender.trim(),
          dueDay: current?.dueDay ?? null,
          minimum,
          extraPayment,
          paidFromAccountId: draft.paidFromAccountId,
          chargeAccountId: current?.chargeAccountId ?? draft.chargeAccountId,
          type: draft.type,
          apr,
          balance,
        } satisfies Debt
      })
      .filter((item): item is Debt => item != null)
    replaceDebts(kept)
    closeClean()
  }

  function addDebtRow() {
    const id = crypto.randomUUID()
    setFocusId(id)
    setDrafts((current) => [...current, emptyDebtDraft(id)])
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true)
            return
          }
          if (confirmOpen || removeId) return
          if (document.visibilityState === 'hidden') return
          requestClose()
        }}
      >
        <DialogContent
          className="w-max max-w-[calc(100%-2rem)] gap-0 pt-4 pr-4 pb-4 pl-6 sm:max-w-none"
          showCloseButton={false}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeId) return
            if (document.visibilityState === 'hidden') return
            requestClose()
          }}
          onInteractOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeId) return
            if (document.visibilityState === 'hidden') return
            requestClose()
          }}
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
          <div className="-ml-6 -mr-4 border-b px-6 pr-4 pb-4">
            <DialogHeader>
              <DialogTitle className="text-2xl tracking-tight">
                Edit debts
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="mt-5 max-h-[min(70vh,40rem)] space-y-2 overflow-x-auto overflow-y-auto">
            <div
              className={cn(
                'grid items-center gap-4 text-xs font-medium text-muted-foreground',
                DEBT_ROW,
              )}
            >
              <span>Lender</span>
              <span>Type</span>
              <span className="text-right">Minimum</span>
              <span className="text-right">Extra</span>
              <span className="text-right">Charges</span>
              <span className="text-right">Total</span>
              <span>Paid from</span>
              <span className="text-right">Starting balance</span>
              <span className="text-right">APR</span>
              <span />
            </div>
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className={cn('grid items-center gap-4', DEBT_ROW)}
              >
                <Input
                  className={cn('h-8', DEBT_GHOST_FIELD)}
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
                <Input
                  className={cn('h-8 text-right tabular-nums', DEBT_GHOST_FIELD)}
                  value={draft.minimum}
                  onChange={(event) =>
                    updateDraft(draft.id, { minimum: event.target.value })
                  }
                  placeholder="0"
                  inputMode="decimal"
                  aria-label="Minimum payment"
                />
                <Input
                  className={cn('h-8 text-right tabular-nums', DEBT_GHOST_FIELD)}
                  value={draft.extraPayment}
                  onChange={(event) =>
                    updateDraft(draft.id, { extraPayment: event.target.value })
                  }
                  placeholder="0"
                  inputMode="decimal"
                  aria-label="Extra payment"
                />
                <div
                  className="text-muted-foreground h-8 px-2 text-right text-sm leading-8 tabular-nums"
                  aria-label="Charges"
                >
                  {formatUsd(chargesAmount(draft))}
                </div>
                <Input
                  className={cn('h-8 text-right tabular-nums', DEBT_GHOST_FIELD)}
                  value={
                    totalFocusId === draft.id
                      ? totalText
                      : String(computedTotal(draft))
                  }
                  onFocus={() => {
                    setTotalFocusId(draft.id)
                    setTotalText(String(computedTotal(draft)))
                  }}
                  onBlur={() => {
                    setTotalFocusId(null)
                    setTotalText('')
                  }}
                  onChange={(event) =>
                    handleTotalChange(draft, event.target.value)
                  }
                  placeholder="0"
                  inputMode="decimal"
                  aria-label="Total payment"
                />
                <BankSelect
                  accounts={accounts}
                  value={draft.paidFromAccountId}
                  onChange={(id) =>
                    updateDraft(draft.id, { paidFromAccountId: id })
                  }
                  includeCards={false}
                  quiet
                  ariaLabel="Paid from"
                  placeholder="Paid from"
                />
                <Input
                  className={cn('h-8 text-right tabular-nums', DEBT_GHOST_FIELD)}
                  value={draft.balance}
                  onChange={(event) =>
                    updateDraft(draft.id, { balance: event.target.value })
                  }
                  placeholder="0"
                  inputMode="decimal"
                  aria-label="Starting balance"
                />
                <AprInput
                  value={draft.apr}
                  onChange={(apr) => updateDraft(draft.id, { apr })}
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
            <Button
              type="button"
              variant="outline"
              className="gap-1"
              onClick={addDebtRow}
            >
              <Plus className="size-3.5" />
              Add debt
            </Button>
          </div>

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

export function CalculationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>Calculations</DialogTitle>
          <DialogDescription>
            Fill in what is in BoA Debit and Disc Debit. Need comes from the
            bills assigned to the bills account.
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
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
