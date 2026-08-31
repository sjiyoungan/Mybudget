import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, Pencil, Plus, Trash2, X } from 'lucide-react'

import { CardGearButton } from '@/components/budget-cards'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
  affirmCurrentLoans,
  affirmLoanPayments,
  affirmMonthPaid,
  affirmVisibleMonths,
  completeAffirmLoan,
  dateKey,
  formatYm,
  formatYmd,
  sortAffirmLoans,
  type AffirmLoan,
} from '@/lib/debt-plan'
import { formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

const AFFIRM_MONTH_COL = 88
const AFFIRM_ID_COLS = [
  { key: 'name', label: 'Name', width: 124, align: 'left' as const },
  { key: 'last', label: 'Last payment', width: 88, align: 'left' as const },
  { key: 'balance', label: 'Balance', width: 96, align: 'right' as const },
] as const
const AFFIRM_ID_WIDTH = AFFIRM_ID_COLS.reduce((sum, col) => sum + col.width, 0)

type AffirmSortKey = 'monthly' | 'last' | 'name'
type AffirmSortDir = 'asc' | 'desc'

const AFFIRM_SORTS: { key: AffirmSortKey; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'last', label: 'Last payment' },
  { key: 'name', label: 'Name' },
]

function sortLoans(loans: AffirmLoan[], key: AffirmSortKey, dir: AffirmSortDir) {
  const sign = dir === 'asc' ? 1 : -1
  return [...loans].sort((left, right) => {
    let cmp = 0
    if (key === 'monthly') cmp = left.monthly - right.monthly
    else if (key === 'last') cmp = left.lastPayment.localeCompare(right.lastPayment)
    else cmp = left.name.localeCompare(right.name)
    if (cmp === 0) cmp = left.loanId.localeCompare(right.loanId)
    return cmp * sign
  })
}

type AffirmDraft = {
  name: string
  loanId: string
  startDate: string
  startingBalance: string
  monthly: string
}

function parseUsdInput(raw: string) {
  const parsed = Number(raw.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100
}

function stickyLeft(index: number) {
  return AFFIRM_ID_COLS.slice(0, index).reduce((sum, col) => sum + col.width, 0)
}

function draftFromLoan(loan: AffirmLoan): AffirmDraft {
  return {
    name: loan.name,
    loanId: loan.loanId,
    startDate: loan.startDate || '',
    startingBalance: loan.startingBalance.toFixed(2),
    monthly: loan.monthly.toFixed(2),
  }
}

function emptyDraft(now: Date): AffirmDraft {
  return {
    name: '',
    loanId: '',
    startDate: dateKey(now),
    startingBalance: '',
    monthly: '',
  }
}

function FreezeCell({
  index,
  header = false,
  className,
  title,
  onClick,
  children,
}: {
  index: number
  header?: boolean
  className?: string
  title?: string
  onClick?: () => void
  children?: ReactNode
}) {
  const col = AFFIRM_ID_COLS[index]
  const Tag = header ? 'th' : 'td'
  return (
    <Tag
      title={title}
      onClick={onClick}
      className={cn(
        'sticky overflow-hidden bg-card',
        header ? 'z-20' : 'z-10',
        index === 0 ? 'pl-4 pr-3' : 'px-3',
        col.align === 'right' ? 'text-right' : 'text-left',
        onClick && !header && 'affirm-loan-hit hover-fill',
        className,
      )}
      style={{
        left: stickyLeft(index),
        width: col.width,
        minWidth: col.width,
        maxWidth: col.width,
      }}
    >
      {children}
    </Tag>
  )
}

function FooterFreeze({
  index,
  scrolled,
  children,
}: {
  index: number
  scrolled: boolean
  children?: ReactNode
}) {
  const col = AFFIRM_ID_COLS[index]
  return (
    <div
      className={cn(
        'shrink-0 py-3 text-sm font-medium tabular-nums',
        index === 0 ? 'pl-4 pr-3' : 'px-3',
        col.align === 'right' ? 'text-right' : 'text-left',
        index === AFFIRM_ID_COLS.length - 1 && !scrolled && 'border-border border-r',
      )}
      style={{ width: col.width }}
    >
      {children}
    </div>
  )
}

export function AffirmCard({
  loans,
  now,
  onLoansChange,
}: {
  loans: AffirmLoan[]
  now: Date
  onLoansChange: (loans: AffirmLoan[]) => void
}) {
  const currentLoans = useMemo(() => affirmCurrentLoans(loans, now), [loans, now])
  const months = useMemo(
    () => affirmVisibleMonths(currentLoans, now),
    [currentLoans, now],
  )
  const [sortKey, setSortKey] = useState<AffirmSortKey>('monthly')
  const [sortDir, setSortDir] = useState<AffirmSortDir>('asc')
  const sortedLoans = useMemo(
    () => sortLoans(currentLoans, sortKey, sortDir),
    [currentLoans, sortKey, sortDir],
  )
  const schedules = useMemo(
    () =>
      sortedLoans.map((loan) => ({
        loan,
        payments: affirmLoanPayments(loan),
      })),
    [sortedLoans],
  )
  const monthTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const ym of months) {
      totals[ym] = roundCents(
        schedules.reduce((sum, row) => sum + (row.payments[ym] ?? 0), 0),
      )
    }
    return totals
  }, [months, schedules])
  const allMonthly = roundCents(
    currentLoans.reduce((sum, loan) => sum + loan.monthly, 0),
  )
  const remaining = roundCents(
    currentLoans.reduce((sum, loan) => sum + loan.remaining, 0),
  )

  const scrollerRef = useRef<HTMLDivElement>(null)
  const endSentinelRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [stuck, setStuck] = useState(false)
  const [canDrag, setCanDrag] = useState(false)
  const [drawerLoanId, setDrawerLoanId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    scroll: 0,
    pointerId: 0,
  })

  const drawerLoan = loans.find((loan) => loan.id === drawerLoanId) ?? null

  function toggleSort(key: AffirmSortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  function updateScroll() {
    const node = scrollerRef.current
    if (!node) return
    setScrollLeft(node.scrollLeft)
    setScrolled(node.scrollLeft > 0)
    setCanDrag(node.scrollWidth > node.clientWidth + 1)
  }

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScroll()
    const observer = new ResizeObserver(updateScroll)
    observer.observe(el)
    const inner = el.firstElementChild
    if (inner) observer.observe(inner)
    window.addEventListener('resize', updateScroll)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScroll)
    }
  }, [loans, months])

  useEffect(() => {
    const sentinel = endSentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loans, months])

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !canDrag) return
    if (
      event.target instanceof Element &&
      event.target.closest('.sticky, button, input')
    ) {
      return
    }
    const el = scrollerRef.current
    if (!el) return
    drag.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scroll: el.scrollLeft,
      pointerId: event.pointerId,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return
    const el = scrollerRef.current
    if (!el) return
    const dx = event.clientX - drag.current.startX
    if (!drag.current.moved && Math.abs(dx) < 6) return
    if (!drag.current.moved) {
      drag.current.moved = true
      el.setPointerCapture(event.pointerId)
    }
    el.scrollLeft = drag.current.scroll - dx
    setScrollLeft(el.scrollLeft)
    setScrolled(el.scrollLeft > 0)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return
    const el = scrollerRef.current
    if (drag.current.moved && el?.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }
    drag.current.active = false
  }

  function saveLoan(next: AffirmLoan) {
    const without = loans.filter((loan) => loan.id !== next.id)
    onLoansChange(sortAffirmLoans([...without, next]))
    setDrawerLoanId(next.id)
  }

  const tableWidth = AFFIRM_ID_WIDTH + months.length * AFFIRM_MONTH_COL
  const sortLabel =
    AFFIRM_SORTS.find((item) => item.key === sortKey)?.label ?? 'Monthly'

  return (
    <Card className="min-w-0 overflow-visible pb-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-0.5">
            <CardTitle>Affirm</CardTitle>
            <CardGearButton
              label="Edit Affirm loans"
              onClick={() => setEditOpen(true)}
            />
          </div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="hover-fill flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm"
                >
                  {sortLabel}
                  {sortDir === 'asc' ? (
                    <ArrowUp className="size-3.5" />
                  ) : (
                    <ArrowDown className="size-3.5" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {AFFIRM_SORTS.map((item) => (
                  <DropdownMenuItem
                    key={item.key}
                    className="justify-between gap-4"
                    onSelect={() => toggleSort(item.key)}
                  >
                    {item.label}
                    {sortKey === item.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="size-3.5" />
                      ) : (
                        <ArrowDown className="size-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="size-3.5 opacity-40" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-0">
        <div className="relative isolate min-w-0">
          <div
            ref={scrollerRef}
            className="drag-scroll min-w-0"
            data-can-drag={canDrag ? '' : undefined}
            onScroll={updateScroll}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <table
              className="border-separate border-spacing-0 select-none text-sm"
              style={{ width: tableWidth, tableLayout: 'fixed' }}
            >
              <colgroup>
                {AFFIRM_ID_COLS.map((col) => (
                  <col key={col.key} style={{ width: col.width }} />
                ))}
                {months.map((ym) => (
                  <col key={ym} style={{ width: AFFIRM_MONTH_COL }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-muted-foreground text-xs">
                  {AFFIRM_ID_COLS.map((col, index) => {
                    const headerSort =
                      col.key === 'name'
                        ? 'name'
                        : col.key === 'last'
                          ? 'last'
                          : null
                    return (
                      <FreezeCell
                        key={col.key}
                        index={index}
                        header
                        className={cn(
                          'border-border border-b py-2 leading-tight font-medium',
                          headerSort && 'cursor-pointer hover-fill',
                        )}
                        onClick={
                          headerSort
                            ? () => toggleSort(headerSort)
                            : undefined
                        }
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {headerSort && sortKey === headerSort ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="size-3 shrink-0" />
                            ) : (
                              <ArrowDown className="size-3 shrink-0" />
                            )
                          ) : null}
                        </span>
                      </FreezeCell>
                    )
                  })}
                  {months.map((ym) => (
                    <th
                      key={ym}
                      className="border-border relative z-0 border-b px-3 py-2 text-right font-medium whitespace-nowrap"
                    >
                      {formatYm(ym)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map(({ loan, payments }, rowIndex) => {
                  const lastRow = rowIndex === schedules.length - 1
                  const name = loan.name.trim() || 'Amazon'
                  function openLoan() {
                    setDrawerLoanId(loan.id)
                  }
                  return (
                    <tr key={loan.id}>
                      <FreezeCell
                        index={0}
                        className={cn(
                          'truncate py-2 whitespace-nowrap',
                          !lastRow && 'border-border border-b',
                        )}
                        title={name}
                        onClick={openLoan}
                      >
                        {name}
                      </FreezeCell>
                      <FreezeCell
                        index={1}
                        className={cn(
                          'py-2 whitespace-nowrap',
                          !lastRow && 'border-border border-b',
                        )}
                      >
                        {loan.lastPayment ? formatYm(loan.lastPayment) : ''}
                      </FreezeCell>
                      <FreezeCell
                        index={2}
                        className={cn(
                          'py-2 tabular-nums',
                          !lastRow && 'border-border border-b',
                        )}
                      >
                        {formatUsd(loan.remaining)}
                      </FreezeCell>
                      {months.map((ym) => {
                        const amount = payments[ym]
                        const paid =
                          amount != null &&
                          amount > 0.005 &&
                          affirmMonthPaid(loan, ym, now)
                        return (
                          <td
                            key={ym}
                            className={cn(
                              'relative z-0 px-3 py-2 text-right tabular-nums',
                              !lastRow && 'border-border border-b',
                              paid && 'bg-neutral-100 text-neutral-500',
                            )}
                          >
                            {amount != null && amount > 0.005
                              ? formatUsd(amount)
                              : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div
            className="sticky-edge"
            data-scrolled={scrolled ? '' : undefined}
            style={{ width: AFFIRM_ID_WIDTH }}
          />
          <div
            className="sticky-shadow"
            data-scrolled={scrolled ? '' : undefined}
            style={{ left: AFFIRM_ID_WIDTH }}
          />
          <div
            ref={endSentinelRef}
            className="pointer-events-none absolute bottom-0 left-0 h-px w-full"
            aria-hidden
          />
        </div>
        <div
          className="affirm-totals sticky bottom-0 z-30 flex w-full min-w-0 border-t border-border bg-card"
          data-more={stuck ? '' : undefined}
        >
          <FooterFreeze index={0} scrolled={scrolled}>
            {currentLoans.length || ''}
          </FooterFreeze>
          <FooterFreeze index={1} scrolled={scrolled}>
            {currentLoans.length > 0 ? formatUsd(allMonthly) : ''}
          </FooterFreeze>
          <FooterFreeze index={2} scrolled={scrolled}>
            {currentLoans.length > 0 ? formatUsd(remaining) : ''}
          </FooterFreeze>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            {scrolled ? (
              <div
                className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4"
                style={{
                  background:
                    'linear-gradient(to right, rgb(0 0 0 / 0.08), rgb(0 0 0 / 0.03) 40%, transparent)',
                }}
              />
            ) : null}
            <div
              className="flex"
              style={{
                width: months.length * AFFIRM_MONTH_COL,
                transform: `translateX(-${scrollLeft}px)`,
              }}
            >
              {months.map((ym) => (
                <div
                  key={ym}
                  className="shrink-0 px-3 py-3 text-right text-sm font-medium tabular-nums"
                  style={{ width: AFFIRM_MONTH_COL }}
                >
                  {monthTotals[ym] > 0.005 ? formatUsd(monthTotals[ym]) : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
      <AffirmLoanDrawer
        open={drawerLoan != null}
        loan={drawerLoan}
        creating={false}
        now={now}
        onClose={() => {
          setDrawerLoanId(null)
        }}
        onSave={saveLoan}
      />
      <EditAffirmDialog
        open={editOpen}
        loans={loans}
        now={now}
        onOpenChange={setEditOpen}
        onSave={onLoansChange}
      />
    </Card>
  )
}

const AFFIRM_EDIT_GHOST =
  'edit-ghost-field border-transparent bg-transparent shadow-none transition-colors hover:bg-transparent focus-visible:ring-0 focus-visible:ring-transparent dark:bg-transparent dark:hover:bg-transparent'
const AFFIRM_EDIT_BOX =
  'edit-ghost-box rounded-lg border border-transparent transition-colors'
const AFFIRM_EDIT_ROW =
  'grid-cols-[7rem_6.75rem_9rem_7.25rem_6.5rem_6.5rem_7rem_28px]'

type AffirmEditDraft = {
  id: string
  name: string
  loanId: string
  startDate: string
  startMonth: string
  startingBalance: string
  monthly: string
}

function draftFromStored(loan: AffirmLoan): AffirmEditDraft {
  return {
    id: loan.id,
    name: loan.name,
    loanId: loan.loanId,
    startDate: loan.startDate ?? '',
    startMonth: loan.startMonth,
    startingBalance: loan.startingBalance.toFixed(2),
    monthly: loan.monthly.toFixed(2),
  }
}

function emptyAffirmDraft(now: Date): AffirmEditDraft {
  return {
    id: `affirm-${crypto.randomUUID()}`,
    name: '',
    loanId: '',
    startDate: dateKey(now),
    startMonth: '',
    startingBalance: '',
    monthly: '',
  }
}

function previewAffirmDraft(draft: AffirmEditDraft, now: Date) {
  const startingBalance = parseUsdInput(draft.startingBalance)
  const monthly = parseUsdInput(draft.monthly)
  if (startingBalance == null || monthly == null) return null
  if (!draft.startDate && !draft.startMonth) return null
  return completeAffirmLoan(
    {
      id: draft.id,
      name: draft.name,
      loanId: draft.loanId,
      startDate: draft.startDate || undefined,
      startMonth: draft.startMonth || undefined,
      startingBalance,
      monthly,
    },
    now,
  )
}

function isBlankAffirmDraft(draft: AffirmEditDraft) {
  return (
    draft.name.trim() === '' &&
    draft.loanId.trim() === '' &&
    draft.startingBalance.trim() === '' &&
    draft.monthly.trim() === ''
  )
}

function EditAffirmDialog({
  open,
  loans,
  now,
  onOpenChange,
  onSave,
}: {
  open: boolean
  loans: AffirmLoan[]
  now: Date
  onOpenChange: (open: boolean) => void
  onSave: (loans: AffirmLoan[]) => void
}) {
  const [drafts, setDrafts] = useState<AffirmEditDraft[]>([])
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const loaded = loans.map(draftFromStored)
    setDrafts(loaded)
    setBaseline(JSON.stringify(loaded))
    setConfirmOpen(false)
    setRemoveId(null)
    setFocusId(null)
  }, [open, loans])

  const dirty = JSON.stringify(drafts) !== baseline
  const existingIds = useMemo(() => new Set(loans.map((loan) => loan.id)), [loans])
  const filled = drafts.filter(
    (draft) => existingIds.has(draft.id) || !isBlankAffirmDraft(draft),
  )
  const canSubmit =
    dirty &&
    filled.every((draft) => {
      const startingBalance = parseUsdInput(draft.startingBalance)
      const monthly = parseUsdInput(draft.monthly)
      return (
        startingBalance != null &&
        monthly != null &&
        (draft.startDate !== '' || draft.startMonth !== '')
      )
    })
  const removeTarget = removeId
    ? drafts.find((draft) => draft.id === removeId)
    : undefined

  function updateDraft(id: string, patch: Partial<AffirmEditDraft>) {
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
    if (existingIds.has(id) || !isBlankAffirmDraft(draft)) {
      setRemoveId(id)
      return
    }
    setDrafts((current) => current.filter((item) => item.id !== id))
  }

  function handleSave() {
    if (!canSubmit) return
    const next = filled
      .map((draft) => previewAffirmDraft(draft, now))
      .filter((item): item is AffirmLoan => item != null)
    onSave(sortAffirmLoans(next))
    closeClean()
  }

  function addRow() {
    const row = emptyAffirmDraft(now)
    setFocusId(row.id)
    setDrafts((current) => [...current, row])
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
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            event.preventDefault()
            if (confirmOpen || removeId) return
            requestClose()
          }}
          onInteractOutside={(event) => event.preventDefault()}
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
                  Edit Affirm
                </DialogTitle>
              </DialogHeader>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white gap-1"
                onClick={addRow}
              >
                <Plus className="size-3.5" />
                Add loan
              </Button>
            </div>
          </div>

          <div className="mt-5 max-h-[min(70vh,40rem)] overflow-x-auto overflow-y-auto">
            <div
              className={cn(
                'grid items-center gap-3 py-1 text-xs font-medium text-muted-foreground',
                AFFIRM_EDIT_ROW,
              )}
            >
              <span className="pl-2.5">Name</span>
              <span className="pl-2.5">Loan ID</span>
              <span className="pl-2.5">Starting date</span>
              <span className="pr-2.5 text-right">Starting balance</span>
              <span className="pr-2.5 text-right">Monthly</span>
              <span className="pr-2.5 text-right">Last payment</span>
              <span className="pr-2.5 text-right">Current balance</span>
              <span />
            </div>
            {drafts.map((draft) => {
              const preview = previewAffirmDraft(draft, now)
              return (
                <div
                  key={draft.id}
                  className={cn('grid items-center gap-3 py-1', AFFIRM_EDIT_ROW)}
                >
                  <Input
                    className={cn('h-8', AFFIRM_EDIT_GHOST)}
                    value={draft.name}
                    onChange={(event) =>
                      updateDraft(draft.id, { name: event.target.value })
                    }
                    placeholder="Name"
                    aria-label="Name"
                    autoFocus={focusId === draft.id}
                  />
                  <Input
                    className={cn('h-8', AFFIRM_EDIT_GHOST)}
                    value={draft.loanId}
                    onChange={(event) =>
                      updateDraft(draft.id, { loanId: event.target.value })
                    }
                    placeholder="Loan ID"
                    aria-label="Loan ID"
                  />
                  <Input
                    type="date"
                    className={cn('h-8', AFFIRM_EDIT_GHOST)}
                    value={draft.startDate}
                    onChange={(event) =>
                      updateDraft(draft.id, { startDate: event.target.value })
                    }
                    aria-label="Starting date"
                  />
                  <AffirmGhostMoney
                    value={draft.startingBalance}
                    onChange={(startingBalance) =>
                      updateDraft(draft.id, { startingBalance })
                    }
                    ariaLabel="Starting balance"
                  />
                  <AffirmGhostMoney
                    value={draft.monthly}
                    onChange={(monthly) => updateDraft(draft.id, { monthly })}
                    ariaLabel="Monthly payment"
                  />
                  <p className="pr-2.5 text-right text-sm tabular-nums">
                    {preview?.lastPayment ? formatYm(preview.lastPayment) : '—'}
                  </p>
                  <p className="pr-2.5 text-right text-sm tabular-nums">
                    {preview ? formatUsd(preview.remaining) : '—'}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground justify-self-end hover:bg-transparent"
                    onClick={() => requestRemove(draft.id)}
                    title="Remove loan"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )
            })}
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
            <DialogTitle>Remove loan?</DialogTitle>
            <DialogDescription>
              {removeTarget?.name || removeTarget?.loanId
                ? `Removing “${removeTarget.name || removeTarget.loanId}” will delete it from this list.`
                : 'Removing this loan will delete it from this list.'}{' '}
              This can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveId(null)}
            >
              Keep loan
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

function AffirmGhostMoney({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <div className={cn('flex h-8 items-center justify-end px-2.5', AFFIRM_EDIT_BOX)}>
      <span className="shrink-0 pr-0.5 text-sm text-neutral-400">$</span>
      <input
        className="placeholder:text-muted-foreground h-full w-full min-w-0 bg-transparent text-right text-sm tabular-nums outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.00"
        inputMode="decimal"
        aria-label={ariaLabel}
      />
    </div>
  )
}

function AffirmLoanDrawer({
  open,
  loan,
  creating,
  now,
  onClose,
  onSave,
}: {
  open: boolean
  loan: AffirmLoan | null
  creating: boolean
  now: Date
  onClose: () => void
  onSave: (loan: AffirmLoan) => void
}) {
  const [editing, setEditing] = useState(creating)
  const [draft, setDraft] = useState<AffirmDraft>(() =>
    loan ? draftFromLoan(loan) : emptyDraft(now),
  )

  useLayoutEffect(() => {
    setEditing(creating)
    setDraft(loan ? draftFromLoan(loan) : emptyDraft(now))
  }, [creating, loan, now, open])

  const preview = useMemo(() => {
    const startingBalance = parseUsdInput(draft.startingBalance) ?? 0
    const monthly = parseUsdInput(draft.monthly) ?? 0
    if (!draft.startDate && !loan?.startMonth) return null
    return completeAffirmLoan(
      {
        id: loan?.id,
        name: draft.name,
        loanId: draft.loanId,
        startDate: draft.startDate || undefined,
        startMonth: loan?.startMonth,
        startingBalance,
        monthly,
      },
      now,
    )
  }, [draft, loan, now])

  function cancel() {
    if (creating) {
      onClose()
      return
    }
    if (loan) setDraft(draftFromLoan(loan))
    setEditing(false)
  }

  function save() {
    const startingBalance = parseUsdInput(draft.startingBalance)
    const monthly = parseUsdInput(draft.monthly)
    if (startingBalance == null || monthly == null) return
    if (!draft.startDate && !loan?.startMonth) return
    onSave(
      completeAffirmLoan(
        {
          id: loan?.id,
          name: draft.name,
          loanId: draft.loanId,
          startDate: draft.startDate || undefined,
          startMonth: loan?.startMonth,
          startingBalance,
          monthly,
        },
        now,
      ),
    )
    setEditing(false)
  }

  const title = creating ? 'New loan' : loan?.name || 'Affirm'

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DrawerContent className="data-[vaul-drawer-direction=right]:h-full sm:max-w-md">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            {editing ? (
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Name"
                aria-label="Name"
                className="font-heading text-base font-medium"
              />
            ) : (
              <DrawerTitle>{title}</DrawerTitle>
            )}
            {editing ? (
              <div className="flex shrink-0 items-center rounded-md bg-white p-1 shadow-md">
                <button
                  type="button"
                  className="hover-fill flex size-6 items-center justify-center rounded"
                  aria-label="Save"
                  onClick={save}
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  className="hover-fill flex size-6 items-center justify-center rounded"
                  aria-label="Cancel"
                  onClick={cancel}
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="hover-fill flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3.5" />
                Edit
              </button>
            )}
          </div>
        </DrawerHeader>
        <div className="grid gap-6 px-4 pb-6">
          <AffirmDetailField
            label="Loan ID"
            editing={editing}
            value={draft.loanId}
            display={creating ? '—' : loan?.loanId || '—'}
            onChange={(loanId) =>
              setDraft((current) => ({ ...current, loanId }))
            }
          />
          <AffirmDetailField
            label="Starting date"
            editing={editing}
            value={draft.startDate}
            display={
              loan?.startDate
                ? formatYmd(loan.startDate)
                : loan?.startMonth
                  ? formatYm(loan.startMonth)
                  : '—'
            }
            type="date"
            onChange={(startDate) =>
              setDraft((current) => ({ ...current, startDate }))
            }
          />
          <AffirmDetailField
            label="Starting balance"
            editing={editing}
            value={draft.startingBalance}
            display={loan ? formatUsd(loan.startingBalance) : '—'}
            money
            onChange={(startingBalance) =>
              setDraft((current) => ({ ...current, startingBalance }))
            }
          />
          <AffirmDetailField
            label="Monthly payment"
            editing={editing}
            value={draft.monthly}
            display={loan ? formatUsd(loan.monthly) : '—'}
            money
            onChange={(monthly) =>
              setDraft((current) => ({ ...current, monthly }))
            }
          />
          <AffirmDetailField
            label="Last payment"
            editing={false}
            value=""
            display={
              preview?.lastPayment
                ? formatYm(preview.lastPayment)
                : loan?.lastPayment
                  ? formatYm(loan.lastPayment)
                  : '—'
            }
            onChange={() => {}}
          />
          <AffirmDetailField
            label="Balance"
            editing={false}
            value=""
            display={
              preview
                ? formatUsd(preview.remaining)
                : loan
                  ? formatUsd(loan.remaining)
                  : '—'
            }
            onChange={() => {}}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function AffirmDetailField({
  label,
  editing,
  value,
  display,
  type = 'text',
  money = false,
  onChange,
}: {
  label: string
  editing: boolean
  value: string
  display: string
  type?: string
  money?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      {editing ? (
        money ? (
          <div className="focus-within:border-ring focus-within:ring-ring/30 flex h-8 items-center rounded-lg border border-input px-2.5 focus-within:ring-3">
            <span className="pr-1 text-sm text-neutral-500">$</span>
            <input
              className="h-full w-full bg-transparent text-sm tabular-nums outline-none"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              inputMode="decimal"
              aria-label={label}
            />
          </div>
        ) : (
          <Input
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
          />
        )
      ) : (
        <p className={cn('text-sm', money && 'tabular-nums')}>
          {display || '—'}
        </p>
      )}
    </div>
  )
}
