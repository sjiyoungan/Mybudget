import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { useBudget } from '@/lib/budget-context'
import {
  affirmTotals,
  formatYearMonth,
  formatYm,
  loadDebtPlan,
  monthsUntilPayoff,
  projectDebtPlan,
  saveDebtPlan,
  setMonthCharge,
  type DebtPlanState,
  type PlannerLine,
  type PlannerMonth,
} from '@/lib/debt-plan'
import { formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

type PlannerView = 'planner' | 'history'

const MONTH_COL = 72
const LABEL_COL = 96

type MonthFocus = {
  year: number
  month: number
  source: PlannerMonth['source']
  debtId: string
}

export function DebtPage() {
  const { debts } = useBudget()
  const [plan, setPlan] = useState<DebtPlanState>(() => loadDebtPlan())
  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    saveDebtPlan(plan)
  }, [plan])

  const months = useMemo(
    () => projectDebtPlan(debts, plan, 18, now),
    [debts, plan, now],
  )
  const affirm = affirmTotals(plan.affirmLoans)
  const upcoming = months.filter((row) => row.source === 'plan')
  const history = months.filter((row) => row.source === 'history')

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
          onPlanChange={setPlan}
          history={history}
          upcoming={upcoming}
        />

        <AffirmCard loans={plan.affirmLoans} totals={affirm} />
      </main>
    </div>
  )
}

function PlannerCard({
  debts,
  plan,
  onPlanChange,
  history,
  upcoming,
}: {
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  onPlanChange: (plan: DebtPlanState) => void
  history: PlannerMonth[]
  upcoming: PlannerMonth[]
}) {
  const [view, setView] = useState<PlannerView>('planner')
  const [focus, setFocus] = useState<MonthFocus | null>(null)
  const rows = view === 'planner' ? upcoming : [...history].reverse()
  const focusedMonth = focus
    ? (view === 'planner' ? upcoming : history).find(
        (row) =>
          row.year === focus.year &&
          row.month === focus.month &&
          row.source === focus.source,
      )
    : undefined
  const focusedLine = focusedMonth?.lines.find(
    (line) => line.debtId === focus?.debtId,
  )
  const focusedDebt = debts.find((debt) => debt.id === focus?.debtId)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Payoff planner</CardTitle>
            <div className="flex gap-1">
              <ViewTab
                label="Planner"
                active={view === 'planner'}
                onClick={() => {
                  setView('planner')
                  setFocus(null)
                }}
              />
              <ViewTab
                label="History"
                active={view === 'history'}
                onClick={() => {
                  setView('history')
                  setFocus(null)
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MonthTable
            debts={debts}
            months={rows}
            showStart={view === 'planner'}
            focus={focus}
            onFocus={setFocus}
          />
        </CardContent>
      </Card>

      <MonthDetailDrawer
        open={focus != null && focusedLine != null && focusedDebt != null}
        debtName={focusedDebt?.lender ?? ''}
        month={focusedMonth}
        line={focusedLine}
        canEditSpend={focusedMonth?.source === 'plan'}
        onOpenChange={(open) => {
          if (!open) setFocus(null)
        }}
        onSpendChange={(amount) => {
          if (!focus) return
          onPlanChange(
            setMonthCharge(plan, focus.year, focus.month, focus.debtId, amount),
          )
        }}
      />
    </>
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
  months,
  showStart,
  focus,
  onFocus,
}: {
  debts: { id: string; lender: string }[]
  months: PlannerMonth[]
  showStart: boolean
  focus: MonthFocus | null
  onFocus: (focus: MonthFocus) => void
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
        onClickCapture={(event) => {
          if (!drag.current.moved) return
          event.preventDefault()
          event.stopPropagation()
          drag.current.moved = false
        }}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 select-none text-sm">
          <colgroup>
            <col style={{ width: MONTH_COL }} />
            <col style={{ width: LABEL_COL }} />
          </colgroup>
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="sticky left-0 z-20 bg-card py-2 pr-3 font-medium">
                Month
              </th>
              <th className="sticky z-20 bg-card py-2 pr-4 font-medium" style={{ left: MONTH_COL }}>
                <span className="sr-only">Line</span>
              </th>
            {debts.map((debt) => (
              <th
                key={debt.id}
                className="px-5 py-2 text-right font-medium whitespace-nowrap"
              >
                {debt.lender}
              </th>
            ))}
            <th className="px-5 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {years.map((group, groupIndex) => (
            <YearGroupRows
              key={group.year}
              year={group.year}
              months={group.months}
              debts={debts}
              showStart={showStart && groupIndex === 0}
              spaced={groupIndex > 0}
              focus={focus}
              onFocus={onFocus}
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
  showStart,
  spaced,
  focus,
  onFocus,
}: {
  year: number
  months: PlannerMonth[]
  debts: { id: string; lender: string }[]
  showStart: boolean
  spaced: boolean
  focus: MonthFocus | null
  onFocus: (focus: MonthFocus) => void
}) {
  return (
    <>
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
          colSpan={debts.length + 1}
          className={spaced ? 'pt-6' : undefined}
        />
      </tr>
      {months.map((row, index) => (
        <MonthBlock
          key={`${row.source}-${row.year}-${row.month}`}
          debts={debts}
          row={row}
          showStart={showStart && index === 0}
          focus={focus}
          onFocus={onFocus}
        />
      ))}
    </>
  )
}

function MonthBlock({
  debts,
  row,
  showStart,
  focus,
  onFocus,
}: {
  debts: { id: string; lender: string }[]
  row: PlannerMonth
  showStart: boolean
  focus: MonthFocus | null
  onFocus: (focus: MonthFocus) => void
}) {
  const paidById = new Map(row.lines.map((line) => [line.debtId, line]))
  const label = formatMonthName(row.month)
  const rowSpan = showStart ? 3 : 2
  const startTotal = roundCents(
    row.lines.reduce((sum, line) => sum + line.start, 0),
  )

  function selectDebt(debtId: string) {
    onFocus({
      year: row.year,
      month: row.month,
      source: row.source,
      debtId,
    })
  }

  function selected(debtId: string) {
    return (
      focus != null &&
      focus.year === row.year &&
      focus.month === row.month &&
      focus.source === row.source &&
      focus.debtId === debtId
    )
  }

  function extraOn(debtId: string) {
    return (paidById.get(debtId)?.extra ?? 0) > 0.005
  }

  return (
    <>
      {showStart ? (
        <tr>
          <MonthCell label={label} rowSpan={rowSpan} />
          <LabelCell>Start</LabelCell>
          {debts.map((debt) => {
            const line = paidById.get(debt.id)
            return (
              <AmountCell
                key={`${debt.id}-start`}
                value={line?.start ?? 0}
                highlighted={extraOn(debt.id)}
                selected={selected(debt.id)}
                label={`${debt.lender} start`}
                onClick={() => selectDebt(debt.id)}
              />
            )
          })}
          <td className="px-5 py-1.5 text-right tabular-nums">
            {formatUsd(startTotal)}
          </td>
        </tr>
      ) : null}
      <tr>
        {showStart ? null : <MonthCell label={label} rowSpan={rowSpan} />}
        <LabelCell>Paid</LabelCell>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const amount = line?.paid ?? 0
          return (
            <AmountCell
              key={`${debt.id}-paid`}
              value={amount}
              empty={amount <= 0.005}
              muted={!extraOn(debt.id)}
              highlighted={extraOn(debt.id)}
              selected={selected(debt.id)}
              label={`${debt.lender} paid`}
              onClick={() => selectDebt(debt.id)}
            />
          )
        })}
        <td className="text-muted-foreground px-5 py-1.5 text-right tabular-nums">
          {row.totalPaid > 0.005 ? formatUsd(row.totalPaid) : ''}
        </td>
      </tr>
      <tr className="border-border border-b">
        <LabelCell>End balance</LabelCell>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const balance = line?.balance ?? 0
          return (
            <AmountCell
              key={`${debt.id}-bal`}
              value={balance}
              muted={balance <= 0.005}
              highlighted={extraOn(debt.id)}
              selected={selected(debt.id)}
              label={`${debt.lender} end balance`}
              onClick={() => selectDebt(debt.id)}
            />
          )
        })}
        <td className="px-5 py-1.5 text-right font-medium tabular-nums">
          {formatUsd(row.remainingTotal)}
        </td>
      </tr>
    </>
  )
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
      className="sticky left-0 z-10 bg-card py-1.5 pr-3 align-top font-medium whitespace-nowrap"
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
  empty = false,
  muted = false,
  highlighted = false,
  selected,
  label,
  onClick,
}: {
  value: number
  empty?: boolean
  muted?: boolean
  highlighted?: boolean
  selected: boolean
  label: string
  onClick: () => void
}) {
  return (
    <td className={cn('p-0', highlighted && !selected && 'bg-[#f6f6f6]')}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'hover-fill min-w-24 w-full cursor-pointer px-5 py-1.5 text-right tabular-nums',
          muted && 'text-muted-foreground',
          highlighted && !selected && 'bg-[#f6f6f6]',
          selected && 'hover-fill-active',
        )}
      >
        {empty ? '' : formatUsd(value)}
      </button>
    </td>
  )
}

function MonthDetailDrawer({
  open,
  debtName,
  month,
  line,
  canEditSpend,
  onOpenChange,
  onSpendChange,
}: {
  open: boolean
  debtName: string
  month?: PlannerMonth
  line?: PlannerLine
  canEditSpend: boolean
  onOpenChange: (open: boolean) => void
  onSpendChange: (amount: number) => void
}) {
  const [spend, setSpend] = useState('')

  useEffect(() => {
    setSpend(line ? String(line.charged) : '')
  }, [line, month?.year, month?.month])

  const title = month
    ? `${debtName} · ${formatYearMonth(month.year, month.month)}`
    : debtName

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent className="account-drawer data-[vaul-drawer-direction=right]:h-full">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>
            Interest, spend, and extra stay in this detail.
          </DrawerDescription>
        </DrawerHeader>
        {line ? (
          <div className="grid gap-3 px-4 pb-6">
            <DetailLine label="Start" value={formatUsd(line.start)} />
            <DetailLine label="Interest" value={formatUsd(line.interest)} />
            {canEditSpend ? (
              <label className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                <span className="text-muted-foreground">Spent</span>
                <Input
                  className="h-8 w-28 text-right tabular-nums"
                  inputMode="decimal"
                  value={spend}
                  onChange={(event) => setSpend(event.target.value)}
                  onBlur={() => {
                    const parsed = Number.parseFloat(spend)
                    onSpendChange(Number.isFinite(parsed) ? parsed : 0)
                  }}
                />
              </label>
            ) : (
              <DetailLine label="Spent" value={formatUsd(line.charged)} />
            )}
            <DetailLine label="Paid" value={formatUsd(line.paid)} />
            {line.extra > 0.005 ? (
              <DetailLine label="Extra" value={formatUsd(line.extra)} />
            ) : null}
            <DetailLine label="End balance" value={formatUsd(line.balance)} />
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
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
