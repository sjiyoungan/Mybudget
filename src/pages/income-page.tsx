import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Upload } from 'lucide-react'

import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { formatLongDate, formatShortDate, formatUsd } from '@/lib/format'
import {
  averageMonthlyNet,
  availableIncomeYears,
  INCOME_START_YEAR,
  monthName,
  stubsForMonth,
  stubsForYear,
  visibleMonthRows,
  yearToDateNet,
} from '@/lib/income'
import { parseAdpPaystub, type PayLine, type Paystub } from '@/lib/paystub'
import { usePaystubs } from '@/lib/paystub-context'
import { cn } from '@/lib/utils'

export function IncomePage() {
  const { paystubs, upsertPaystub, removePaystub } = usePaystubs()
  const inputRef = useRef<HTMLInputElement>(null)
  const years = useMemo(() => availableIncomeYears(paystubs), [paystubs])
  const [year, setYear] = useState(() =>
    years.includes(new Date().getFullYear())
      ? new Date().getFullYear()
      : years[0] ?? INCOME_START_YEAR,
  )
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    new Date().getMonth(),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selectedYear = years.includes(year) ? year : (years[0] ?? INCOME_START_YEAR)
  const yearStubs = stubsForYear(paystubs, selectedYear)
  const ytdNet = yearToDateNet(paystubs, selectedYear)
  const monthlyAverage = averageMonthlyNet(paystubs, selectedYear)
  const monthsWithPay = yearStubs.length
    ? new Set(yearStubs.map((stub) => stub.payDate.slice(5, 7))).size
    : 0
  const monthRows = visibleMonthRows(paystubs, selectedYear)
  const activeMonth =
    selectedMonth != null && monthRows.some((row) => row.month === selectedMonth)
      ? selectedMonth
      : (monthRows.at(-1)?.month ?? null)
  const monthStubs =
    activeMonth == null
      ? []
      : stubsForMonth(paystubs, selectedYear, activeMonth)

  async function handleFile(file: File) {
    setError(null)
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Upload the ADP earnings statement as a PDF.')
      return
    }

    setBusy(true)
    try {
      const { extractPdfTextItems } = await import('@/lib/extract-pdf')
      const items = await extractPdfTextItems(file)
      const parsed = parseAdpPaystub(items)
      const paystub: Paystub = {
        ...parsed,
        id: crypto.randomUUID(),
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      }
      upsertPaystub(paystub)
      const stubYear = Number.parseInt(paystub.payDate.slice(0, 4), 10)
      const stubMonth = Number.parseInt(paystub.payDate.slice(5, 7), 10) - 1
      setYear(stubYear)
      setSelectedMonth(stubMonth)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not read that paystub PDF.',
      )
    } finally {
      setBusy(false)
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
    event.target.value = ''
  }

  return (
    <div className="min-h-svh bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <ArrowLeft data-icon="inline-start" />
                Dashboard
              </Link>
            </Button>
            <h1 className="font-heading mt-2 text-2xl font-medium">Income</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Pick a month to see that paycheck’s full breakdown.
            </p>
          </div>

          <div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={onInputChange}
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Upload data-icon="inline-start" />
              {busy ? 'Reading…' : 'Upload'}
            </Button>
          </div>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardDescription>Year-to-date net pay</CardDescription>
              <CardTitle className="text-2xl">{formatUsd(ytdNet)}</CardTitle>
              <CardDescription>
                {yearStubs.length === 0
                  ? `No paystubs uploaded for ${selectedYear}`
                  : `${yearStubs.length} paycheck${yearStubs.length === 1 ? '' : 's'} in ${selectedYear}`}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Average monthly net pay</CardDescription>
              <CardTitle className="text-2xl">
                {formatUsd(monthlyAverage)}
              </CardTitle>
              <CardDescription>
                {monthsWithPay === 0
                  ? 'Shown after a month has a paycheck'
                  : `Across ${monthsWithPay} month${monthsWithPay === 1 ? '' : 's'} with pay`}
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Monthly net</CardTitle>
              <CardDescription>Select a month.</CardDescription>
              <CardAction>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(value) => {
                    setYear(Number(value))
                    setSelectedMonth(null)
                  }}
                >
                  <SelectTrigger aria-label="Income year" size="sm">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-1">
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
                        'grid grid-cols-[1fr_auto] items-baseline gap-4 rounded-lg px-2.5 py-2 text-left transition-colors',
                        selected
                          ? 'bg-muted'
                          : 'hover:bg-muted/50',
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

          <MonthBreakdown
            year={selectedYear}
            month={activeMonth}
            stubs={monthStubs}
            onDelete={removePaystub}
          />
        </section>
      </main>
    </div>
  )
}

function MonthBreakdown({
  year,
  month,
  stubs,
  onDelete,
}: {
  year: number
  month: number | null
  stubs: Paystub[]
  onDelete: (id: string) => void
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
          <CardTitle>
            {monthName(month)} {year}
          </CardTitle>
          <CardDescription>
            No paystubs uploaded for this month yet.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {stubs.map((stub) => (
        <PaystubDetail key={stub.id} paystub={stub} onDelete={() => onDelete(stub.id)} />
      ))}
    </div>
  )
}

function PaystubDetail({
  paystub,
  onDelete,
}: {
  paystub: Paystub
  onDelete: () => void
}) {
  const deductionTotal = paystub.deductions.reduce(
    (sum, item) => sum + item.amount,
    0,
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{formatLongDate(paystub.payDate)}</CardTitle>
              <Badge variant="secondary">ADP</Badge>
            </div>
            {paystub.periodBeginning && paystub.periodEnding ? (
              <CardDescription className="mt-1">
                Period {formatShortDate(paystub.periodBeginning)} –{' '}
                {formatShortDate(paystub.periodEnding)}
              </CardDescription>
            ) : null}
          </div>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Remove
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        <section className="grid gap-3">
          <h3 className="font-medium">Earnings</h3>
          {paystub.earnings.map((line) => (
            <AmountRow key={line.name} line={line} />
          ))}
          <Separator />
          <AmountRow
            line={{ name: 'Gross pay', amount: paystub.grossPay }}
            emphasized
          />
        </section>

        <section className="grid gap-3">
          <h3 className="font-medium">Taken out before deposit</h3>
          {paystub.deductions.map((line) => (
            <AmountRow key={`${line.name}-${line.amount}`} line={line} />
          ))}
          <Separator />
          <AmountRow
            line={{ name: 'Total deductions', amount: deductionTotal }}
            emphasized
          />
        </section>

        <section className="grid gap-1">
          <h3 className="font-medium">Net pay</h3>
          <p className="font-heading text-3xl font-medium">
            {formatUsd(paystub.netPay)}
          </p>
        </section>
      </CardContent>
    </Card>
  )
}

function AmountRow({
  line,
  emphasized = false,
}: {
  line: PayLine
  emphasized?: boolean
}) {
  const negative = line.amount < 0
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={emphasized ? 'font-medium' : undefined}>{line.name}</span>
      <span
        className={
          negative
            ? 'text-destructive tabular-nums'
            : emphasized
              ? 'font-medium tabular-nums'
              : 'tabular-nums'
        }
      >
        {formatUsd(line.amount)}
      </span>
    </div>
  )
}
