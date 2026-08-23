import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown } from 'lucide-react'

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
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  formatDateWithoutYear,
  formatUsd,
} from '@/lib/format'
import {
  averageMonthlyNet,
  availableIncomeYears,
  INCOME_START_YEAR,
  isHealthcareDeduction,
  isTaxDeduction,
  monthName,
  monthlyDeductionRows,
  stubsForMonth,
  visibleMonthRows,
  yearToDateHealthcare,
  yearToDateNet,
  yearToDateTax,
  type MonthlyDeductionRow,
} from '@/lib/income'
import { type PayLine, type Paystub } from '@/lib/paystub'
import { usePaystubs } from '@/lib/paystub-context'
import { cn } from '@/lib/utils'

type DeductionDrawerKind = 'tax' | 'healthcare'

export function IncomePage() {
  const { paystubs } = usePaystubs()
  const years = useMemo(() => availableIncomeYears(paystubs), [paystubs])
  const [year, setYear] = useState(() =>
    years.includes(new Date().getFullYear())
      ? new Date().getFullYear()
      : years[0] ?? INCOME_START_YEAR,
  )
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    new Date().getMonth(),
  )
  const [deductionDrawer, setDeductionDrawer] =
    useState<DeductionDrawerKind | null>(null)

  const selectedYear = years.includes(year) ? year : (years[0] ?? INCOME_START_YEAR)
  const ytdNet = yearToDateNet(paystubs, selectedYear)
  const monthlyAverage = averageMonthlyNet(paystubs, selectedYear)
  const ytdTax = yearToDateTax(paystubs, selectedYear)
  const ytdHealthcare = yearToDateHealthcare(paystubs, selectedYear)
  const monthRows = visibleMonthRows(paystubs, selectedYear)
  const taxMonthRows = monthlyDeductionRows(
    paystubs,
    selectedYear,
    isTaxDeduction,
  )
  const healthcareMonthRows = monthlyDeductionRows(
    paystubs,
    selectedYear,
    isHealthcareDeduction,
  )
  const activeMonth =
    selectedMonth != null && monthRows.some((row) => row.month === selectedMonth)
      ? selectedMonth
      : (monthRows[0]?.month ?? null)
  const monthStubs =
    activeMonth == null
      ? []
      : stubsForMonth(paystubs, selectedYear, activeMonth)

  return (
    <div className="min-h-svh bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-5xl px-6 py-8">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft data-icon="inline-start" />
              Dashboard
            </Link>
          </Button>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-medium">Income</h1>
            <Select
                value={String(selectedYear)}
                onValueChange={(value) => {
                  setYear(Number(value))
                  setSelectedMonth(null)
                }}
              >
                <SelectTrigger
                  aria-label="Income year"
                  size="sm"
                  className="h-8 text-base"
                >
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  side="bottom"
                  sideOffset={4}
                  className="w-(--radix-select-trigger-width) min-w-(--radix-select-trigger-width) rounded-md"
                >
                  {years.map((option) => (
                    <SelectItem
                      key={option}
                      value={String(option)}
                      className="text-base"
                    >
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          </div>
        </div>

        <section className="mt-8 grid grid-cols-2 xl:grid-cols-4">
          <SummaryStat
            label="Year-to-date net pay"
            amount={ytdNet}
            className="pr-5 pl-0"
          />
          <SummaryStat
            label="Average monthly net pay"
            amount={monthlyAverage}
            className="border-l border-border px-5"
          />
          <SummaryStat
            label="Year-to-date tax"
            amount={ytdTax}
            className="border-t border-border px-5 max-xl:pl-0 xl:border-t-0 xl:border-l"
            onClick={() => setDeductionDrawer('tax')}
          />
          <SummaryStat
            label="Year-to-date healthcare"
            amount={ytdHealthcare}
            className="border-t border-l border-border px-5 xl:border-t-0"
            onClick={() => setDeductionDrawer('healthcare')}
          />
        </section>

        <section className="mt-10 grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Monthly net</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 pl-3">
              {monthRows.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No months to show yet.
                </p>
              ) : (
                monthRows.map((row) => {
                  const selected = row.month === activeMonth
                  return (
                    <button
                      key={row.month}
                      type="button"
                      onClick={() => setSelectedMonth(row.month)}
                      className={cn(
                        'grid grid-cols-[1fr_auto] items-baseline gap-4 rounded-lg py-2 pr-2.5 pl-1 text-left transition-colors',
                        'hover:bg-neutral-200/80',
                        selected && 'bg-neutral-100 hover:bg-neutral-200/80',
                      )}
                    >
                      <span className={selected ? 'font-medium' : undefined}>
                        {monthName(row.month)}
                      </span>
                      <span
                        className={cn(
                          'tabular-nums',
                          row.amount === 0 && 'text-muted-foreground',
                        )}
                      >
                        {formatUsd(row.amount)}
                      </span>
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>

          <MonthBreakdown month={activeMonth} stubs={monthStubs} />
        </section>
      </main>

      <DeductionDrawer
        open={deductionDrawer != null}
        title={
          deductionDrawer === 'healthcare'
            ? 'Year-to-date healthcare'
            : 'Year-to-date tax'
        }
        rows={
          deductionDrawer === 'healthcare' ? healthcareMonthRows : taxMonthRows
        }
        onOpenChange={(open) => {
          if (!open) setDeductionDrawer(null)
        }}
      />
    </div>
  )
}

function SummaryStat({
  label,
  amount,
  onClick,
  className,
}: {
  label: string
  amount: number
  onClick?: () => void
  className?: string
}) {
  const classes = cn(
    'rounded-none bg-transparent py-1 text-left transition-colors',
    'hover:bg-neutral-200/80',
    onClick && 'cursor-pointer',
    className,
  )
  const body = (
    <>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-4 text-2xl font-normal tabular-nums">
        {formatUsd(amount)}
      </p>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {body}
      </button>
    )
  }

  return <div className={classes}>{body}</div>
}

function DeductionDrawer({
  open,
  title,
  rows,
  onOpenChange,
}: {
  open: boolean
  title: string
  rows: MonthlyDeductionRow[]
  onOpenChange: (open: boolean) => void
}) {
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null)

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setExpandedMonth(null)
        onOpenChange(nextOpen)
      }}
    >
      <DrawerContent className="data-[vaul-drawer-direction=right]:h-full sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No months to show yet.
            </p>
          ) : (
            <div className="grid gap-1">
              {rows.map((row) => {
                const expanded = expandedMonth === row.month
                const canExpand = row.lines.length > 0
                return (
                  <div key={row.month}>
                    <button
                      type="button"
                      disabled={!canExpand}
                      onClick={() =>
                        setExpandedMonth(expanded ? null : row.month)
                      }
                      className={cn(
                        'grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                        canExpand ? 'hover:bg-neutral-200/80' : 'cursor-default',
                        expanded && 'bg-neutral-100 hover:bg-neutral-200/80',
                      )}
                    >
                      <span className={expanded ? 'font-medium' : undefined}>
                        {monthName(row.month)}
                      </span>
                      <span
                        className={cn(
                          'tabular-nums',
                          row.total === 0 && 'text-muted-foreground',
                        )}
                      >
                        {formatUsd(row.total)}
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-4 text-muted-foreground transition-transform',
                          !canExpand && 'invisible',
                          expanded && 'rotate-180',
                        )}
                      />
                    </button>
                    {expanded ? (
                      <div className="grid gap-2 py-2 pr-8 pl-[22px]">
                        {row.lines.map((line) => (
                          <AmountRow
                            key={`${line.name}-${line.amount}`}
                            line={line}
                            muted
                            hoverable
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
      </DrawerContent>
    </Drawer>
  )
}

function MonthBreakdown({
  month,
  stubs,
}: {
  month: number | null
  stubs: Paystub[]
}) {
  if (month == null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Paycheck breakdown</CardTitle>
          <CardDescription>
            Select a month to see earnings, deductions, and net pay.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (stubs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>
            No paystubs uploaded for this month yet.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {stubs.map((stub, index) => (
        <PaystubDetail
          key={stub.id}
          paystub={stub}
          paycheckLabel={
            stubs.length > 1 ? `Paycheck ${index + 1}` : undefined
          }
        />
      ))}
    </div>
  )
}

function PaystubDetail({
  paystub,
  paycheckLabel,
}: {
  paystub: Paystub
  paycheckLabel?: string
}) {
  const [deductionsOpen, setDeductionsOpen] = useState(false)
  const deductionTotal = paystub.deductions.reduce(
    (sum, item) => sum + item.amount,
    0,
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle>
            {paycheckLabel
              ? `${paycheckLabel} · ${formatDateWithoutYear(paystub.payDate)}`
              : formatDateWithoutYear(paystub.payDate)}
          </CardTitle>
          {paystub.periodBeginning && paystub.periodEnding ? (
            <CardDescription>
              Period {formatDateWithoutYear(paystub.periodBeginning, 'short')} –{' '}
              {formatDateWithoutYear(paystub.periodEnding, 'short')}
            </CardDescription>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <AmountRow
          line={{ name: 'Gross pay', amount: paystub.grossPay }}
          emphasized
        />
        <div>
          <button
            type="button"
            aria-expanded={deductionsOpen}
            disabled={paystub.deductions.length === 0}
            onClick={() => setDeductionsOpen((open) => !open)}
            className={cn(
              'flex w-full items-baseline justify-between gap-4 text-left',
              paystub.deductions.length === 0 && 'cursor-default',
            )}
          >
            <span className="inline-flex items-center gap-1 font-medium">
              Total deductions
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  paystub.deductions.length === 0 && 'invisible',
                  deductionsOpen && 'rotate-180',
                )}
              />
            </span>
            <span className="font-medium tabular-nums">
              {formatUsd(deductionTotal)}
            </span>
          </button>
          {deductionsOpen ? (
            <div className="grid gap-2 pt-3 pl-3">
              {paystub.deductions.map((line) => (
                <AmountRow
                  key={`${line.name}-${line.amount}`}
                  line={line}
                  muted
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="border-border border-t" />
        <AmountRow
          line={{ name: 'Net pay', amount: paystub.netPay }}
          emphasized
          keepForeground
        />
      </CardContent>
    </Card>
  )
}

function AmountRow({
  line,
  emphasized = false,
  keepForeground = false,
  muted = false,
  hoverable = false,
}: {
  line: PayLine
  emphasized?: boolean
  keepForeground?: boolean
  muted?: boolean
  hoverable?: boolean
}) {
  const negative = line.amount < 0 && !keepForeground && !muted
  return (
    <div
      className={cn(
        '-mx-1 flex items-baseline justify-between gap-4 rounded-md px-1 py-0.5',
        hoverable && 'hover:bg-neutral-200/80',
      )}
    >
      <span
        className={cn(
          emphasized && 'font-medium',
          muted && 'text-neutral-600',
        )}
      >
        {line.name}
      </span>
      <span
        className={cn(
          'tabular-nums',
          muted && 'text-neutral-600',
          negative && 'text-destructive',
          emphasized && !muted && 'font-medium',
        )}
      >
        {formatUsd(line.amount)}
      </span>
    </div>
  )
}
