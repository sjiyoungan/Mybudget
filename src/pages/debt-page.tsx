import { useEffect, useMemo, useState } from 'react'
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
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()
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
          currentYear={thisYear}
          currentMonth={thisMonth}
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
  currentYear,
  currentMonth,
}: {
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  onPlanChange: (plan: DebtPlanState) => void
  history: PlannerMonth[]
  upcoming: PlannerMonth[]
  currentYear: number
  currentMonth: number
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
            extraOnly={view === 'planner'}
            showStart={view === 'planner'}
            currentYear={currentYear}
            currentMonth={currentMonth}
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
  extraOnly,
  showStart,
  currentYear,
  currentMonth,
  focus,
  onFocus,
}: {
  debts: { id: string; lender: string }[]
  months: PlannerMonth[]
  extraOnly: boolean
  showStart: boolean
  currentYear: number
  currentMonth: number
  focus: MonthFocus | null
  onFocus: (focus: MonthFocus) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-max min-w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left text-xs">
            <th className="sticky left-0 z-20 bg-card py-2 pr-3 font-medium">
              Month
            </th>
            <th className="sticky left-24 z-20 bg-card py-2 pr-4 font-medium">
              <span className="sr-only">Line</span>
            </th>
            {debts.map((debt) => (
              <th
                key={debt.id}
                className="px-2 py-2 text-right font-medium whitespace-nowrap"
              >
                {debt.lender}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {months.map((row, index) => {
            const current =
              row.year === currentYear && row.month === currentMonth
            return (
              <MonthBlock
                key={`${row.source}-${row.year}-${row.month}`}
                debts={debts}
                row={row}
                extraOnly={extraOnly}
                showStart={showStart && index === 0}
                current={current}
                focus={focus}
                onFocus={onFocus}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MonthBlock({
  debts,
  row,
  extraOnly,
  showStart,
  current,
  focus,
  onFocus,
}: {
  debts: { id: string; lender: string }[]
  row: PlannerMonth
  extraOnly: boolean
  showStart: boolean
  current: boolean
  focus: MonthFocus | null
  onFocus: (focus: MonthFocus) => void
}) {
  const paidById = new Map(row.lines.map((line) => [line.debtId, line]))
  const label = formatYearMonth(row.year, row.month)
  const rowSpan = showStart ? 3 : 2
  const rowClass = cn(current && 'bg-[#f6f6f6]')
  const sticky = current ? 'bg-[#f6f6f6]' : 'bg-card'
  const startTotal = roundCents(
    row.lines.reduce((sum, line) => sum + line.start, 0),
  )
  const paidTotal = extraOnly ? row.extraPaid : row.totalPaid

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

  return (
    <>
      {showStart ? (
        <tr className={rowClass}>
          <MonthCell
            label={label}
            rowSpan={rowSpan}
            className={sticky}
          />
          <LabelCell className={sticky}>Start</LabelCell>
          {debts.map((debt) => {
            const line = paidById.get(debt.id)
            return (
              <AmountCell
                key={`${debt.id}-start`}
                value={line?.start ?? 0}
                selected={selected(debt.id)}
                label={`${debt.lender} start`}
                onClick={() => selectDebt(debt.id)}
              />
            )
          })}
          <td className="px-2 py-1.5 text-right tabular-nums">
            {formatUsd(startTotal)}
          </td>
        </tr>
      ) : null}
      <tr className={rowClass}>
        {showStart ? null : (
          <MonthCell label={label} rowSpan={rowSpan} className={sticky} />
        )}
        <LabelCell className={sticky}>Paid</LabelCell>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const amount = extraOnly ? (line?.extra ?? 0) : (line?.paid ?? 0)
          return (
            <AmountCell
              key={`${debt.id}-paid`}
              value={amount}
              empty={amount <= 0.005}
              muted
              selected={selected(debt.id)}
              label={`${debt.lender} paid`}
              onClick={() => selectDebt(debt.id)}
            />
          )
        })}
        <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums">
          {paidTotal > 0.005 ? formatUsd(paidTotal) : ''}
        </td>
      </tr>
      <tr className={cn('border-border border-b', rowClass)}>
        <LabelCell className={sticky}>End balance</LabelCell>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const balance = line?.balance ?? 0
          return (
            <AmountCell
              key={`${debt.id}-bal`}
              value={balance}
              muted={balance <= 0.005}
              selected={selected(debt.id)}
              label={`${debt.lender} end balance`}
              onClick={() => selectDebt(debt.id)}
            />
          )
        })}
        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
          {formatUsd(row.remainingTotal)}
        </td>
      </tr>
    </>
  )
}

function MonthCell({
  label,
  rowSpan,
  className,
}: {
  label: string
  rowSpan: number
  className: string
}) {
  return (
    <td
      rowSpan={rowSpan}
      className={cn(
        'sticky left-0 z-10 w-24 py-1.5 pr-3 align-top font-medium whitespace-nowrap',
        className,
      )}
    >
      {label}
    </td>
  )
}

function LabelCell({
  children,
  className,
}: {
  children: string
  className: string
}) {
  return (
    <td
      className={cn(
        'text-muted-foreground sticky left-24 z-10 w-28 py-1.5 pr-4 text-xs whitespace-nowrap',
        className,
      )}
    >
      {children}
    </td>
  )
}

function AmountCell({
  value,
  empty = false,
  muted = false,
  selected,
  label,
  onClick,
}: {
  value: number
  empty?: boolean
  muted?: boolean
  selected: boolean
  label: string
  onClick: () => void
}) {
  return (
    <td className="p-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'hover-fill min-w-24 w-full cursor-pointer px-2 py-1.5 text-right tabular-nums',
          muted && 'text-muted-foreground',
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
