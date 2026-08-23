import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Upload } from 'lucide-react'

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
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatShortDate, formatUsd } from '@/lib/format'
import {
  averageMonthlyNet,
  availableIncomeYears,
  INCOME_START_YEAR,
  monthName,
  monthlyNetTotals,
  stubsForYear,
  yearToDateNet,
} from '@/lib/income'
import { parseAdpPaystub, type Paystub } from '@/lib/paystub'
import { usePaystubs } from '@/lib/paystub-context'

export function IncomePage() {
  const { paystubs, upsertPaystub } = usePaystubs()
  const inputRef = useRef<HTMLInputElement>(null)
  const years = useMemo(() => availableIncomeYears(paystubs), [paystubs])
  const [year, setYear] = useState(() =>
    years.includes(new Date().getFullYear())
      ? new Date().getFullYear()
      : years[0] ?? INCOME_START_YEAR,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selectedYear = years.includes(year) ? year : (years[0] ?? INCOME_START_YEAR)
  const yearStubs = stubsForYear(paystubs, selectedYear)
  const ytdNet = yearToDateNet(paystubs, selectedYear)
  const monthlyAverage = averageMonthlyNet(paystubs, selectedYear)
  const monthlyTotals = monthlyNetTotals(paystubs, selectedYear)
  const monthsWithPay = monthlyTotals.filter((amount) => amount !== 0).length

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
      setYear(Number.parseInt(paystub.payDate.slice(0, 4), 10))
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

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
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
              Net pay by month for the selected year.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(selectedYear)}
              onValueChange={(value) => setYear(Number(value))}
            >
              <SelectTrigger aria-label="Income year">
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

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <Drawer>
            <DrawerTrigger asChild>
              <button type="button" className="w-full cursor-pointer text-left">
                <Card className="transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardDescription>Year-to-date net pay</CardDescription>
                      <ChevronRight className="text-muted-foreground size-4" />
                    </div>
                    <CardTitle className="text-2xl">{formatUsd(ytdNet)}</CardTitle>
                    <CardDescription>
                      {yearStubs.length === 0
                        ? `No paystubs uploaded for ${selectedYear}`
                        : `${yearStubs.length} paycheck${yearStubs.length === 1 ? '' : 's'} in ${selectedYear}`}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{selectedYear} paychecks</DrawerTitle>
                <DrawerDescription>
                  Pay date and net pay for each uploaded statement.
                </DrawerDescription>
              </DrawerHeader>
              <div className="overflow-y-auto px-4 pb-6">
                {yearStubs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Upload an ADP PDF to see paychecks here.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    <div className="text-muted-foreground grid grid-cols-2 text-xs tracking-wide uppercase">
                      <span>Pay date</span>
                      <span className="text-right">Net pay</span>
                    </div>
                    {yearStubs.map((stub) => (
                      <div
                        key={stub.id}
                        className="grid grid-cols-2 items-baseline gap-4 border-t pt-3"
                      >
                        <span>{formatShortDate(stub.payDate)}</span>
                        <span className="text-right tabular-nums">
                          {formatUsd(stub.netPay)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DrawerContent>
          </Drawer>

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

        <Card>
          <CardHeader>
            <CardTitle>Monthly net</CardTitle>
            <CardDescription>
              Total deposited in each month of {selectedYear}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {monthlyTotals.map((amount, month) => (
              <div
                key={month}
                className="flex items-baseline justify-between gap-4"
              >
                <span>{monthName(month)}</span>
                <span
                  className={
                    amount === 0
                      ? 'text-muted-foreground tabular-nums'
                      : 'tabular-nums'
                  }
                >
                  {formatUsd(amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
