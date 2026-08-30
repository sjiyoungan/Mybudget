import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

import { AppHeader } from '@/components/app-header'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useBudget } from '@/lib/budget-context'
import {
  PAYOFF_STRATEGIES,
  affirmTotals,
  debtFreeLabel,
  formatYm,
  loadDebtPlan,
  monthsUntilPayoff,
  paymentOverride,
  projectDebtPlan,
  resolveCustomOrder,
  saveDebtPlan,
  setMonthPayment,
  strategyLabel,
  type DebtPlanState,
  type PayoffStrategy,
  type PlannerMonth,
} from '@/lib/debt-plan'
import { formatUsd, formatUsdWhole } from '@/lib/format'
import { cn } from '@/lib/utils'

type PlannerView = 'planner' | 'history'

const MONTH_COL = 72
const LABEL_COL = 96
const EXTRA_FILL = 'bg-[#f6f6f6]'
const PLANNER_MONTHS = 18
const PLAN_HORIZON = 120

export function DebtPage() {
  const { debts } = useBudget()
  const [plan, setPlan] = useState<DebtPlanState>(() => loadDebtPlan())
  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    saveDebtPlan(plan)
  }, [plan])

  const months = useMemo(
    () => projectDebtPlan(debts, plan, PLAN_HORIZON, now),
    [debts, plan, now],
  )
  const affirm = affirmTotals(plan.affirmLoans)
  const upcoming = months.filter((row) => row.source === 'plan')
  const history = months.filter((row) => row.source === 'history')
  const freeOn = debtFreeLabel(months)

  return (
    <div className="min-h-svh bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft data-icon="inline-start" />
              Dashboard
            </Link>
          </Button>
          <h1 className="font-heading mt-4 text-3xl font-medium">Debt</h1>
        </div>

        <PlannerCard
          debts={debts}
          plan={plan}
          freeOn={freeOn}
          history={history}
          upcoming={upcoming.slice(0, PLANNER_MONTHS)}
          onPlanChange={setPlan}
        />

        <AffirmCard loans={plan.affirmLoans} totals={affirm} />
      </main>
    </div>
  )
}

function PlannerCard({
  debts,
  plan,
  freeOn,
  history,
  upcoming,
  onPlanChange,
}: {
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  freeOn: string
  history: PlannerMonth[]
  upcoming: PlannerMonth[]
  onPlanChange: (plan: DebtPlanState) => void
}) {
  const [view, setView] = useState<PlannerView>('planner')
  const [customOpen, setCustomOpen] = useState(false)
  const rows = view === 'planner' ? upcoming : [...history].reverse()

  function chooseStrategy(strategy: PayoffStrategy) {
    if (strategy === 'custom') {
      setCustomOpen(true)
      return
    }
    onPlanChange({ ...plan, strategy })
  }

  return (
    <Card className="pb-1">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <CardTitle>Payoff planner</CardTitle>
            <p className="text-muted-foreground text-sm">{freeOn}</p>
          </div>
          <div className="flex items-center gap-1">
            <StrategyMenu
              strategy={plan.strategy}
              onChoose={chooseStrategy}
            />
            <ViewTab
              label="Planner"
              active={view === 'planner'}
              onClick={() => setView('planner')}
            />
            <ViewTab
              label="History"
              active={view === 'history'}
              onClick={() => setView('history')}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <MonthTable
          debts={debts}
          plan={plan}
          months={rows}
          showStart={view === 'planner'}
          editPaid={view === 'planner'}
          onPaidChange={(year, month, debtId, amount) => {
            onPlanChange(setMonthPayment(plan, year, month, debtId, amount))
          }}
        />
      </CardContent>
      <CustomOrderDialog
        open={customOpen}
        debts={debts}
        order={plan.customOrder}
        onOpenChange={setCustomOpen}
        onSave={(customOrder) => {
          onPlanChange({ ...plan, strategy: 'custom', customOrder })
          setCustomOpen(false)
        }}
      />
    </Card>
  )
}

function StrategyMenu({
  strategy,
  onChoose,
}: {
  strategy: PayoffStrategy
  onChoose: (strategy: PayoffStrategy) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover-fill flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm"
        >
          {strategyLabel(strategy)}
          <ChevronDown className="text-muted-foreground size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PAYOFF_STRATEGIES.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="pr-8"
            onSelect={() => onChoose(item.id)}
          >
            {item.label}
            {item.id === strategy ? (
              <Check className="pointer-events-none absolute right-2 size-4" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CustomOrderDialog({
  open,
  debts,
  order,
  onOpenChange,
  onSave,
}: {
  open: boolean
  debts: { id: string; lender: string }[]
  order: string[]
  onOpenChange: (open: boolean) => void
  onSave: (order: string[]) => void
}) {
  const [draft, setDraft] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setDraft(resolveCustomOrder(debts.map((debt) => debt.id), order))
  }, [open, debts, order])

  function move(index: number, delta: number) {
    const next = index + delta
    if (next < 0 || next >= draft.length) return
    const copy = [...draft]
    const [item] = copy.splice(index, 1)
    copy.splice(next, 0, item)
    setDraft(copy)
  }

  const named = draft
    .map((id) => debts.find((debt) => debt.id === id))
    .filter((debt): debt is { id: string; lender: string } => debt != null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Payoff order</DialogTitle>
          <DialogDescription>
            Extra payments go to 1st until it is paid off, then 2nd, and so on.
          </DialogDescription>
        </DialogHeader>
        <ol className="mt-2 grid">
          {named.map((debt, index) => (
            <li
              key={debt.id}
              className="flex items-center gap-2 rounded-lg px-1 py-1"
            >
              <span className="text-muted-foreground w-5 text-sm tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm">{debt.lender}</span>
              <button
                type="button"
                className="gear-button rounded-md p-1 disabled:opacity-30"
                aria-label={`Move ${debt.lender} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                className="gear-button rounded-md p-1 disabled:opacity-30"
                aria-label={`Move ${debt.lender} down`}
                disabled={index === named.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown className="size-4" />
              </button>
            </li>
          ))}
        </ol>
        <DialogFooter className="sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onSave(draft)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm',
        active
          ? 'bg-[#f0f0f0] font-medium'
          : 'text-muted-foreground hover-fill',
      )}
    >
      {label}
    </button>
  )
}

function MonthTable({
  debts,
  plan,
  months,
  showStart,
  editPaid,
  onPaidChange,
}: {
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  months: PlannerMonth[]
  showStart: boolean
  editPaid: boolean
  onPaidChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    scroll: 0,
    pointerId: -1,
  })
  const years = groupMonthsByYear(months)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    if (
      event.target instanceof Element &&
      event.target.closest('input, button, [data-no-drag]')
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

  return (
    <div className="planner-scroll relative">
      <div
        ref={scrollerRef}
        className="drag-scroll"
        onScroll={() => {
          const el = scrollerRef.current
          setScrolled((el?.scrollLeft ?? 0) > 0)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 select-none text-sm">
          <colgroup>
            <col style={{ width: MONTH_COL }} />
            <col style={{ width: LABEL_COL }} />
          </colgroup>
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="sticky left-0 z-20 bg-card pt-2 pr-3 pb-2 font-medium">
                Month
              </th>
              <th className="sticky z-20 bg-card pt-2 pr-4 pb-2 font-medium" style={{ left: MONTH_COL }}>
                <span className="sr-only">Line</span>
              </th>
            {debts.map((debt) => (
              <th
                key={debt.id}
                className="px-5 pt-2 pb-2 text-center font-medium whitespace-nowrap"
              >
                {debt.lender}
              </th>
            ))}
            <th className="total-rule px-5 pt-2 pb-2 text-right font-medium">
              Total
            </th>
          </tr>
          <HairlineRow debtCount={debts.length} sticky="sticky left-0 z-20 bg-card p-0" />
        </thead>
        <tbody>
          {years.map((group, groupIndex) => (
            <YearGroupRows
              key={group.year}
              year={group.year}
              months={group.months}
              debts={debts}
              plan={plan}
              showStart={showStart && groupIndex === 0}
              spaced={groupIndex > 0}
              lastGroup={groupIndex === years.length - 1}
              editPaid={editPaid}
              onPaidChange={onPaidChange}
            />
          ))}
        </tbody>
      </table>
      </div>
      <div
        className="sticky-edge"
        data-scrolled={scrolled ? '' : undefined}
        style={{ width: MONTH_COL + LABEL_COL }}
      />
      <div
        className="sticky-shadow"
        data-scrolled={scrolled ? '' : undefined}
        style={{ left: MONTH_COL + LABEL_COL }}
      />
    </div>
  )
}

function groupMonthsByYear(months: PlannerMonth[]) {
  const groups: { year: number; months: PlannerMonth[] }[] = []
  for (const row of months) {
    const last = groups[groups.length - 1]
    if (last && last.year === row.year) {
      last.months.push(row)
    } else {
      groups.push({ year: row.year, months: [row] })
    }
  }
  return groups
}

function YearGroupRows({
  year,
  months,
  debts,
  plan,
  showStart,
  spaced,
  lastGroup,
  editPaid,
  onPaidChange,
}: {
  year: number
  months: PlannerMonth[]
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  showStart: boolean
  spaced: boolean
  lastGroup: boolean
  editPaid: boolean
  onPaidChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
}) {
  return (
    <>
      {showStart ? null : (
        <tr>
          <td
            colSpan={2}
            className={cn(
              'text-muted-foreground sticky left-0 z-10 bg-card text-xs font-medium',
              spaced ? 'pt-6 pb-1' : 'pb-1',
            )}
          >
            {year}
          </td>
          <td
            colSpan={debts.length}
            className={spaced ? 'pt-6' : undefined}
          />
          <td className={cn('total-rule', spaced && 'pt-6')} />
        </tr>
      )}
      {months.map((row, index) => (
        <MonthBlock
          key={`${row.source}-${row.year}-${row.month}`}
          year={year}
          debts={debts}
          plan={plan}
          row={row}
          showStart={showStart && index === 0}
          last={lastGroup && index === months.length - 1}
          editPaid={editPaid}
          onPaidChange={onPaidChange}
        />
      ))}
    </>
  )
}

function MonthBlock({
  year,
  debts,
  plan,
  row,
  showStart,
  last,
  editPaid,
  onPaidChange,
}: {
  year: number
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  row: PlannerMonth
  showStart: boolean
  last: boolean
  editPaid: boolean
  onPaidChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
}) {
  const paidById = new Map(row.lines.map((line) => [line.debtId, line]))
  const label = formatMonthName(row.month)
  const startTotal = roundCents(
    row.lines.reduce((sum, line) => sum + line.start, 0),
  )

  function extraOn(debtId: string) {
    return (paidById.get(debtId)?.extra ?? 0) > 0.005
  }

  return (
    <>
      {showStart ? (
        <>
          <tr>
            <td className="text-muted-foreground sticky left-0 z-10 bg-card py-1.5 pr-3 text-xs font-medium">
              {year}
            </td>
            <LabelCell>Start</LabelCell>
            {debts.map((debt) => {
              const line = paidById.get(debt.id)
              return (
                <AmountCell
                  key={`${debt.id}-start`}
                  value={line?.start ?? 0}
                  highlighted={extraOn(debt.id)}
                />
              )
            })}
            <td className="total-rule px-5 py-1.5 text-right tabular-nums">
              {plannerUsd(startTotal)}
            </td>
          </tr>
          <HairlineRow debtCount={debts.length} />
        </>
      ) : null}
      <tr>
        <MonthCell label={label} rowSpan={2} />
        <LabelCell>Paid</LabelCell>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const amount = line?.paid ?? 0
          if (editPaid) {
            return (
              <PaidCell
                key={`${debt.id}-paid`}
                value={amount}
                overridden={
                  paymentOverride(plan, debt.id, row.year, row.month) != null
                }
                muted={extraOn(debt.id)}
                faint={!extraOn(debt.id)}
                highlighted={extraOn(debt.id)}
                onCommit={(next) => {
                  onPaidChange(row.year, row.month, debt.id, next)
                }}
              />
            )
          }
          return (
            <AmountCell
              key={`${debt.id}-paid`}
              value={amount}
              muted={extraOn(debt.id)}
              faint={!extraOn(debt.id)}
              highlighted={extraOn(debt.id)}
            />
          )
        })}
        <td className="total-rule text-muted-foreground px-5 py-1.5 text-right tabular-nums">
          {plannerUsd(row.totalPaid)}
        </td>
      </tr>
      <tr>
        <LabelCell>End balance</LabelCell>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const balance = line?.balance ?? 0
          return (
            <AmountCell
              key={`${debt.id}-bal`}
              value={balance}
              highlighted={extraOn(debt.id)}
            />
          )
        })}
        <td className="total-rule px-5 py-1.5 text-right font-medium tabular-nums">
          {plannerUsd(row.remainingTotal)}
        </td>
      </tr>
      {last ? null : <HairlineRow debtCount={debts.length} />}
    </>
  )
}

function HairlineRow({
  debtCount,
  sticky = 'sticky left-0 z-10 bg-card p-0',
}: {
  debtCount: number
  sticky?: string
}) {
  return (
    <tr>
      <td colSpan={2} className={sticky}>
        <div className="bg-border h-px" />
      </td>
      <td colSpan={debtCount} className="p-0">
        <div className="bg-border h-px" />
      </td>
      <td className="total-rule p-0">
        <div className="bg-border h-px" />
      </td>
    </tr>
  )
}

function plannerUsd(value: number) {
  return Math.round(value) === 0 ? '' : formatUsdWhole(value)
}

function formatMonthName(month: number) {
  return new Date(2026, month, 1).toLocaleDateString('en-US', {
    month: 'short',
  })
}

function MonthCell({
  label,
  rowSpan,
}: {
  label: string
  rowSpan: number
}) {
  return (
    <td
      rowSpan={rowSpan}
      className="month-label sticky left-0 z-10 bg-card py-1.5 pr-3 align-top font-medium whitespace-nowrap"
    >
      {label}
    </td>
  )
}

function LabelCell({ children }: { children: string }) {
  return (
    <td
      className="text-muted-foreground sticky z-10 bg-card py-1.5 pr-4 text-xs whitespace-nowrap"
      style={{ left: MONTH_COL }}
    >
      {children}
    </td>
  )
}

function AmountCell({
  value,
  muted = false,
  faint = false,
  highlighted = false,
}: {
  value: number
  muted?: boolean
  faint?: boolean
  highlighted?: boolean
}) {
  return (
    <td
      className={cn(
        'min-w-24 px-5 py-1.5 text-right tabular-nums',
        muted && 'text-muted-foreground',
        faint && 'text-muted-foreground/40',
        highlighted && EXTRA_FILL,
      )}
    >
      {plannerUsd(value)}
    </td>
  )
}

function PaidCell({
  value,
  overridden,
  muted = false,
  faint = false,
  highlighted = false,
  onCommit,
}: {
  value: number
  overridden: boolean
  muted?: boolean
  faint?: boolean
  highlighted?: boolean
  onCommit: (amount: number | null) => void
}) {
  const display = plannerUsd(value)

  function commit(raw: string) {
    const trimmed = raw.trim()
    if (trimmed === '') {
      if (overridden) onCommit(null)
      return
    }
    const parsed = parseUsdInput(trimmed)
    if (parsed == null) return
    if (!overridden && Math.round(parsed) === Math.round(value)) return
    onCommit(parsed)
  }

  return (
    <td
      className={cn(
        'min-w-24 px-5 py-1.5 text-right tabular-nums',
        muted && 'text-muted-foreground',
        faint && 'text-muted-foreground/40',
        highlighted && EXTRA_FILL,
      )}
    >
      <input
        key={`${overridden ? 'o' : 'c'}-${Math.round(value)}`}
        data-no-drag
        size={1}
        className="paid-input select-text"
        inputMode="decimal"
        aria-label="Paid"
        defaultValue={display}
        onFocus={(event) => {
          event.currentTarget.value =
            Math.round(value) === 0 ? '' : String(Math.round(value))
          event.currentTarget.select()
        }}
        onBlur={(event) => {
          commit(event.currentTarget.value)
          event.currentTarget.value = display
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = display
            event.currentTarget.blur()
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </td>
  )
}

function parseUsdInput(raw: string) {
  const parsed = Number(raw.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100
}

function AffirmCard({
  loans,
  totals,
}: {
  loans: DebtPlanState['affirmLoans']
  totals: ReturnType<typeof affirmTotals>
}) {
  const active = [...loans]
    .filter((loan) => loan.remaining > 0.005)
    .sort((a, b) => a.lastPayment.localeCompare(b.lastPayment))
  const paidOff = loans.filter((loan) => loan.remaining <= 0.005)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Affirm</CardTitle>
        <CardDescription>
          {totals.active} active loans · {formatUsd(totals.monthly)} / month ·{' '}
          {formatUsd(totals.remaining)} remaining
        </CardDescription>
      </CardHeader>
      <CardContent className="grid">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left text-xs">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Monthly</th>
                <th className="px-3 py-2 text-right font-medium">Remaining</th>
                <th className="px-3 py-2 text-right font-medium">Last payment</th>
                <th className="py-2 pl-3 text-right font-medium">Left</th>
              </tr>
            </thead>
            <tbody>
              {active.map((loan) => {
                const left = monthsUntilPayoff(loan.remaining, loan.monthly)
                return (
                  <tr key={loan.id} className="border-border border-t">
                    <td className="py-2 pr-3">
                      <p>{loan.name}</p>
                      {loan.loanId ? (
                        <p className="text-muted-foreground text-xs">
                          {loan.loanId}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUsd(loan.monthly)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUsd(loan.remaining)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {loan.lastPayment ? formatYm(loan.lastPayment) : '—'}
                    </td>
                    <td className="py-2 pl-3 text-right text-muted-foreground tabular-nums">
                      {left == null ? '—' : `${left} mo`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {paidOff.length > 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            {paidOff.length} already paid off
            {paidOff.length <= 8
              ? `: ${paidOff.map((loan) => loan.name).join(', ')}`
              : ''}
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
