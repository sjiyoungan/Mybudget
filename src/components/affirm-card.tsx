import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Check, Pencil, Plus, X } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
  affirmLoanPayments,
  affirmVisibleMonths,
  completeAffirmLoan,
  formatYm,
  monthKey,
  sortAffirmLoans,
  type AffirmLoan,
} from '@/lib/debt-plan'
import { formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

const AFFIRM_MONTH_COL = 88
const AFFIRM_ID_COLS = [
  { key: 'name', label: 'Name', width: 148, align: 'left' as const },
  { key: 'last', label: 'Last payment', width: 112, align: 'left' as const },
  { key: 'balance', label: 'Balance', width: 96, align: 'right' as const },
] as const
const AFFIRM_ID_WIDTH = AFFIRM_ID_COLS.reduce((sum, col) => sum + col.width, 0)

type AffirmDraft = {
  name: string
  loanId: string
  startMonth: string
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
    startMonth: loan.startMonth,
    startingBalance: loan.startingBalance.toFixed(2),
    monthly: loan.monthly.toFixed(2),
  }
}

function emptyDraft(now: Date): AffirmDraft {
  return {
    name: '',
    loanId: '',
    startMonth: monthKey(now.getFullYear(), now.getMonth()),
    startingBalance: '',
    monthly: '',
  }
}

function FreezeCell({
  index,
  header = false,
  footer = false,
  className,
  title,
  onClick,
  children,
}: {
  index: number
  header?: boolean
  footer?: boolean
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
        'sticky bg-card',
        header ? 'z-20' : footer ? 'z-30' : 'z-10',
        footer && 'bottom-0',
        index === 0 ? 'pl-4 pr-3' : 'px-3',
        col.align === 'right' ? 'text-right' : 'text-left',
        onClick && 'affirm-loan-hit',
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

export function AffirmCard({
  loans,
  now,
  onLoansChange,
}: {
  loans: AffirmLoan[]
  now: Date
  onLoansChange: (loans: AffirmLoan[]) => void
}) {
  const months = useMemo(() => affirmVisibleMonths(loans, now), [loans, now])
  const schedules = useMemo(
    () => loans.map((loan) => ({ loan, payments: affirmLoanPayments(loan) })),
    [loans],
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
    loans.reduce((sum, loan) => sum + loan.monthly, 0),
  )
  const remaining = roundCents(
    loans.reduce((sum, loan) => sum + loan.remaining, 0),
  )

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [moreBelow, setMoreBelow] = useState(false)
  const [canDrag, setCanDrag] = useState(false)
  const [drawerLoanId, setDrawerLoanId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    scroll: 0,
    pointerId: 0,
  })

  const drawerLoan = loans.find((loan) => loan.id === drawerLoanId) ?? null

  function updateScroll() {
    const node = scrollerRef.current
    if (!node) return
    setScrolled(node.scrollLeft > 0)
    setCanDrag(node.scrollWidth > node.clientWidth + 1)
    setMoreBelow(node.scrollTop + node.clientHeight < node.scrollHeight - 1)
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
    setAdding(false)
  }

  return (
    <Card className="pb-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Affirm</CardTitle>
          <button
            type="button"
            className="hover-fill flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm"
            onClick={() => {
              setDrawerLoanId(null)
              setAdding(true)
            }}
          >
            <Plus className="size-3.5" />
            Add
          </button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="relative isolate">
          <div
            ref={scrollerRef}
            className="drag-scroll max-h-[calc(100svh-12rem)] overflow-y-auto"
            data-can-drag={canDrag ? '' : undefined}
            onScroll={updateScroll}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <table className="w-max min-w-full border-separate border-spacing-0 select-none text-sm">
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
                  {AFFIRM_ID_COLS.map((col, index) => (
                    <FreezeCell
                      key={col.key}
                      index={index}
                      header
                      className="border-border border-b py-2 font-medium whitespace-nowrap"
                    >
                      {col.label}
                    </FreezeCell>
                  ))}
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
                  const showName =
                    rowIndex === 0 || loan.name !== loans[rowIndex - 1]?.name
                  function openLoan() {
                    setAdding(false)
                    setDrawerLoanId(loan.id)
                  }
                  return (
                    <tr key={loan.id}>
                      <FreezeCell
                        index={0}
                        className="border-border truncate border-b py-2 whitespace-nowrap"
                        title={showName ? loan.name : undefined}
                        onClick={openLoan}
                      >
                        {showName ? loan.name : ''}
                      </FreezeCell>
                      <FreezeCell
                        index={1}
                        className="border-border border-b py-2 whitespace-nowrap"
                        onClick={openLoan}
                      >
                        {loan.lastPayment ? formatYm(loan.lastPayment) : ''}
                      </FreezeCell>
                      <FreezeCell
                        index={2}
                        className="border-border border-b py-2 tabular-nums"
                        onClick={openLoan}
                      >
                        {formatUsd(loan.remaining)}
                      </FreezeCell>
                      {months.map((ym) => {
                        const amount = payments[ym]
                        return (
                          <td
                            key={ym}
                            className="border-border relative z-0 border-b px-3 py-2 text-right tabular-nums"
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
              <tfoot>
                <tr
                  className="affirm-totals"
                  data-more={moreBelow ? '' : undefined}
                >
                  <FreezeCell
                    index={0}
                    footer
                    className="border-border border-t py-2 font-medium tabular-nums"
                  >
                    {loans.length || ''}
                  </FreezeCell>
                  <FreezeCell
                    index={1}
                    footer
                    className="border-border border-t py-2 font-medium tabular-nums"
                  >
                    {loans.length > 0 ? formatUsd(allMonthly) : ''}
                  </FreezeCell>
                  <FreezeCell
                    index={2}
                    footer
                    className="border-border border-t py-2 font-medium tabular-nums"
                  >
                    {loans.length > 0 ? formatUsd(remaining) : ''}
                  </FreezeCell>
                  {months.map((ym) => (
                    <td
                      key={ym}
                      className="border-border sticky bottom-0 z-20 border-t bg-card px-3 py-2 text-right font-medium tabular-nums"
                    >
                      {monthTotals[ym] > 0.005 ? formatUsd(monthTotals[ym]) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
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
        </div>
      </CardContent>
      <AffirmLoanDrawer
        open={adding || drawerLoan != null}
        loan={drawerLoan}
        creating={adding}
        now={now}
        onClose={() => {
          setAdding(false)
          setDrawerLoanId(null)
        }}
        onSave={saveLoan}
      />
    </Card>
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
    if (!draft.startMonth) return null
    return completeAffirmLoan(
      {
        id: loan?.id,
        name: draft.name,
        loanId: draft.loanId,
        startMonth: draft.startMonth,
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
    if (startingBalance == null || monthly == null || !draft.startMonth) return
    onSave(
      completeAffirmLoan(
        {
          id: loan?.id,
          name: draft.name,
          loanId: draft.loanId,
          startMonth: draft.startMonth,
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
        <div className="grid gap-4 px-4 pb-6">
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
            label="Starting month"
            editing={editing}
            value={draft.startMonth}
            display={loan?.startMonth ? formatYm(loan.startMonth) : '—'}
            type="month"
            onChange={(startMonth) =>
              setDraft((current) => ({ ...current, startMonth }))
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
