import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Upload } from 'lucide-react'

import { AppHeader } from '@/components/app-header'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
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
  const { paystubs, upsertPaystub } = usePaystubs()
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
  const [pendingStub, setPendingStub] = useState<Paystub | null>(null)

  const selectedYear = years.includes(year) ? year : (years[0] ?? INCOME_START_YEAR)
  const yearStubs = stubsForYear(paystubs, selectedYear)
  const ytdNet = yearToDateNet(paystubs, selectedYear)
  const monthlyAverage = averageMonthlyNet(paystubs, selectedYear)
  const monthRows = visibleMonthRows(paystubs, selectedYear)
  const activeMonth =
    selectedMonth != null && monthRows.some((row) => row.month === selectedMonth)
      ? selectedMonth
      : (monthRows.at(-1)?.month ?? null)
  const monthStubs =
    activeMonth == null
      ? []
      : stubsForMonth(paystubs, selectedYear, activeMonth)

  function saveStub(stub: Paystub) {
    upsertPaystub(stub)
    const stubYear = Number.parseInt(stub.payDate.slice(0, 4), 10)
    const stubMonth = Number.parseInt(stub.payDate.slice(5, 7), 10) - 1
    setYear(stubYear)
    setSelectedMonth(stubMonth)
  }

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
      const duplicate = paystubs.some((item) => item.payDate === paystub.payDate)
      if (duplicate) {
        setPendingStub(paystub)
        return
      }
      saveStub(paystub)
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

  function closeDuplicateDialog() {
    setPendingStub(null)
  }

  function replaceDuplicate() {
    if (pendingStub) saveStub(pendingStub)
    setPendingStub(null)
  }

  return (
    <div className="min-h-svh bg-background">
      <AppHeader />

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft data-icon="inline-start" />
              Dashboard
            </Link>
          </Button>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading text-3xl font-medium">Income</h1>
            <div className="flex flex-wrap items-center gap-2">
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
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <section className="flex max-w-xl flex-wrap gap-4">
          <Card className="min-w-[14rem] flex-1">
            <CardHeader>
              <CardDescription>Year-to-date net pay</CardDescription>
              <div className="flex items-baseline justify-between gap-4">
                <CardTitle className="text-2xl">{formatUsd(ytdNet)}</CardTitle>
                {yearStubs.length > 0 ? (
                  <span className="text-muted-foreground text-sm">
                    {yearStubs.length === 1
                      ? '1 paycheck'
                      : `${yearStubs.length} paychecks`}
                  </span>
                ) : null}
              </div>
            </CardHeader>
          </Card>

          <Card className="min-w-[14rem] flex-1">
            <CardHeader>
              <CardDescription>Average monthly net pay</CardDescription>
              <CardTitle className="text-2xl">
                {formatUsd(monthlyAverage)}
              </CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Monthly net</CardTitle>
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
                        selected ? 'bg-muted' : 'hover:bg-muted/50',
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

      <AlertDialog
        open={pendingStub != null}
        onOpenChange={(open) => {
          if (!open) closeDuplicateDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate paycheck</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStub
                ? `A paycheck for ${formatLongDate(pendingStub.payDate)} is already saved. Skip this file, cancel, or replace the existing one.`
                : 'This paycheck is already saved.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDuplicateDialog}>
              Cancel
            </AlertDialogCancel>
            <Button type="button" variant="outline" onClick={closeDuplicateDialog}>
              Skip
            </Button>
            <AlertDialogAction onClick={replaceDuplicate}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  const deductionTotal = paystub.deductions.reduce(
    (sum, item) => sum + item.amount,
    0,
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>
            {paycheckLabel
              ? `${paycheckLabel} · ${formatLongDate(paystub.payDate)}`
              : formatLongDate(paystub.payDate)}
          </CardTitle>
          <Badge variant="secondary">ADP</Badge>
        </div>
        {paystub.periodBeginning && paystub.periodEnding ? (
          <CardDescription>
            Period {formatShortDate(paystub.periodBeginning)} –{' '}
            {formatShortDate(paystub.periodEnding)}
          </CardDescription>
        ) : null}
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
            keepForeground
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
  keepForeground = false,
}: {
  line: PayLine
  emphasized?: boolean
  keepForeground?: boolean
}) {
  const negative = line.amount < 0 && !keepForeground
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
