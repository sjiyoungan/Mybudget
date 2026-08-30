import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { AppHeader } from '@/components/app-header'
import { DebtsCard } from '@/components/budget-cards'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBudget } from '@/lib/budget-context'
import {
  affirmTotals,
  formatYearMonth,
  formatYm,
  loadDebtPlan,
  monthsUntilPayoff,
  payoffMonth,
  projectDebtPlan,
  saveDebtPlan,
  yearToDateExtra,
  yearToDateInterest,
  type DebtPlanState,
  type PlannerMonth,
} from '@/lib/debt-plan'
import { formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

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
  const totalBalance = debts.reduce((sum, item) => sum + item.balance, 0)
  const totalMinimum = debts.reduce((sum, item) => sum + item.minimum, 0)
  const currentPlan = months.find(
    (row) => row.source === 'plan' && row.year === thisYear && row.month === thisMonth,
  )
  const ytdInterest = yearToDateInterest(months, thisYear, thisMonth)
  const ytdExtra = yearToDateExtra(months, thisYear, thisMonth)
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

        <section className="metric-grid">
          <SummaryStat label="Total balance" amount={totalBalance} />
          <SummaryStat label="Total minimums" amount={totalMinimum} />
          <SummaryStat
            label="Extra this month"
            amount={currentPlan?.extraPaid ?? 0}
          />
          <SummaryStat label="Interest paid this year" amount={ytdInterest} />
        </section>

        <p className="text-muted-foreground -mt-3 text-sm">
          Extra paid this year: {formatUsd(ytdExtra)}. Snowball leftover goes to{' '}
          {debts.find((item) => item.id === plan.snowballDebtId)?.lender ??
            'the selected card'}
          .
        </p>

        <DebtsCard />

        <PlannerCard
          debts={debts}
          plan={plan}
          onPlanChange={setPlan}
          history={history}
          upcoming={upcoming}
          currentYear={thisYear}
          currentMonth={thisMonth}
        />

        <AffirmCard
          loans={plan.affirmLoans}
          totals={affirm}
        />
      </main>
    </div>
  )
}

function SummaryStat({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="w-full">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-4 text-2xl font-normal tabular-nums">{formatUsd(amount)}</p>
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
  const payoffNotes = debts
    .map((debt) => {
      const month = payoffMonth(upcoming, debt.id)
      if (!month) return null
      return {
        id: debt.id,
        lender: debt.lender,
        when: formatYearMonth(month.year, month.month),
      }
    })
    .filter((item): item is { id: string; lender: string; when: string } => item != null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payoff planner</CardTitle>
        <CardDescription>
          Minimums on every card, leftover of the monthly budget onto the snowball
          card. P BoA also gets the $682 recurring charge from the sheet.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Monthly debt budget</span>
            <Input
              className="h-8 w-32 tabular-nums"
              inputMode="decimal"
              value={plan.monthlyBudget}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value)
                onPlanChange({
                  ...plan,
                  monthlyBudget: Number.isFinite(parsed) ? parsed : 0,
                })
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Paying extra on</span>
            <Select
              value={plan.snowballDebtId}
              onValueChange={(value) =>
                onPlanChange({ ...plan, snowballDebtId: value })
              }
            >
              <SelectTrigger className="h-8 min-w-40" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {debts.map((debt) => (
                  <SelectItem key={debt.id} value={debt.id}>
                    {debt.lender}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        {payoffNotes.length > 0 ? (
          <p className="text-sm">
            {payoffNotes.map((note, index) => (
              <span key={note.id}>
                {index > 0 ? ' · ' : null}
                <span className="font-medium">{note.lender}</span>
                <span className="text-muted-foreground"> {note.when}</span>
              </span>
            ))}
          </p>
        ) : null}

        <MonthTable
          debts={debts}
          months={[...history, ...upcoming]}
          currentYear={currentYear}
          currentMonth={currentMonth}
        />
      </CardContent>
    </Card>
  )
}

function MonthTable({
  debts,
  months,
  currentYear,
  currentMonth,
}: {
  debts: { id: string; lender: string }[]
  months: PlannerMonth[]
  currentYear: number
  currentMonth: number
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-max min-w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left text-xs">
            <th className="sticky left-0 z-10 bg-card py-2 pr-4 font-medium">
              Month
            </th>
            {debts.map((debt) => (
              <th key={debt.id} className="px-2 py-2 text-right font-medium">
                {debt.lender}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {months.map((row) => {
            const current =
              row.year === currentYear && row.month === currentMonth
            return (
              <MonthBlock
                key={`${row.source}-${row.year}-${row.month}`}
                debts={debts}
                row={row}
                current={current}
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
  current,
}: {
  debts: { id: string; lender: string }[]
  row: PlannerMonth
  current: boolean
}) {
  const paidById = new Map(row.lines.map((line) => [line.debtId, line]))
  const label = formatYearMonth(row.year, row.month)
  const rowClass = cn(current && 'bg-[#f6f6f6]')

  return (
    <>
      <tr className={rowClass}>
        <td className={cn('sticky left-0 z-10 py-1.5 pr-4 align-top', current ? 'bg-[#f6f6f6]' : 'bg-card')}>
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground text-xs">
            {row.source === 'history' ? 'Paid' : 'Plan'}
          </p>
        </td>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const paid = line?.paid ?? 0
          return (
            <td
              key={`${debt.id}-paid`}
              className="text-muted-foreground px-2 py-1.5 text-right tabular-nums"
            >
              {paid > 0 ? formatUsd(paid) : '—'}
            </td>
          )
        })}
        <td className="px-2 py-1.5 text-right tabular-nums">
          {formatUsd(row.totalPaid)}
        </td>
      </tr>
      <tr className={cn('border-border border-b', rowClass)}>
        <td className={cn('sticky left-0 z-10 py-1.5 pr-4 text-muted-foreground text-xs', current ? 'bg-[#f6f6f6]' : 'bg-card')}>
          End balance
        </td>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const balance = line?.balance ?? 0
          return (
            <td
              key={`${debt.id}-bal`}
              className={cn(
                'px-2 py-1.5 text-right tabular-nums',
                balance <= 0.005 && 'text-muted-foreground',
              )}
            >
              {formatUsd(balance)}
            </td>
          )
        })}
        <td className="px-2 py-1.5 text-right font-medium tabular-nums">
          {formatUsd(row.remainingTotal)}
        </td>
      </tr>
    </>
  )
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
