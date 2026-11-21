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
  sortAffirmLoansByDue,
  type AffirmLoan,
} from '@/lib/debt-plan'
import { formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

const AFFIRM_MONTH_COL = 88
const AFFIRM_BALANCE_COL = 96

type AffirmColKey = 'name' | 'last' | 'balance'
type AffirmIdCol = {
  key: AffirmColKey
  label: string
  width: number
  align: 'left' | 'right'
}

const AFFIRM_ID_COLS: AffirmIdCol[] = [
  { key: 'name', label: 'Name', width: 124, align: 'left' },
  { key: 'last', label: 'Last payment', width: 112, align: 'left' },
  { key: 'balance', label: 'Balance', width: 96, align: 'right' },
]

function columnsForViewport(clientWidth: number): AffirmIdCol[] {
  const month = AFFIRM_MONTH_COL
  const desktop = AFFIRM_ID_COLS.reduce((sum, col) => sum + col.width, 0)
  if (clientWidth <= 0 || clientWidth >= desktop + month) return AFFIRM_ID_COLS
  const budget = clientWidth - month
  const last = Math.min(112, Math.max(96, budget - 64))
  const rest = budget - last
  if (rest >= 68 + 76) {
    return [
      { key: 'name', label: 'Name', width: rest - 76, align: 'left' },
      { key: 'last', label: 'Last payment', width: last, align: 'left' },
      { key: 'balance', label: 'Balance', width: 76, align: 'right' },
    ]
  }
  const nameWidth = Math.min(Math.max(56, rest), Math.max(56, budget - last))
  return [
    { key: 'name', label: 'Name', width: nameWidth, align: 'left' },
    { key: 'last', label: 'Last payment', width: Math.min(last, budget - nameWidth), align: 'left' },
  ]
}

function columnWidth(cols: AffirmIdCol[]) {
  return cols.reduce((sum, col) => sum + col.width, 0)
}

type AffirmSortKey = 'monthly' | 'last' | 'name' | 'start'
type AffirmSortDir = 'asc' | 'desc'

const AFFIRM_SORTS: { key: AffirmSortKey; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'start', label: 'Starting date' },
  { key: 'last', label: 'Last payment' },
  { key: 'name', label: 'Name' },
]

function loanStartKey(loan: AffirmLoan) {
  if (loan.startDate) return loan.startDate
  if (loan.startMonth) return `${loan.startMonth}-01`
  return ''
}

function sortLoans(loans: AffirmLoan[], key: AffirmSortKey, dir: AffirmSortDir) {
  const sign = dir === 'asc' ? 1 : -1
  return [...loans].sort((left, right) => {
    if (key === 'start') {
      const leftKey = loanStartKey(left)
      const rightKey = loanStartKey(right)
      if (!leftKey || !rightKey) {
        if (leftKey === rightKey) return left.loanId.localeCompare(right.loanId)
        return leftKey ? -1 : 1
      }
      const cmp = leftKey.localeCompare(rightKey)
      if (cmp === 0) return left.loanId.localeCompare(right.loanId)
      return cmp * sign
    }
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

function stickyLeft(cols: AffirmIdCol[], index: number) {
  return cols.slice(0, index).reduce((sum, col) => sum + col.width, 0)
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
  col,
  left,
  header = false,
  className,
  title,
  onClick,
  children,
}: {
  col: AffirmIdCol
  left: number
  header?: boolean
  className?: string
  title?: string
  onClick?: () => void
  children?: ReactNode
}) {
  const Tag = header ? 'th' : 'td'
  return (
    <Tag
      title={title}
      onClick={onClick}
      className={cn(
        'sticky overflow-hidden bg-card whitespace-nowrap',
        header ? 'z-20' : 'z-10',
        col.key === 'name' ? 'pl-4 pr-3' : col.width >= 110 ? 'px-3' : 'px-2',
        col.align === 'right' ? 'text-right' : 'text-left',
        onClick && !header && 'affirm-loan-hit hover-fill',
        className,
      )}
      style={{
        left,
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
  col,
  last = false,
  scrolled,
  children,
}: {
  col: AffirmIdCol
  last?: boolean
  scrolled: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden py-3 text-sm font-medium whitespace-nowrap tabular-nums',
        col.key === 'name' ? 'pl-4 pr-3' : col.width >= 110 ? 'px-3' : 'px-2',
        col.align === 'right' ? 'text-right' : 'text-left',
        last && !scrolled && 'border-border border-r',
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
  const [idCols, setIdCols] = useState<AffirmIdCol[]>(() =>
    columnsForViewport(typeof window === 'undefined' ? 1200 : window.innerWidth),
  )
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
    const next = columnsForViewport(node.clientWidth)
    setIdCols((current) =>
      current.length === next.length &&
      current.every(
        (col, index) => col.key === next[index].key && col.width === next[index].width,
      )
        ? current
        : next,
    )
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

  const balanceFrozen = idCols.some((col) => col.key === 'balance')
  const idWidth = columnWidth(idCols)
  const tableWidth =
    idWidth +
    (balanceFrozen ? 0 : AFFIRM_BALANCE_COL) +
    months.length * AFFIRM_MONTH_COL
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
            className="drag-scroll affirm-scroll min-w-0"
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
                {idCols.map((col) => (
                  <col key={col.key} style={{ width: col.width }} />
                ))}
                {balanceFrozen ? null : (
                  <col style={{ width: AFFIRM_BALANCE_COL }} />
                )}
                {months.map((ym) => (
                  <col key={ym} style={{ width: AFFIRM_MONTH_COL }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-muted-foreground text-xs">
                  {idCols.map((col, index) => {
                    const headerSort =
                      col.key === 'name'
                        ? 'name'
                        : col.key === 'last'
                          ? 'last'
                          : null
                    return (
                      <FreezeCell
                        key={col.key}
                        col={col}
                        left={stickyLeft(idCols, index)}
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
                  {balanceFrozen ? null : (
                    <th className="border-border relative z-0 border-b px-3 py-2 text-right font-medium whitespace-nowrap">
                      Balance
                    </th>
                  )}
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
                      {idCols.map((col, index) => {
                        const text =
                          col.key === 'name'
                            ? name
                            : col.key === 'last'
                              ? loan.lastPayment
                                ? formatYm(loan.lastPayment)
                                : ''
                              : formatUsd(loan.remaining)
                        return (
                          <FreezeCell
                            key={col.key}
                            col={col}
                            left={stickyLeft(idCols, index)}
                            className={cn(
                              'py-2',
                              col.key === 'name' && 'truncate',
                              col.key === 'balance' && 'tabular-nums',
                              !lastRow && 'border-border border-b',
                            )}
                            title={col.key === 'name' ? name : undefined}
                            onClick={col.key === 'name' ? openLoan : undefined}
                          >
                            {text}
                          </FreezeCell>
                        )
                      })}
                      {balanceFrozen ? null : (
                        <td
                          className={cn(
                            'relative z-0 px-3 py-2 text-right tabular-nums whitespace-nowrap',
                            !lastRow && 'border-border border-b',
                          )}
                        >
                          {formatUsd(loan.remaining)}
                        </td>
                      )}
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
            style={{ width: idWidth }}
          />
          <div
            className="sticky-shadow"
            data-scrolled={scrolled ? '' : undefined}
            style={{ left: idWidth }}
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
          {idCols.map((col, index) => (
            <FooterFreeze
              key={col.key}
              col={col}
              last={index === idCols.length - 1}
              scrolled={scrolled}
            >
              {col.key === 'name'
                ? currentLoans.length || ''
                : col.key === 'last'
                  ? currentLoans.length > 0
                    ? formatUsd(allMonthly)
                    : ''
                  : currentLoans.length > 0
                    ? formatUsd(remaining)
                    : ''}
            </FooterFreeze>
          ))}
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
                width:
                  (balanceFrozen ? 0 : AFFIRM_BALANCE_COL) +
                  months.length * AFFIRM_MONTH_COL,
                transform: `translateX(-${scrollLeft}px)`,
              }}
            >
              {balanceFrozen ? null : (
                <div
                  className="shrink-0 px-3 py-3 text-right text-sm font-medium whitespace-nowrap tabular-nums"
                  style={{ width: AFFIRM_BALANCE_COL }}
                >
                  {currentLoans.length > 0 ? formatUsd(remaining) : ''}
                </div>
              )}
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
  'edit-ghost-field border-transparent bg-transparent px-1.5 text-sm shadow-none transition-colors hover:bg-transparent focus-visible:ring-0 focus-visible:ring-transparent sm:px-2.5 dark:bg-transparent dark:hover:bg-transparent'
const AFFIRM_EDIT_BOX =
  'edit-ghost-box rounded-lg border border-transparent transition-colors'
const AFFIRM_EDIT_ROW =
  'grid-cols-[4.5rem_5.25rem_6.75rem_8.5rem_8rem_5.5rem_8rem_28px] gap-1 sm:grid-cols-[7rem_7rem_9rem_8rem_7rem_7.5rem_7.75rem_28px] sm:gap-3'

const EDIT_ORDER = {
  name: 'order-1',
  loanId: 'order-2',
  startDate: 'order-4 sm:order-3',
  startingBalance: 'order-5 sm:order-4',
  monthly: 'order-6 sm:order-5',
  lastPayment: 'order-3 sm:order-6',
  balance: 'order-7',
  remove: 'order-8',
} as const

type AffirmEditSortKey =
  | 'name'
  | 'loanId'
  | 'startDate'
  | 'startingBalance'
  | 'monthly'
  | 'lastPayment'
  | 'balance'

function editSortValue(
  draft: AffirmEditDraft,
  key: AffirmEditSortKey,
  now: Date,
): number | string | null {
  if (key === 'name') return draft.name.trim().toLowerCase() || null
  if (key === 'loanId') return draft.loanId.trim().toLowerCase() || null
  if (key === 'startDate') return draft.startDate || draft.startMonth || null
  if (key === 'startingBalance') return parseUsdInput(draft.startingBalance)
  if (key === 'monthly') return parseUsdInput(draft.monthly)
  const preview = previewAffirmDraft(draft, now)
  if (key === 'lastPayment') return preview?.lastPayment || null
  return preview ? preview.remaining : null
}

function compareEditDrafts(
  left: AffirmEditDraft,
  right: AffirmEditDraft,
  key: AffirmEditSortKey,
  dir: AffirmSortDir,
  now: Date,
) {
  const a = editSortValue(left, key, now)
  const b = editSortValue(right, key, now)
  const emptyA = a == null || a === ''
  const emptyB = b == null || b === ''
  if (emptyA && emptyB) return left.id.localeCompare(right.id)
  if (emptyA) return 1
  if (emptyB) return -1
  let cmp = 0
  if (typeof a === 'number' && typeof b === 'number') cmp = a - b
  else cmp = String(a).localeCompare(String(b))
  if (cmp === 0) return left.id.localeCompare(right.id)
  return dir === 'desc' ? -cmp : cmp
}

type AffirmEditDraft = {
  id: string
  name: string
  loanId: string
  startDate: string
  startMonth: string
  startingBalance: string
  monthly: string
  needsSpending?: boolean
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
    ...(loan.needsSpending ? { needsSpending: true } : {}),
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
    needsSpending: true,
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
      needsSpending: draft.needsSpending,
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
  const [sortKey, setSortKey] = useState<AffirmEditSortKey | null>(null)
  const [sortDir, setSortDir] = useState<AffirmSortDir>('desc')
  const opened = useRef(false)

  useLayoutEffect(() => {
    if (!open) {
      opened.current = false
      return
    }
    if (opened.current) return
    opened.current = true
    const loaded = sortAffirmLoansByDue(loans, new Date()).map(draftFromStored)
    setDrafts(loaded)
    setBaseline(JSON.stringify(loaded))
    setConfirmOpen(false)
    setRemoveId(null)
    setFocusId(null)
    setSortKey(null)
    setSortDir('desc')
  }, [open, loans, now])

  const sortedDrafts = useMemo(() => {
    if (!sortKey) return drafts
    return [...drafts].sort((left, right) =>
      compareEditDrafts(left, right, sortKey, sortDir, now),
    )
  }, [drafts, sortKey, sortDir, now])

  function toggleEditSort(key: AffirmEditSortKey) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('desc')
      return
    }
    setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'))
  }

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
    onSave(sortAffirmLoansByDue(next, new Date()))
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
                'sticky top-0 z-20 grid items-center border-b bg-popover py-2 text-xs font-medium text-muted-foreground',
                AFFIRM_EDIT_ROW,
              )}
            >
              <EditSortLabel
                label="Name"
                align="left"
                className={EDIT_ORDER.name}
                active={sortKey === 'name'}
                dir={sortDir}
                onClick={() => toggleEditSort('name')}
              />
              <EditSortLabel
                label="Loan ID"
                align="left"
                className={EDIT_ORDER.loanId}
                active={sortKey === 'loanId'}
                dir={sortDir}
                onClick={() => toggleEditSort('loanId')}
              />
              <EditSortLabel
                label="Starting date"
                align="left"
                className={EDIT_ORDER.startDate}
                active={sortKey === 'startDate'}
                dir={sortDir}
                onClick={() => toggleEditSort('startDate')}
              />
              <EditSortLabel
                label="Starting balance"
                align="right"
                className={EDIT_ORDER.startingBalance}
                active={sortKey === 'startingBalance'}
                dir={sortDir}
                onClick={() => toggleEditSort('startingBalance')}
              />
              <EditSortLabel
                label="Monthly"
                align="right"
                className={EDIT_ORDER.monthly}
                active={sortKey === 'monthly'}
                dir={sortDir}
                onClick={() => toggleEditSort('monthly')}
              />
              <EditSortLabel
                label="Last payment"
                align="right"
                className={EDIT_ORDER.lastPayment}
                active={sortKey === 'lastPayment'}
                dir={sortDir}
                onClick={() => toggleEditSort('lastPayment')}
              />
              <EditSortLabel
                label="Current balance"
                align="right"
                className={EDIT_ORDER.balance}
                active={sortKey === 'balance'}
                dir={sortDir}
                onClick={() => toggleEditSort('balance')}
              />
              <span className={EDIT_ORDER.remove} />
            </div>
            {sortedDrafts.map((draft) => {
              const preview = previewAffirmDraft(draft, now)
              return (
                <div
                  key={draft.id}
                  className={cn('grid items-center py-1', AFFIRM_EDIT_ROW)}
                >
                  <Input
                    className={cn('h-8', EDIT_ORDER.name, AFFIRM_EDIT_GHOST)}
                    value={draft.name}
                    onChange={(event) =>
                      updateDraft(draft.id, { name: event.target.value })
                    }
                    placeholder="Name"
                    aria-label="Name"
                    autoFocus={focusId === draft.id}
                  />
                  <Input
                    className={cn('h-8 min-w-0', EDIT_ORDER.loanId, AFFIRM_EDIT_GHOST)}
                    value={draft.loanId}
                    onChange={(event) =>
                      updateDraft(draft.id, { loanId: event.target.value })
                    }
                    placeholder="Loan ID"
                    aria-label="Loan ID"
                  />
                  <Input
                    type="date"
                    className={cn('h-8 min-w-0', EDIT_ORDER.startDate, AFFIRM_EDIT_GHOST)}
                    value={draft.startDate}
                    onChange={(event) =>
                      updateDraft(draft.id, { startDate: event.target.value })
                    }
                    aria-label="Starting date"
                  />
                  <AffirmGhostMoney
                    className={EDIT_ORDER.startingBalance}
                    value={draft.startingBalance}
                    onChange={(startingBalance) =>
                      updateDraft(draft.id, { startingBalance })
                    }
                    ariaLabel="Starting balance"
                  />
                  <AffirmGhostMoney
                    className={EDIT_ORDER.monthly}
                    value={draft.monthly}
                    onChange={(monthly) => updateDraft(draft.id, { monthly })}
                    ariaLabel="Monthly payment"
                  />
                  <p
                    className={cn(
                      'pr-2.5 text-right text-sm tabular-nums',
                      EDIT_ORDER.lastPayment,
                    )}
                  >
                    {preview?.lastPayment ? formatYm(preview.lastPayment) : '—'}
                  </p>
                  <p
                    className={cn(
                      'pr-2.5 text-right text-sm tabular-nums',
                      EDIT_ORDER.balance,
                    )}
                  >
                    {preview ? formatUsd(preview.remaining) : '—'}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      'text-muted-foreground justify-self-end hover:bg-transparent',
                      EDIT_ORDER.remove,
                    )}
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

function EditSortLabel({
  label,
  align,
  active,
  dir,
  className,
  onClick,
}: {
  label: string
  align: 'left' | 'right'
  active: boolean
  dir: AffirmSortDir
  className?: string
  onClick: () => void
}) {
  const down = !active || dir === 'desc'
  return (
    <button
      type="button"
      className={cn(
        'flex min-w-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-muted-foreground',
        align === 'right' ? 'justify-end pr-2.5' : 'pl-2.5',
        className,
      )}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      {down ? (
        <ArrowDown className={cn('size-3 shrink-0', !active && 'opacity-40')} />
      ) : (
        <ArrowUp className="size-3 shrink-0" />
      )}
    </button>
  )
}

function AffirmGhostMoney({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div className={cn('flex h-8 min-w-0 items-center justify-end px-2.5', AFFIRM_EDIT_BOX, className)}>
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
        needsSpending: creating || loan?.needsSpending,
      },
      now,
    )
  }, [creating, draft, loan, now])

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
          needsSpending: creating || loan?.needsSpending,
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
      <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-md">
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
