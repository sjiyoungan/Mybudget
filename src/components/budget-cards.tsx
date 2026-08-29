import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Menu, Plus, Trash2 } from 'lucide-react'

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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useBudget } from '@/lib/budget-context'
import {
  billsAccount,
  formatDueDay,
  monthlyNeedForAccount,
  overflowAccount,
  totalForCategory,
  type AccountRole,
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

type CategoryDraft = {
  id: string
  name: string
}

type ExpenseDraft = {
  id: string
  name: string
  amount: string
  dueDay: string
  category: string
  accountId: string
}

const EXPENSE_ROW =
  'grid-cols-[minmax(8rem,14rem)_5.75rem_4.75rem_minmax(8rem,1fr)_28px]' as const

function newExpenseDraft(accountId: string, category = ''): ExpenseDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    amount: '',
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
  const { accounts, categories, expenses, replaceCategories, replaceExpenses } =
    useBudget()
  const defaultAccountId = accounts[0]?.id ?? ''
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
          accountId: draft.accountId || defaultAccountId,
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
                ? `Removing “${removeTarget.name}” will delete it from this list.`
                : 'Removing this expense will delete it from this list.'}{' '}
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
  const { categories, expenses } = useBudget()
  const [open, setOpen] = useState(false)
  const [viewAll, setViewAll] = useState(false)
  const [drawerCategory, setDrawerCategory] = useState<string | null>(null)

  const total = expenses.reduce((sum, item) => sum + item.amount, 0)

  return (
    <>
      <Card className="self-start">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>Total monthly expenses</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={() => setOpen(true)}
            >
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid">
          <p className="pb-4 text-2xl font-medium tabular-nums">
            {formatUsd(total)}
          </p>
          <div className="border-border border-t" />
          <div className="pt-2">
            <div
              className={cn(
                'grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4',
                viewAll ? 'gap-y-3' : 'gap-y-1',
              )}
            >
              {categories.map((item) => {
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
                        'hover-fill col-span-2 grid cursor-pointer grid-cols-subgrid items-baseline rounded-lg py-2 text-left',
                        selected && 'hover-fill-active',
                      )}
                    >
                      <span>{item.name}</span>
                      <span className="text-right tabular-nums">
                        {formatUsd(totalForCategory(expenses, item.id))}
                      </span>
                    </button>
                    {viewAll && details.length > 0 ? (
                      <div className="col-span-2 rounded-[6px] bg-[#f6f6f6] px-1.5 py-1">
                        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1">
                          {details.map((expense) => (
                            <Fragment key={expense.id}>
                              <span className="text-neutral-600 pl-2">
                                {expense.name}
                              </span>
                              <span className="text-right text-neutral-600 tabular-nums">
                                {formatUsd(expense.amount)}
                              </span>
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex justify-end">
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

      <EditExpensesDialog open={open} onOpenChange={setOpen} />

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
  category: string | null
  onClose: () => void
}) {
  const { categories, expenses } = useBudget()
  const meta = categories.find((item) => item.id === category)
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
          <DrawerTitle>{meta?.name ?? 'Expenses'}</DrawerTitle>
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
