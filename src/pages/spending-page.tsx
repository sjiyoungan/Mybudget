import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Card,
  CardAction,
  CardContent,
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  VARIABLE_CATEGORY_ID,
  billsAccount,
  ceiledMonthlyAmount,
  isCreditCardDebt,
  isExpenseActiveInMonth,
  isHiddenExpense,
  type RecurringExpense,
} from '@/lib/budget'
import { useBudget } from '@/lib/budget-context'
import { useDebtPlan } from '@/lib/debt-plan-context'
import type { AffirmLoan } from '@/lib/debt-plan'
import { formatDateWithoutYear, formatLongDate, formatUsd } from '@/lib/format'
import { monthName } from '@/lib/income'
import {
  ADD_TRANSACTION_EVENT,
  takeAddTransactionRequest,
  useSpending,
} from '@/lib/spending-context'
import {
  categoryExpenseIds,
  displayMerchant,
  isActiveSpendingCategory,
  isFixedOnlyPurchase,
  isGroupedSpendingCategory,
  isSpendingPurchase,
  rolledSpendingCategoryId,
  sortSpendingTxns,
  toSentenceCase,
  transactionsForUpload,
  visibleSpendingCategories,
  type SpendingCategory,
  type SpendingTxn,
  type SpendingUpload,
} from '@/lib/spending'
import { cn } from '@/lib/utils'

const NONE = 'none'
const DONUT_COLORS = {
  spending: '#F94BA4',
  food: '#F8C42A',
  gas: '#2EC4B6',
} as const
const DONUT_LEFT = '#E4E7EC'

function mixHex(hex: string, target: number, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (channel) => Math.round(channel + (target - channel) * amount),
  )
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function darkerShade(hex: string) {
  return mixHex(hex, 0, 0.32)
}

function lighterShade(hex: string) {
  return mixHex(hex, 255, 0.45)
}

function hintShade(hex: string) {
  return mixHex(hex, 255, 0.34)
}

function ringHalftone(
  start: number,
  end: number,
  caps: { start: boolean; end: boolean },
  tone: 'shadow' | 'hint',
) {
  const radius = (DONUT_SIZE - DONUT_STROKE) / 2
  const origin = DONUT_SIZE / 2
  const half = DONUT_STROKE / 2
  const spacing = 2.35
  const rows = 7
  const dots: { cx: number; cy: number; r: number }[] = []
  for (let row = 0; row < rows; row++) {
    const across = (row + 0.5) / rows
    const rr = radius - half + DONUT_STROKE * across
    const step = spacing / rr
    const pad = half / rr
    const from = start - (caps.start ? pad : 0)
    const to = end + (caps.end ? pad : 0)
    const shift = row % 2 === 1 ? 0.5 : 0
    const first = Math.ceil(from / step - shift - 1e-6)
    for (let index = first; ; index += 1) {
      const angle = (index + shift) * step
      if (angle > to + 0.0001) break
      const clamped = Math.min(end, Math.max(start, angle))
      const axisX = origin + radius * Math.cos(clamped)
      const axisY = origin + radius * Math.sin(clamped)
      const x = origin + rr * Math.cos(angle)
      const y = origin + rr * Math.sin(angle)
      const fromCenter = Math.min(1, Math.hypot(x - axisX, y - axisY) / half)
      const presence =
        tone === 'hint'
          ? Math.pow(Math.max(0, 1 - fromCenter), 0.7)
          : Math.pow(Math.max(0, 1 - fromCenter), 1.35)
      const dotR = presence * (tone === 'hint' ? 0.7 : 0.8)
      if (dotR < 0.08) continue
      dots.push({ cx: x, cy: y, r: dotR })
    }
  }
  return dots
}

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function formatTxnAmount(amount: number) {
  if (amount < 0) return `+${formatUsd(-amount)}`
  return formatUsd(amount)
}

type PaymentAccount = {
  id: string
  name: string
  kind: 'checking' | 'credit'
}

function accountName(
  accountId: string,
  accounts: { id: string; name: string }[],
) {
  return accounts.find((account) => account.id === accountId)?.name ?? 'Unknown'
}

function categoryName(
  categoryId: string | undefined,
  categories: SpendingCategory[],
) {
  if (!categoryId) return 'Uncategorized'
  const current = categories.find((item) => item.id === categoryId)
  if (!current) return 'Uncategorized'
  const childName = toSentenceCase(current.name)
  if (!current.parentId) return childName || 'Uncategorized'
  const parent = categories.find((item) => item.id === current.parentId)
  const parentName = parent ? toSentenceCase(parent.name) : ''
  return parentName ? `${parentName} · ${childName}` : childName
}

function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function defaultManualTxnDate(
  year: number,
  month: number | null,
  now = new Date(),
) {
  if (month == null) return localIsoDate(now)
  const today = localIsoDate(now)
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const first = `${prefix}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const last = `${prefix}-${String(lastDay).padStart(2, '0')}`
  if (today >= first && today <= last) return today
  if (today < first) return first
  return last
}

function defaultRuleMatch(description: string) {
  const tokens = description
    .replace(/[^A-Za-z0-9&.'+\- ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
  return tokens[0] ?? description.trim()
}

function latestSpendingMonth(transactions: SpendingTxn[]) {
  let latest: string | null = null
  for (const txn of transactions) {
    if (!isSpendingPurchase(txn)) continue
    const key = txn.date.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    if (!latest || key > latest) latest = key
  }
  if (!latest) return null
  const [year, month] = latest.split('-').map(Number)
  return { year, month: month - 1 }
}

function latestSpendingMonthInYear(transactions: SpendingTxn[], year: number) {
  let latest = -1
  const prefix = `${year}-`
  for (const txn of transactions) {
    if (!isSpendingPurchase(txn) || !txn.date.startsWith(prefix)) continue
    const month = Number.parseInt(txn.date.slice(5, 7), 10) - 1
    if (month > latest) latest = month
  }
  return latest >= 0 ? latest : null
}

function availableSpendingYears(transactions: SpendingTxn[], now = new Date()) {
  const years = new Set<number>([now.getFullYear()])
  for (const txn of transactions) {
    const year = Number.parseInt(txn.date.slice(0, 4), 10)
    if (Number.isFinite(year) && year >= 1990 && year <= 2100) years.add(year)
  }
  return [...years].sort((left, right) => right - left)
}

const DELIVERY_FOOD =
  /\b(grubhub|doordash|door\s*dash|uber\s*eats|ubereats|postmates|seamless|take[\s-]?out)\b/i

type DonutKey = keyof typeof DONUT_COLORS

function expenseDonutKey(name: string): DonutKey {
  const label = name.trim().toLowerCase()
  if (label === 'food' || label === 'grocery' || label === 'groceries') return 'food'
  if (label === 'gas' || label === 'fuel' || label === 'gasoline') return 'gas'
  return 'spending'
}

function categoryDonutKey(name: string): DonutKey | null {
  const label = name.trim().toLowerCase()
  if (DELIVERY_FOOD.test(label)) return 'spending'
  if (
    label === 'food' ||
    label === 'grocery' ||
    label === 'groceries' ||
    /\bgrocer/.test(label)
  ) {
    return 'food'
  }
  if (
    label === 'gas' ||
    label === 'fuel' ||
    label === 'gasoline' ||
    /\bgas\b|\bfuel\b/.test(label)
  ) {
    return 'gas'
  }
  return null
}

function txnDonutKey(
  txn: Pick<SpendingTxn, 'description' | 'merchant' | 'categoryId'>,
  categories: SpendingCategory[],
): DonutKey {
  if (DELIVERY_FOOD.test(`${txn.description} ${txn.merchant}`)) return 'spending'
  const rolled = rolledSpendingCategoryId(txn.categoryId, categories) ?? txn.categoryId
  const category = categories.find((item) => item.id === rolled)
  const key = category ? categoryDonutKey(category.name) : null
  return key ?? 'spending'
}

function isSpendingMainName(name: string) {
  return name.trim().toLowerCase() === 'spending'
}

function mainCategoryChoices(categories: SpendingCategory[]) {
  const tops = visibleSpendingCategories(categories)
  const spending = tops.find((item) => isSpendingMainName(item.name))
  const food = tops.find((item) => categoryDonutKey(item.name) === 'food')
  const gas = tops.find((item) => categoryDonutKey(item.name) === 'gas')
  return [spending, food, gas].filter((item): item is SpendingCategory => item != null)
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function spendingBreakdown(
  year: number,
  transactions: SpendingTxn[],
  categories: SpendingCategory[],
  counts: (txn: SpendingTxn) => boolean,
) {
  const mains = mainCategoryChoices(categories)
  const spending = mains.find((item) => isSpendingMainName(item.name))
  const children = (spending
    ? categories.filter((item) => item.parentId === spending.id)
    : []
  ).sort((left, right) => left.name.localeCompare(right.name))
  const buckets = new Map<string, number[]>()
  const ensure = (id: string) => {
    const existing = buckets.get(id)
    if (existing) return existing
    const months = Array.from({ length: 12 }, () => 0)
    buckets.set(id, months)
    return months
  }
  for (const txn of transactions) {
    if (!counts(txn) || !txn.date.startsWith(`${year}-`)) continue
    const month = Number.parseInt(txn.date.slice(5, 7), 10) - 1
    if (month < 0 || month > 11) continue
    const key = txnDonutKey(txn, categories)
    ensure(key)[month] += txn.amount
    ensure('total')[month] += txn.amount
    if (key !== 'spending') continue
    const child = children.find((item) => item.id === txn.categoryId)
    ensure(child ? child.id : 'spending-rest')[month] += txn.amount
  }
  const row = (id: string, label: string, depth: number) => {
    const months = buckets.get(id) ?? Array.from({ length: 12 }, () => 0)
    return {
      id,
      label,
      depth,
      months,
      total: months.reduce((sum, amount) => sum + amount, 0),
    }
  }
  const rows = [
    row('spending', 'Spending', 0),
    ...children.map((child) => row(child.id, toSentenceCase(child.name), 1)),
  ]
  if (children.length > 0) {
    const rest = row('spending-rest', 'No subcategory', 1)
    if (rest.total > 0.005) rows.push(rest)
  }
  rows.push(row('food', 'Food', 0), row('gas', 'Gas', 0), row('total', 'Total', 0))
  return rows
}

function variableBudgetForMonth(
  expenses: RecurringExpense[],
  year: number,
  month: number,
) {
  return expenses
    .filter(
      (item) =>
        item.category === VARIABLE_CATEGORY_ID &&
        !isHiddenExpense(item) &&
        isExpenseActiveInMonth(item, year, month),
    )
    .reduce((sum, item) => sum + ceiledMonthlyAmount(item), 0)
}

function monthRowsForYear(
  transactions: SpendingTxn[],
  year: number,
  now = new Date(),
  counts: (txn: SpendingTxn) => boolean = isSpendingPurchase,
) {
  const totals = Array.from({ length: 12 }, () => 0)
  const logged = Array.from({ length: 12 }, () => false)
  for (const txn of transactions) {
    if (!txn.date.startsWith(`${year}-`)) continue
    const month = Number.parseInt(txn.date.slice(5, 7), 10) - 1
    if (month < 0 || month > 11) continue
    logged[month] = true
    if (counts(txn)) totals[month] += txn.amount
  }
  const rows = totals
    .map((amount, month) => ({ month, amount }))
    .filter(({ month }) => logged[month])
    .toReversed()
  if (rows.length === 0 && year === now.getFullYear()) {
    return [{ month: now.getMonth(), amount: 0 }]
  }
  return rows
}

export function SpendingPage() {
  const {
    transactions,
    categories,
    addTransaction,
    updateTransaction,
    removeTransaction,
    replaceCategories,
    addRule,
    uploads,
    removeUpload,
  } = useSpending()
  const { plan } = useDebtPlan()
  const { accounts, debts, expenses } = useBudget()
  const paymentAccounts = useMemo(() => {
    const list: PaymentAccount[] = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind === 'credit' ? 'credit' : 'checking',
    }))
    const seen = new Set(list.map((account) => account.id))
    for (const debt of debts) {
      if (!isCreditCardDebt(debt) || seen.has(debt.id)) continue
      list.push({ id: debt.id, name: debt.lender, kind: 'credit' })
      seen.add(debt.id)
    }
    return list
  }, [accounts, debts])
  const now = useMemo(() => new Date(), [])
  const years = useMemo(
    () => availableSpendingYears(transactions, now),
    [now, transactions],
  )
  const latest = useMemo(
    () => latestSpendingMonth(transactions),
    [transactions],
  )
  const [year, setYear] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const selectedYear = year ?? latest?.year ?? now.getFullYear()
  const variableExpenseIds = useMemo(
    () =>
      new Set(
        expenses
          .filter((item) => item.category === VARIABLE_CATEGORY_ID)
          .map((item) => item.id),
      ),
    [expenses],
  )
  const countsAsVariable = useMemo(
    () => (txn: SpendingTxn) =>
      isSpendingPurchase(txn) &&
      !isFixedOnlyPurchase(txn.categoryId, categories, variableExpenseIds),
    [categories, variableExpenseIds],
  )
  const monthRows = useMemo(
    () =>
      monthRowsForYear(transactions, selectedYear, now, countsAsVariable).map(
        (row) => ({
          ...row,
          budget: variableBudgetForMonth(expenses, selectedYear, row.month),
        }),
      ),
    [countsAsVariable, expenses, now, selectedYear, transactions],
  )
  const defaultMonth =
    monthRows.find((row) => row.amount > 0)?.month ??
    latestSpendingMonthInYear(transactions, selectedYear) ??
    monthRows[0]?.month ??
    null
  const activeMonth =
    selectedMonth != null && selectedMonth >= 0 && selectedMonth <= 11
      ? selectedMonth
      : defaultMonth
  const [editing, setEditing] = useState<SpendingTxn | null>(null)
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    function openAdd() {
      takeAddTransactionRequest()
      setAdding(true)
    }
    if (takeAddTransactionRequest()) setAdding(true)
    window.addEventListener(ADD_TRANSACTION_EVENT, openAdd)
    return () => window.removeEventListener(ADD_TRANSACTION_EVENT, openAdd)
  }, [])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [calendarScope, setCalendarScope] = useState<'month' | 'year'>('month')
  const [calendarCategoryIds, setCalendarCategoryIds] = useState<string[]>([])
  const [expandedStatementMonth, setExpandedStatementMonth] = useState<
    string | null
  >(null)
  const [expandedUpload, setExpandedUpload] = useState<string | null>(null)
  const [removeUploadId, setRemoveUploadId] = useState<string | null>(null)
  const [editCategoriesOpen, setEditCategoriesOpen] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [statementsOpen, setStatementsOpen] = useState(false)
  const [affirmOpen, setAffirmOpen] = useState(false)
  const [affirmIds, setAffirmIds] = useState<string[]>([])
  const [affirmIndex, setAffirmIndex] = useState(0)

  const monthPrefix =
    activeMonth == null
      ? ''
      : `${selectedYear}-${String(activeMonth + 1).padStart(2, '0')}-`
  const monthTxns = useMemo(
    () =>
      sortSpendingTxns(
        monthPrefix
          ? transactions.filter((txn) => txn.date.startsWith(monthPrefix))
          : [],
      ),
    [monthPrefix, transactions],
  )
  const statementMonths = useMemo(() => {
    const groups = new Map<
      string,
      { year: number; month: number; uploads: SpendingUpload[] }
    >()
    for (const upload of uploads) {
      const key = uploadMonthKey(upload, transactions, uploads)
      if (!key) continue
      const id = `${key.year}-${key.month}`
      const group = groups.get(id)
      if (group) group.uploads.push(upload)
      else groups.set(id, { year: key.year, month: key.month, uploads: [upload] })
    }
    const rows = [...groups.values()]
      .map((group) => ({
        ...group,
        uploads: [...group.uploads].sort((left, right) =>
          right.uploadedAt.localeCompare(left.uploadedAt),
        ),
      }))
      .sort((left, right) => right.year - left.year || right.month - left.month)
    const manyYears = new Set(rows.map((row) => row.year)).size > 1
    return rows.map((row) => ({
      ...row,
      label: manyYears
        ? `${monthName(row.month)} ${row.year}`
        : monthName(row.month),
    }))
  }, [transactions, uploads])
  const spentTxns = useMemo(
    () => monthTxns.filter(countsAsVariable),
    [countsAsVariable, monthTxns],
  )
  const yearSpentTxns = useMemo(() => {
    const prefix = `${selectedYear}-`
    return sortSpendingTxns(
      transactions.filter(
        (txn) => txn.date.startsWith(prefix) && countsAsVariable(txn),
      ),
    )
  }, [countsAsVariable, selectedYear, transactions])
  const totalSpent = spentTxns.reduce((sum, txn) => sum + txn.amount, 0)
  const calendarYearTxns = useMemo(
    () =>
      yearSpentTxns.filter((txn) =>
        txnInCalendarCategories(txn, categories, calendarCategoryIds),
      ),
    [calendarCategoryIds, categories, yearSpentTxns],
  )
  const calendarMonthTxns = useMemo(
    () =>
      spentTxns.filter((txn) =>
        txnInCalendarCategories(txn, categories, calendarCategoryIds),
      ),
    [calendarCategoryIds, categories, spentTxns],
  )
  const spentByDay = useMemo(() => {
    const totals = new Map<string, number>()
    for (const txn of calendarYearTxns) {
      totals.set(txn.date, (totals.get(txn.date) ?? 0) + txn.amount)
    }
    return totals
  }, [calendarYearTxns])
  const monthBudget = useMemo(
    () =>
      activeMonth == null
        ? 0
        : variableBudgetForMonth(expenses, selectedYear, activeMonth),
    [activeMonth, expenses, selectedYear],
  )
  const donutParts = useMemo(() => {
    const budget = { spending: 0, food: 0, gas: 0 }
    if (activeMonth != null) {
      for (const item of expenses) {
        if (item.category !== VARIABLE_CATEGORY_ID || isHiddenExpense(item)) continue
        if (!isExpenseActiveInMonth(item, selectedYear, activeMonth)) continue
        budget[expenseDonutKey(item.name)] += ceiledMonthlyAmount(item)
      }
    }
    const spent = { spending: 0, food: 0, gas: 0 }
    for (const txn of spentTxns) spent[txnDonutKey(txn, categories)] += txn.amount
    const order: DonutKey[] = ['spending', 'food', 'gas']
    return order.map((key) => ({
      id: key,
      name: key === 'food' ? 'Food' : key === 'gas' ? 'Gas' : 'Spending',
      color: DONUT_COLORS[key],
      spent: spent[key],
      budget: budget[key],
    }))
  }, [activeMonth, categories, expenses, selectedYear, spentTxns])
  const dayRows = useMemo(() => {
    const byDay = new Map<string, SpendingTxn[]>()
    for (const txn of calendarMonthTxns) {
      const items = byDay.get(txn.date)
      if (items) items.push(txn)
      else byDay.set(txn.date, [txn])
    }
    return [...byDay.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([date, items]) => ({
        date,
        items,
        amount: items.reduce((sum, txn) => sum + txn.amount, 0),
      }))
  }, [calendarMonthTxns])
  const selectedRow = useMemo(() => {
    if (selectedDay == null) return null
    const listed = dayRows.find((row) => row.date === selectedDay)
    if (listed) return listed
    const items = calendarYearTxns.filter((txn) => txn.date === selectedDay)
    if (items.length === 0) return null
    return {
      date: selectedDay,
      items,
      amount: items.reduce((sum, txn) => sum + txn.amount, 0),
    }
  }, [calendarYearTxns, dayRows, selectedDay])
  const pendingAffirm = useMemo(() => {
    const linked = new Set(
      transactions.flatMap((txn) => (txn.affirmLoanId ? [txn.affirmLoanId] : [])),
    )
    return plan.affirmLoans
      .filter(
        (loan) =>
          loan.needsSpending &&
          loan.startingBalance > 0.005 &&
          !linked.has(loan.id),
      )
      .sort((left, right) =>
        (right.startDate ?? right.startMonth).localeCompare(
          left.startDate ?? left.startMonth,
        ),
      )
  }, [plan.affirmLoans, transactions])
  const affirmLoan =
    affirmIds
      .slice(affirmIndex)
      .map((id) => plan.affirmLoans.find((loan) => loan.id === id))
      .find((loan) => loan != null) ?? null
  const affirmAccountId =
    billsAccount(accounts)?.id ??
    accounts.find((account) => account.kind === 'checking')?.id ??
    accounts[0]?.id ??
    ''
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 pb-8 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-medium">Spending</h1>
          <Select
            value={String(selectedYear)}
            onValueChange={(value) => {
              const next = Number(value)
              setYear(next)
              setSelectedMonth(null)
              setCalendarScope('month')
              setSelectedDay(null)
            }}
          >
            <SelectTrigger
              aria-label="Spending year"
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
                <SelectItem key={option} value={String(option)} className="text-base">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setStatementsOpen(true)}
        >
          Statement
        </Button>
      </div>

      {pendingAffirm.length > 0 ? (
        <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <p className="text-sm">
            You have {pendingAffirm.length} unconfirmed Affirm{' '}
            {pendingAffirm.length === 1 ? 'purchase' : 'purchases'}.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAffirmIds(pendingAffirm.map((loan) => loan.id))
              setAffirmIndex(0)
              setAffirmOpen(true)
            }}
          >
            Log
          </Button>
        </div>
      ) : null}

      <section className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Monthly expenses</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 pl-3">
            {monthRows.map((row) => {
              const selected = row.month === activeMonth
              return (
                <button
                  key={row.month}
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => {
                    setCalendarScope('month')
                    setSelectedMonth(row.month)
                    setSelectedDay(null)
                  }}
                  className={cn(
                    'hover-fill grid w-full cursor-pointer grid-cols-[1fr_auto] items-baseline gap-4 rounded-lg py-2 pr-2.5 pl-1 text-left',
                    selected && 'hover-fill-active',
                  )}
                >
                  <span className={selected ? 'font-medium' : undefined}>
                    {monthName(row.month)}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    <span
                      className={row.amount === 0 ? 'text-muted-foreground' : undefined}
                    >
                      {formatUsd(row.amount)}
                    </span>
                    <span className="text-muted-foreground">
                      {' / '}
                      {formatUsd(row.budget)}
                    </span>
                  </span>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
            <CardTitle>Total expense</CardTitle>
            <CardAction>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBreakdownOpen(true)}
                >
                  See breakdown
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditCategoriesOpen(true)}
                >
                  Edit category
                </Button>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-8">
              <BudgetDonut parts={donutParts} total={totalSpent} budget={monthBudget} />
              <ul className="grid min-w-[14rem] flex-1 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-baseline gap-x-2 gap-y-2.5 text-sm">
                {donutParts.map((part) => {
                  const delta = part.spent - part.budget
                  const over = delta > 0.005
                  const under = delta < -0.005
                  return (
                    <Fragment key={part.id}>
                      <span
                        className="size-2.5 self-center rounded-[3px]"
                        style={{ background: part.color }}
                      />
                      <span className="flex min-w-0 items-center gap-2">
                        <span>{part.name}</span>
                        <span className="mb-1 min-w-4 flex-1 border-b border-dotted border-neutral-300" />
                      </span>
                      <span className="justify-self-end tabular-nums">
                        {formatUsd(part.spent)}
                      </span>
                      {over || under ? (
                        <span
                          className={cn(
                            'justify-self-start text-xs tabular-nums',
                            under && 'text-muted-foreground',
                          )}
                          style={over ? { color: darkerShade(part.color) } : undefined}
                        >
                          {formatUsd(Math.abs(delta))} {over ? 'over' : 'left'}
                        </span>
                      ) : (
                        <span />
                      )}
                    </Fragment>
                  )
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      {activeMonth != null ? (
        <SpendingCalendar
          year={selectedYear}
          month={activeMonth}
          scope={calendarScope}
          categories={categories}
          categoryIds={calendarCategoryIds}
          onCategories={(ids) => {
            setCalendarCategoryIds(ids)
            setSelectedDay(null)
          }}
          spentByDay={spentByDay}
          now={now}
          selected={selectedDay}
          onScope={(next, nextMonth) => {
            setCalendarScope(next)
            if (nextMonth != null) setSelectedMonth(nextMonth)
            setSelectedDay(null)
          }}
          onSelect={(date) => {
            setSelectedDay((current) => (current === date ? null : date))
          }}
        />
      ) : null}

      <Card>
        <CardHeader className="has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <CardTitle>
            {selectedRow ? formatWeekdayDate(selectedRow.date) : 'Transactions'}
          </CardTitle>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={() => setAdding(true)}
            >
              Add
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-1">
          {selectedRow == null && dayRows.length === 0 ? (
            <p className="text-muted-foreground py-2 text-sm">
              No purchases this month.
            </p>
          ) : null}
          {(selectedRow ? [selectedRow] : dayRows).map((row, index) => (
            <div
              key={row.date}
              className={cn('py-2', index > 0 && 'border-border border-t')}
            >
              <div className="grid w-full grid-cols-[minmax(0,1fr)_5.75rem] items-center gap-x-3 py-2 text-left">
                <span className="font-medium">
                  {formatDateWithoutYear(row.date, 'short')}
                </span>
                <span className="w-[5.75rem] shrink-0 text-right font-medium tabular-nums">
                  {formatUsd(row.amount)}
                </span>
              </div>
              <ul>
                {row.items.map((txn, itemIndex) => (
                  <TransactionRow
                    key={txn.id}
                    txn={txn}
                    accounts={paymentAccounts}
                    categories={categories}
                    divided={itemIndex > 0}
                    onClick={() => setEditing(txn)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog
        open={statementsOpen}
        onOpenChange={(open) => {
          setStatementsOpen(open)
          if (!open) {
            setExpandedStatementMonth(null)
            setExpandedUpload(null)
          }
        }}
      >
        <DialogContent
          className="flex max-h-[min(40rem,calc(100vh-2rem))] w-[min(48rem,calc(100%-2rem))] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-4 sm:max-w-[min(48rem,calc(100%-2rem))]"
        >
          <DialogHeader className="pb-3">
            <DialogTitle>Statements</DialogTitle>
            <DialogDescription className="sr-only">
              Uploaded statements grouped by month.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            {statementMonths.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No statements uploaded yet.
              </p>
            ) : (
              <div className="grid min-w-0 gap-1">
                {statementMonths.map((group) => {
                  const monthKey = `${group.year}-${group.month}`
                  const monthOpen = expandedStatementMonth === monthKey
                  return (
                    <div key={monthKey} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedStatementMonth(monthOpen ? null : monthKey)
                          if (monthOpen) setExpandedUpload(null)
                        }}
                        className="hover-fill grid w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2.5 py-2 text-left"
                      >
                        <span
                          className={cn(
                            'min-w-0',
                            monthOpen && 'font-medium',
                          )}
                        >
                          {group.label}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-sm">
                          {statementCountLabel(group.uploads.length)}
                        </span>
                        <ChevronDown
                          className={cn(
                            'size-4 shrink-0 text-muted-foreground transition-transform',
                            monthOpen && 'rotate-180',
                          )}
                        />
                      </button>
                      {monthOpen ? (
                        <div className="grid min-w-0 gap-1 py-1 pl-3">
                          {group.uploads.map((upload) => {
                            const items = sortSpendingTxns(
                              transactionsForUpload(
                                transactions,
                                upload,
                                uploads,
                              ),
                            )
                            const expanded = expandedUpload === upload.id
                            return (
                              <div key={upload.id} className="min-w-0">
                                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedUpload(
                                        expanded ? null : upload.id,
                                      )
                                    }
                                    className="hover-fill grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2.5 py-2 text-left"
                                  >
                                    <span
                                      className={cn(
                                        'min-w-0 break-words [overflow-wrap:anywhere]',
                                        expanded && 'font-medium',
                                      )}
                                    >
                                      {upload.name}
                                    </span>
                                    <ChevronDown
                                      className={cn(
                                        'size-4 shrink-0 text-muted-foreground transition-transform',
                                        expanded && 'rotate-180',
                                      )}
                                    />
                                  </button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Remove ${upload.name}`}
                                    onClick={() => setRemoveUploadId(upload.id)}
                                  >
                                    <Trash2 />
                                  </Button>
                                </div>
                                {expanded ? (
                                  <ul className="grid min-w-0 gap-0.5 py-1 pl-4">
                                    {items.length === 0 ? (
                                      <li className="text-muted-foreground px-2.5 py-2 text-sm">
                                        No purchases from this file.
                                      </li>
                                    ) : (
                                      items.map((txn) => (
                                        <TransactionRow
                                          key={txn.id}
                                          txn={txn}
                                          accounts={paymentAccounts}
                                          categories={categories}
                                          showAccount={false}
                                          showDate
                                          onClick={() => setEditing(txn)}
                                        />
                                      ))
                                    )}
                                  </ul>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddTxnDialog
        open={adding}
        accounts={paymentAccounts}
        categories={categories}
        defaultDate={defaultManualTxnDate(selectedYear, activeMonth, now)}
        defaultAccountId={
          billsAccount(accounts)?.id ??
          accounts.find((account) => account.kind === 'checking')?.id ??
          accounts[0]?.id ??
          ''
        }
        onClose={() => setAdding(false)}
        onEditCategories={() => setEditCategoriesOpen(true)}
        onSave={(input) => {
          addTransaction(input)
          const year = Number.parseInt(input.date.slice(0, 4), 10)
          const month = Number.parseInt(input.date.slice(5, 7), 10) - 1
          if (Number.isFinite(year)) setYear(year)
          if (Number.isFinite(month) && month >= 0 && month < 12) {
            setSelectedMonth(month)
          }
          setSelectedDay(input.date)
          setAdding(false)
        }}
      />

      <AffirmLogDialog
        open={affirmOpen && affirmLoan != null}
        loan={affirmLoan}
        step={affirmIndex + 1}
        total={affirmIds.length}
        categories={categories}
        onClose={() => setAffirmOpen(false)}
        onSave={(categoryId, date) => {
          if (!affirmLoan) return
          addTransaction({
            date,
            merchant: affirmLoan.name,
            description: affirmLoan.loanId
              ? `${affirmLoan.name} (${affirmLoan.loanId})`
              : affirmLoan.name,
            accountId: affirmAccountId,
            amount: affirmLoan.startingBalance,
            ...(categoryId ? { categoryId } : {}),
            affirmLoanId: affirmLoan.id,
          })
          const nextIndex = affirmIds.findIndex((_, index) => index > affirmIndex)
          if (nextIndex === -1) setAffirmOpen(false)
          else setAffirmIndex(nextIndex)
        }}
      />

      <EditTxnDialog
        txn={editing}
        accounts={paymentAccounts}
        categories={categories}
        uploads={uploads}
        onClose={() => setEditing(null)}
        onEditCategories={() => setEditCategoriesOpen(true)}
        onSave={(id, patch, rule) => {
          updateTransaction(id, patch)
          if (rule) addRule(rule)
          setEditing(null)
        }}
        onDelete={(id) => {
          removeTransaction(id)
          setEditing(null)
        }}
      />

      <BreakdownDialog
        open={breakdownOpen}
        year={selectedYear}
        transactions={transactions}
        categories={categories}
        counts={countsAsVariable}
        onClose={() => setBreakdownOpen(false)}
      />

      <EditCategoriesDialog
        open={editCategoriesOpen}
        categories={categories}
        onClose={() => setEditCategoriesOpen(false)}
        onSave={(next) => {
          replaceCategories(next)
          setEditCategoriesOpen(false)
        }}
      />

      <Dialog
        open={removeUploadId != null}
        onOpenChange={(next) => {
          if (!next) setRemoveUploadId(null)
        }}
      >
        <DialogContent className="p-6 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove statement?</DialogTitle>
            <DialogDescription>
              {(() => {
                const upload = uploads.find((item) => item.id === removeUploadId)
                if (!upload) return 'This removes the statement and its purchases.'
                const count = transactionsForUpload(
                  transactions,
                  upload,
                  uploads,
                ).length
                const noun =
                  count === 1 ? '1 purchase' : `${count} purchases`
                return `Removing “${upload.name}” also deletes ${noun} from this file.`
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveUploadId(null)}
            >
              Keep statement
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (removeUploadId) removeUpload(removeUploadId)
                if (expandedUpload === removeUploadId) setExpandedUpload(null)
                setRemoveUploadId(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function calendarCategoryOptions(categories: SpendingCategory[]) {
  const tops = categories.filter(
    (item) => !item.parentId && isActiveSpendingCategory(item),
  )
  const spending = tops.find((item) => isSpendingMainName(item.name))
  const food = tops.find((item) => categoryDonutKey(item.name) === 'food')
  const gas = tops.find((item) => categoryDonutKey(item.name) === 'gas')
  const rest = tops
    .filter((item) => item !== spending && item !== food && item !== gas)
    .sort((left, right) => left.name.localeCompare(right.name))
  const ordered = [
    spending ?? { id: '__spending__', name: 'Spending' },
    ...(food ? [food] : []),
    ...(gas ? [gas] : []),
    ...rest,
  ]
  const children = (
    spending
      ? categories.filter(
          (item) =>
            item.parentId === spending.id && isActiveSpendingCategory(item),
        )
      : []
  ).sort((left, right) => left.name.localeCompare(right.name))
  const rows: { id: string; label: string; depth: number }[] = []
  for (const main of ordered) {
    rows.push({ id: main.id, label: toSentenceCase(main.name), depth: 0 })
    if (main.id !== spending?.id) continue
    for (const child of children) {
      rows.push({ id: child.id, label: toSentenceCase(child.name), depth: 1 })
    }
  }
  return rows
}

function txnInCalendarCategories(
  txn: SpendingTxn,
  categories: SpendingCategory[],
  selectedIds: readonly string[],
) {
  if (selectedIds.length === 0) return true
  if (txn.categoryId && selectedIds.includes(txn.categoryId)) return true
  const rolled = rolledSpendingCategoryId(txn.categoryId, categories)
  if (rolled != null && selectedIds.includes(rolled)) return true
  const spending = categories.find(
    (item) => !item.parentId && isSpendingMainName(item.name),
  )
  const spendingSelected =
    selectedIds.includes('__spending__') ||
    (spending != null && selectedIds.includes(spending.id))
  return (
    spendingSelected &&
    txnDonutKey(txn, categories) === 'spending' &&
    (!txn.categoryId || txn.categoryId === spending?.id)
  )
}

function formatWeekdayDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function SpendingCalendar({
  year,
  month,
  scope,
  categories,
  categoryIds,
  onCategories,
  spentByDay,
  now,
  selected,
  onScope,
  onSelect,
}: {
  year: number
  month: number
  scope: 'month' | 'year'
  categories: SpendingCategory[]
  categoryIds: string[]
  onCategories: (ids: string[]) => void
  spentByDay: Map<string, number>
  now: Date
  selected: string | null
  onScope: (scope: 'month' | 'year', month?: number) => void
  onSelect: (date: string) => void
}) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const months = scope === 'year' ? Array.from({ length: 12 }, (_, index) => index) : [month]

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarMonthPicker
            scope={scope}
            month={month}
            onScope={onScope}
          />
          <CalendarCategoryFilter
            categories={categories}
            selectedIds={categoryIds}
            onChange={onCategories}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn(scope === 'year' && 'grid gap-x-4 gap-y-5 sm:grid-cols-2')}>
          {months.map((shown) => (
            <CalendarMonth
              key={shown}
              year={year}
              month={shown}
              compact={scope === 'year'}
              spentByDay={spentByDay}
              today={today}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CalendarMonthPicker({
  scope,
  month,
  onScope,
}: {
  scope: 'month' | 'year'
  month: number
  onScope: (scope: 'month' | 'year', month?: number) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Calendar view"
          className="flex h-8 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-base whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {scope === 'year' ? 'Whole year' : monthName(month)}
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, index) => {
            const selected = scope === 'month' && month === index
            return (
              <button
                key={index}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onScope('month', index)
                  setOpen(false)
                }}
                className={cn(
                  'hover-fill rounded-md px-2 py-1.5 text-sm',
                  selected && 'hover-fill-active font-medium',
                )}
              >
                {SHORT_MONTHS[index]}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-pressed={scope === 'year'}
          onClick={() => {
            onScope('year')
            setOpen(false)
          }}
          className={cn(
            'hover-fill mt-1 w-full rounded-md px-2 py-1.5 text-sm',
            scope === 'year' && 'hover-fill-active font-medium',
          )}
        >
          Whole year
        </button>
      </PopoverContent>
    </Popover>
  )
}

function CalendarCategoryFilter({
  categories,
  selectedIds,
  onChange,
}: {
  categories: SpendingCategory[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const options = calendarCategoryOptions(categories)
  const label =
    selectedIds.length === 0
      ? 'All categories'
      : selectedIds.length === 1
        ? (options.find((option) => option.id === selectedIds[0])?.label ??
          '1 category')
        : `${selectedIds.length} categories`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Calendar categories"
          className="flex h-8 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-base whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {label}
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={selectedIds.length === 0}
          onClick={() => onChange([])}
          className="hover-fill flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
        >
          <span
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded border border-foreground/30',
              selectedIds.length === 0 && 'border-foreground bg-foreground text-background',
            )}
          >
            {selectedIds.length === 0 ? <Check className="size-3" /> : null}
          </span>
          All categories
        </button>
        {options.map((option) => {
          const on = selectedIds.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() =>
                onChange(
                  on
                    ? selectedIds.filter((id) => id !== option.id)
                    : [...selectedIds, option.id],
                )
              }
              className={cn(
                'hover-fill flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                option.depth > 0 && 'pl-6',
              )}
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded border border-foreground/30',
                  on && 'border-foreground bg-foreground text-background',
                )}
              >
                {on ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function CalendarMonth({
  year,
  month,
  compact,
  spentByDay,
  today,
  selected,
  onSelect,
}: {
  year: number
  month: number
  compact: boolean
  spentByDay: Map<string, number>
  today: Date
  selected: string | null
  onSelect: (date: string) => void
}) {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  return (
    <div className="min-w-0">
      {compact ? (
        <div className="pb-1 text-xs font-medium">{monthName(month)}</div>
      ) : null}
      <div className={cn('grid grid-cols-7', compact ? 'gap-0.5' : 'gap-1.5')}>
        {WEEKDAYS.map((label, index) => (
          <div
            key={label}
            className={cn(
              'text-muted-foreground text-left',
              compact
                ? 'px-1 pb-0.5 text-[10px] leading-3'
                : 'px-1 pb-1 text-xs lg:px-2',
            )}
          >
            <span className="lg:hidden">{WEEKDAY_LETTERS[index]}</span>
            <span className="hidden text-sm lg:inline">{WEEKDAY_SHORT[index]}</span>
          </div>
        ))}
        {cells.map((day, index) => {
          if (day == null) return <div key={`pad-${index}`} />
          const date = new Date(year, month, day)
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const spent = spentByDay.get(key) ?? 0
          const future = date > today
          const past = date < today
          const isToday = date.getTime() === today.getTime()
          const openable = !future && spent > 0.005
          const amount = formatUsd(spent)
          const body = (
            <>
              <span
                className={cn(
                  'shrink-0 font-medium',
                  compact ? 'text-[11px] leading-none' : 'text-sm leading-none lg:leading-5',
                )}
              >
                {day}
              </span>
              {openable ? (
                <span
                  className={cn(
                    'tabular-nums',
                    compact
                      ? 'text-[10px] leading-none whitespace-nowrap'
                      : 'text-[10px] leading-none whitespace-nowrap lg:min-w-0 lg:truncate lg:text-[11px] lg:leading-4',
                  )}
                >
                  {amount}
                </span>
              ) : null}
            </>
          )
          const className = cn(
            'flex w-full min-w-0 flex-col items-start justify-center gap-0.5 text-left',
            compact
              ? 'min-h-8 rounded-md px-1 py-0.5'
              : 'min-h-10 rounded-lg px-1 py-1 lg:flex-row lg:items-center lg:justify-between lg:gap-1 lg:px-1.5 lg:py-1.5',
            future && 'text-muted-foreground/40',
            past && 'text-[#404040]',
            openable && 'spent-day cursor-pointer',
            isToday && 'text-black ring-1 ring-black',
          )
          const style = openable
            ? { background: selected === key ? '#F6C6DB' : '#FDE4EF' }
            : undefined
          if (!openable) {
            return (
              <div key={key} className={className} style={style}>
                {body}
              </div>
            )
          }
          return (
            <button
              key={key}
              type="button"
              className={className}
              style={style}
              aria-pressed={selected === key}
              title={amount}
              onClick={() => onSelect(key)}
            >
              {body}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const DONUT_SIZE = 176
const DONUT_STROKE = 14
const DONUT_GAP_PX = 5

function BudgetDonut({
  parts,
  total,
  budget,
}: {
  parts: { id: string; color: string; spent: number; budget: number }[]
  total: number
  budget: number
}) {
  const left = budget - total
  const whole = Math.max(budget, total)
  const segments = parts
    .filter((part) => part.spent > 0.005)
    .map((part) => ({
      spent: part.spent,
      within: Math.min(part.spent, Math.max(0, part.budget)),
      color: part.color,
    }))
  if (left > 0.005) {
    segments.push({ spent: left, within: left, color: DONUT_LEFT })
  }
  const radius = (DONUT_SIZE - DONUT_STROKE) / 2
  const center = DONUT_SIZE / 2
  const cap = DONUT_STROKE / 2 / radius
  const gap = 2 * cap + DONUT_GAP_PX / radius

  function point(angle: number) {
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    }
  }

  function arc(start: number, end: number) {
    const sweep = end - start
    if (sweep <= 0.001) return null
    const from = point(start)
    const to = point(end)
    const large = sweep > Math.PI ? 1 : 0
    return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 1 ${to.x} ${to.y}`
  }

  function halftone(
    id: string,
    color: string,
    start: number,
    end: number,
    path: string | null,
    caps: { x: number; y: number }[],
    round: { start: boolean; end: boolean },
    tone: 'shadow' | 'hint',
  ) {
    const dots = ringHalftone(start, end, round, tone)
    const dotColor = tone === 'hint' ? hintShade(color) : lighterShade(color)
    return (
      <g>
        <mask id={id}>
          <rect width={DONUT_SIZE} height={DONUT_SIZE} fill="black" />
          {path ? (
            <path
              d={path}
              fill="none"
              stroke="white"
              strokeWidth={DONUT_STROKE}
              strokeLinecap="butt"
            />
          ) : null}
          {caps.map((cap, index) => (
            <circle
              key={index}
              cx={cap.x}
              cy={cap.y}
              r={DONUT_STROKE / 2}
              fill="white"
            />
          ))}
        </mask>
        <g mask={`url(#${id})`}>
          {dots.map((dot, index) => (
            <circle
              key={index}
              cx={dot.cx}
              cy={dot.cy}
              r={dot.r}
              fill={dotColor}
            />
          ))}
        </g>
      </g>
    )
  }

  const marks: { key: string; node: ReactNode }[] = []
  if (whole <= 0.005 || segments.length === 0) {
    marks.push({
      key: 'empty',
      node: (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={DONUT_LEFT}
          strokeWidth={DONUT_STROKE}
        />
      ),
    })
  } else {
    let cursor = -Math.PI / 2
    const onlyLeft = segments.length === 1 && segments[0]?.color === DONUT_LEFT
    if (onlyLeft) {
      marks.push({
        key: 'left',
        node: (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={DONUT_LEFT}
            strokeWidth={DONUT_STROKE}
          />
        ),
      })
    }
    if (!onlyLeft) segments.forEach((segment, index) => {
      const sweep = (segment.spent / whole) * Math.PI * 2
      const inset = Math.min(gap / 2, Math.max(0, sweep / 2 - 0.02))
      const start = cursor + inset
      const end = cursor + sweep - inset
      cursor += sweep
      const mid = point(cursor - sweep / 2)
      if (end - start < 0.08) {
        const fullyOver = segment.within <= 0.005
        marks.push({
          key: `${index}-dot`,
          node: (
            <>
              <circle
                cx={mid.x}
                cy={mid.y}
                r={DONUT_STROKE / 2}
                fill={fullyOver ? darkerShade(segment.color) : segment.color}
              />
              {segment.color !== DONUT_LEFT
                ? halftone(
                    `tone-${index}`,
                    segment.color,
                    start,
                    end,
                    null,
                    [{ x: mid.x, y: mid.y }],
                    { start: true, end: true },
                    fullyOver ? 'shadow' : 'hint',
                  )
                : null}
            </>
          ),
        })
        return
      }
      const over = segment.spent - segment.within
      const split =
        over > 0.005 && segment.within > 0.005
          ? start + (segment.within / segment.spent) * (end - start)
          : over > 0.005
            ? start
            : end
      const startPoint = point(start)
      marks.push({
        key: `${index}-start`,
        node: (
          <circle
            cx={startPoint.x}
            cy={startPoint.y}
            r={DONUT_STROKE / 2}
            fill={
              segment.within > 0.005
                ? segment.color
                : darkerShade(segment.color)
            }
          />
        ),
      })
      if (split - start > 0.001) {
        const d = arc(start, split)
        if (d) {
          marks.push({
            key: `${index}-color`,
            node: (
              <path
                d={d}
                fill="none"
                stroke={segment.color}
                strokeWidth={DONUT_STROKE}
                strokeLinecap="butt"
              />
            ),
          })
        }
      }
      if (end - split > 0.001) {
        const d = arc(split, end)
        if (d) {
          marks.push({
            key: `${index}-over`,
            node: (
              <path
                d={d}
                fill="none"
                stroke={darkerShade(segment.color)}
                strokeWidth={DONUT_STROKE}
                strokeLinecap="butt"
              />
            ),
          })
        }
      }
      const endPoint = point(end)
      marks.push({
        key: `${index}-end`,
        node: (
          <circle
            cx={endPoint.x}
            cy={endPoint.y}
            r={DONUT_STROKE / 2}
            fill={over > 0.005 ? darkerShade(segment.color) : segment.color}
          />
        ),
      })
      if (segment.color !== DONUT_LEFT && split - start > 0.001) {
        marks.push({
          key: `${index}-hint`,
          node: halftone(
            `hint-${index}`,
            segment.color,
            start,
            split,
            arc(start, split),
            over > 0.005 ? [startPoint] : [startPoint, endPoint],
            { start: true, end: over <= 0.005 },
            'hint',
          ),
        })
      }
      if (over > 0.005) {
        const fullyOver = segment.within <= 0.005
        marks.push({
          key: `${index}-tone`,
          node: halftone(
            `tone-${index}`,
            segment.color,
            split,
            end,
            arc(split, end),
            [
              ...(fullyOver ? [startPoint] : []),
              endPoint,
            ],
            { start: fullyOver, end: true },
            'shadow',
          ),
        })
      }
    })
  }

  return (
    <div className="relative size-44 shrink-0">
      <svg
        viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
        className="size-full"
        aria-hidden
      >
        {marks.map((mark) => (
          <g key={mark.key}>{mark.node}</g>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="text-xl font-semibold tabular-nums">
          {formatUsd(total)}
        </span>
        <span
          className={cn(
            'text-xs tabular-nums',
            left < -0.005 ? undefined : 'text-muted-foreground',
          )}
        >
          {left < -0.005
            ? `${formatUsd(-left)} over`
            : `${formatUsd(Math.max(0, left))} left`}
        </span>
      </div>
    </div>
  )
}

function TransactionRow({
  txn,
  accounts,
  categories,
  showAccount = true,
  showDate = false,
  divided = false,
  onClick,
}: {
  txn: SpendingTxn
  accounts: { id: string; name: string }[]
  categories: SpendingCategory[]
  showAccount?: boolean
  showDate?: boolean
  divided?: boolean
  onClick: () => void
}) {
  const [open, setOpen] = useState(false)
  const category = categoryName(txn.categoryId, categories)
  const merchant = displayMerchant(txn)
  const description =
    txn.description && txn.description !== merchant ? txn.description : ''
  return (
    <li className={cn('min-w-0', divided && 'border-border border-t border-dotted')}>
      <button
        type="button"
        className={cn(
          'hover-fill grid w-full min-w-0 items-start gap-x-3 rounded-lg py-2 text-left',
          'grid-cols-[minmax(0,1fr)_5.75rem]',
          showAccount && showDate &&
            'lg:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_6rem_auto_5.75rem]',
          showAccount && !showDate &&
            'lg:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_6rem_5.75rem]',
          !showAccount && showDate &&
            'lg:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_auto_5.75rem]',
          !showAccount && !showDate &&
            'lg:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,8rem)_5.75rem]',
        )}
        aria-expanded={open}
        onClick={() => {
          if (window.matchMedia('(min-width: 1024px)').matches) {
            onClick()
            return
          }
          setOpen((current) => !current)
        }}
      >
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
          {description || merchant}
        </span>
        <span className="text-muted-foreground hidden w-full min-w-0 truncate pt-0.5 text-xs lg:block lg:overflow-visible lg:whitespace-normal lg:break-words">
          {category}
        </span>
        <span className="text-muted-foreground hidden min-w-0 break-words pt-0.5 text-xs [overflow-wrap:anywhere] lg:block">
          {merchant}
        </span>
        {showAccount ? (
          <span className="text-muted-foreground hidden w-24 shrink-0 pt-0.5 text-xs lg:block">
            {accountName(txn.accountId, accounts)}
          </span>
        ) : null}
        {showDate ? (
          <span className="text-muted-foreground hidden shrink-0 pt-0.5 lg:block">
            {formatDateWithoutYear(txn.date, 'short')}
          </span>
        ) : null}
        <span
          className={cn(
            'w-[5.75rem] shrink-0 pt-0.5 text-right tabular-nums',
            txn.amount < 0 && 'text-muted-foreground',
          )}
        >
          {formatTxnAmount(txn.amount)}
        </span>
      </button>
      {open ? (
        <div className="grid justify-items-start gap-2 pb-2 lg:hidden">
          <dl className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Merchant</dt>
            <dd className="min-w-0 break-words">{merchant}</dd>
            <dt className="text-muted-foreground">Category</dt>
            <dd className="min-w-0 break-words">{category}</dd>
            <dt className="text-muted-foreground">Account</dt>
            <dd className="min-w-0 break-words">
              {accountName(txn.accountId, accounts)}
            </dd>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatDateWithoutYear(txn.date, 'short')}</dd>
          </dl>
          <Button type="button" variant="outline" size="sm" onClick={onClick}>
            Edit
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function CategoryPairFields({
  categories,
  categoryId,
  onChange,
  onAddCategory,
}: {
  categories: SpendingCategory[]
  categoryId: string
  onChange: (categoryId: string) => void
  onAddCategory?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const choices = calendarCategoryOptions(categories).filter(
    (item) => item.id !== '__spending__',
  )
  const listed = choices.some((item) => item.id === categoryId)
  const selected = categories.find((item) => item.id === categoryId)

  return (
    <label className="grid gap-1.5">
      <span className="text-muted-foreground text-xs">Category</span>
      <Select
        open={menuOpen}
        onOpenChange={setMenuOpen}
        value={categoryId || NONE}
        onValueChange={(value) => onChange(value === NONE ? '' : value)}
      >
        <SelectTrigger className="w-full" aria-label="Category">
          <SelectValue placeholder="Uncategorized" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Uncategorized</SelectItem>
          {selected && !listed ? (
            <SelectItem value={selected.id}>
              {toSentenceCase(selected.name)}
            </SelectItem>
          ) : null}
          {choices.map((category) => (
            <SelectItem
              key={category.id}
              value={category.id}
              className={category.depth > 0 ? 'pl-6' : undefined}
            >
              {category.label}
            </SelectItem>
          ))}
          {onAddCategory ? (
            <>
              <SelectSeparator />
              <button
                type="button"
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-left text-sm outline-hidden"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setMenuOpen(false)
                  onAddCategory()
                }}
              >
                <Plus className="size-3.5" />
                Add category
              </button>
            </>
          ) : null}
        </SelectContent>
      </Select>
    </label>
  )
}

function BreakdownDialog({
  open,
  year,
  transactions,
  categories,
  counts,
  onClose,
}: {
  open: boolean
  year: number
  transactions: SpendingTxn[]
  categories: SpendingCategory[]
  counts: (txn: SpendingTxn) => boolean
  onClose: () => void
}) {
  const rows = useMemo(
    () => spendingBreakdown(year, transactions, categories, counts),
    [categories, counts, transactions, year],
  )
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(76rem,calc(100%-2rem))] max-w-[calc(100%-2rem)] sm:max-w-[min(76rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>Breakdown</DialogTitle>
          <DialogDescription>
            {year}, by month. Subcategories roll into Spending.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(70vh,36rem)] overflow-auto">
          <table className="w-full min-w-[62rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="bg-background sticky left-0 z-10 px-2 py-2 text-left font-medium">
                  Category
                </th>
                {SHORT_MONTHS.map((label) => (
                  <th
                    key={label}
                    className="text-muted-foreground px-2 py-2 text-right font-medium"
                  >
                    {label}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th
                    className={cn(
                      'bg-background sticky left-0 z-10 px-2 py-1.5 text-left font-normal',
                      row.depth > 0 && 'text-muted-foreground pl-6',
                      row.depth === 0 && 'font-medium',
                      row.id === 'total' && 'border-border border-t',
                    )}
                  >
                    {row.label}
                  </th>
                  {row.months.map((amount, index) => (
                    <td
                      key={index}
                      className={cn(
                        'px-2 py-1.5 text-right tabular-nums',
                        Math.abs(amount) < 0.005 && 'text-muted-foreground',
                        row.id === 'total' && 'border-border border-t',
                      )}
                    >
                      {formatUsd(amount)}
                    </td>
                  ))}
                  <td
                    className={cn(
                      'px-2 py-1.5 text-right font-medium tabular-nums',
                      row.id === 'total' && 'border-border border-t',
                    )}
                  >
                    {formatUsd(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AffirmLogDialog({
  open,
  loan,
  step,
  total,
  categories,
  onClose,
  onSave,
}: {
  open: boolean
  loan: AffirmLoan | null
  step: number
  total: number
  categories: SpendingCategory[]
  onClose: () => void
  onSave: (categoryId: string, date: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open && loan ? (
          <AffirmLogForm
            key={loan.id}
            loan={loan}
            step={step}
            total={total}
            categories={categories}
            onClose={onClose}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AffirmLogForm({
  loan,
  step,
  total,
  categories,
  onClose,
  onSave,
}: {
  loan: AffirmLoan
  step: number
  total: number
  categories: SpendingCategory[]
  onClose: () => void
  onSave: (categoryId: string, date: string) => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  return (
    <>
      <DialogHeader>
        <DialogTitle>{loan.name}</DialogTitle>
        <DialogDescription>
          {formatUsd(loan.startingBalance)}
          {total > 1 ? ` · ${step} of ${total}` : ''}
          {loan.startDate
            ? `. Affirm date ${formatLongDate(loan.startDate)}.`
            : '.'}{' '}
          The purchase date is the day you bought it.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <CategoryPairFields
          categories={categories}
          categoryId={categoryId}
          onChange={setCategoryId}
        />
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Purchase date</span>
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            autoFocus
          />
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!date}
          onClick={() => onSave(categoryId, date)}
        >
          Log
        </Button>
      </DialogFooter>
    </>
  )
}

function AccountField({
  accounts,
  accountId,
  onChange,
}: {
  accounts: PaymentAccount[]
  accountId: string
  onChange: (id: string) => void
}) {
  const known = accounts.some((account) => account.id === accountId)
  const checking = accounts.filter((account) => account.kind !== 'credit')
  const cards = accounts.filter((account) => account.kind === 'credit')
  const options = (items: PaymentAccount[]) =>
    items.map((account) => (
      <SelectItem key={account.id} value={account.id}>
        {account.name}
      </SelectItem>
    ))
  return (
    <label className="grid gap-1.5">
      <span className="text-muted-foreground text-xs">Account</span>
      <Select value={accountId || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full" aria-label="Account">
          <SelectValue placeholder="Account" />
        </SelectTrigger>
        <SelectContent>
          {accountId && !known ? (
            <SelectItem value={accountId}>Unknown</SelectItem>
          ) : null}
          {cards.length > 0 ? (
            <>
              <SelectGroup>
                <SelectLabel>Checking</SelectLabel>
                {options(checking)}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Credit card</SelectLabel>
                {options(cards)}
              </SelectGroup>
            </>
          ) : (
            options(checking)
          )}
        </SelectContent>
      </Select>
    </label>
  )
}

function AddTxnDialog({
  open,
  accounts,
  categories,
  defaultDate,
  defaultAccountId,
  onClose,
  onSave,
  onEditCategories,
}: {
  open: boolean
  accounts: PaymentAccount[]
  categories: SpendingCategory[]
  defaultDate: string
  defaultAccountId: string
  onClose: () => void
  onSave: (input: {
    date: string
    description: string
    merchant: string
    accountId: string
    amount: number
    categoryId?: string
  }) => void
  onEditCategories: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <AddTxnForm
            key={`${defaultDate}-${defaultAccountId}`}
            accounts={accounts}
            categories={categories}
            defaultDate={defaultDate}
            defaultAccountId={defaultAccountId}
            onClose={onClose}
            onSave={onSave}
            onEditCategories={onEditCategories}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function AddTxnForm({
  accounts,
  categories,
  defaultDate,
  defaultAccountId,
  onClose,
  onSave,
  onEditCategories,
}: {
  accounts: PaymentAccount[]
  categories: SpendingCategory[]
  defaultDate: string
  defaultAccountId: string
  onClose: () => void
  onSave: (input: {
    date: string
    description: string
    merchant: string
    accountId: string
    amount: number
    categoryId?: string
  }) => void
  onEditCategories: () => void
}) {
  const [name, setName] = useState('')
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [accountId, setAccountId] = useState(defaultAccountId)
  const [categoryId, setCategoryId] = useState('')
  const parsedAmount = parseAmount(amount)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add transaction</DialogTitle>
        <DialogDescription>
          Enter what you bought and where you bought it.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Name</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sunscreen"
            autoFocus
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Merchant</span>
          <Input
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Amazon"
          />
        </label>
        <CategoryPairFields
          categories={categories}
          categoryId={categoryId}
          onChange={setCategoryId}
          onAddCategory={onEditCategories}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Amount</span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Date</span>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
        <AccountField
          accounts={accounts}
          accountId={accountId}
          onChange={setAccountId}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={
            !name.trim() ||
            !merchant.trim() ||
            parsedAmount == null ||
            parsedAmount <= 0 ||
            !date ||
            !accountId
          }
          onClick={() => {
            if (parsedAmount == null) return
            onSave({
              date,
              description: toSentenceCase(name),
              merchant: toSentenceCase(merchant),
              accountId,
              amount: parsedAmount,
              ...(categoryId ? { categoryId } : {}),
            })
          }}
        >
          Add
        </Button>
      </DialogFooter>
    </>
  )
}

function EditTxnDialog({
  txn,
  accounts,
  categories,
  uploads,
  onClose,
  onSave,
  onDelete,
  onEditCategories,
}: {
  txn: SpendingTxn | null
  accounts: PaymentAccount[]
  categories: SpendingCategory[]
  uploads: SpendingUpload[]
  onClose: () => void
  onSave: (
    id: string,
    patch: Partial<Omit<SpendingTxn, 'id'>>,
    rule?: { match: string; merchant: string; categoryId?: string },
  ) => void
  onDelete: (id: string) => void
  onEditCategories: () => void
}) {
  return (
    <Dialog open={txn != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {txn ? (
          <EditTxnForm
            key={txn.id}
            txn={txn}
            accounts={accounts}
            categories={categories}
            uploads={uploads}
            onSave={onSave}
            onDelete={onDelete}
            onEditCategories={onEditCategories}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EditTxnForm({
  txn,
  accounts,
  categories,
  uploads,
  onSave,
  onDelete,
  onEditCategories,
}: {
  txn: SpendingTxn
  accounts: PaymentAccount[]
  categories: SpendingCategory[]
  uploads: SpendingUpload[]
  onSave: (
    id: string,
    patch: Partial<Omit<SpendingTxn, 'id'>>,
    rule?: { match: string; merchant: string; categoryId?: string },
  ) => void
  onDelete: (id: string) => void
  onEditCategories: () => void
}) {
  const [name, setName] = useState(() => {
    const shown = displayMerchant(txn)
    return txn.description && txn.description !== shown ? txn.description : shown
  })
  const [merchant, setMerchant] = useState(() => displayMerchant(txn))
  const [amount, setAmount] = useState(Math.abs(txn.amount).toFixed(2))
  const [date, setDate] = useState(txn.date)
  const [accountId, setAccountId] = useState(txn.accountId)
  const [categoryId, setCategoryId] = useState(() => txn.categoryId ?? '')
  const [createRule, setCreateRule] = useState(false)
  const [match, setMatch] = useState(() => defaultRuleMatch(txn.description))
  const fromStatement = statementName(txn, uploads)
  const parsedAmount = parseAmount(amount)
  const deposit = txn.amount < 0

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit purchase</DialogTitle>
        <DialogDescription>
          {fromStatement
            ? `From ${fromStatement}`
            : 'Change the name, merchant, category, or amount.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Name</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sunscreen"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Merchant</span>
          <Input
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Amazon"
          />
        </label>
        <CategoryPairFields
          categories={categories}
          categoryId={categoryId}
          onChange={setCategoryId}
          onAddCategory={onEditCategories}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">
              {deposit ? 'Deposit' : 'Amount'}
            </span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Date</span>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
        <AccountField
          accounts={accounts}
          accountId={accountId}
          onChange={setAccountId}
        />
        <Button
          type="button"
          variant={createRule ? 'secondary' : 'outline'}
          onClick={() => setCreateRule((open) => !open)}
        >
          Create rule
        </Button>
        {createRule ? (
          <div className="grid gap-3 rounded-lg border p-3">
            <label className="grid gap-1.5">
              <span className="text-muted-foreground text-xs">
                If the description contains
              </span>
              <Input
                value={match}
                placeholder="CHEWY"
                onChange={(event) => setMatch(event.target.value)}
              />
            </label>
            <p className="text-muted-foreground text-xs">
              Matching purchases will use the merchant {merchant.trim() || 'this'}
              {categoryId
                ? ` and filed under ${categoryName(categoryId, categories)}`
                : ''}
              .
            </p>
          </div>
        ) : null}
      </div>
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="destructive" onClick={() => onDelete(txn.id)}>
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
        <Button
          type="button"
          disabled={
            !name.trim() ||
            !merchant.trim() ||
            parsedAmount == null ||
            parsedAmount <= 0 ||
            !date ||
            (createRule && !match.trim())
          }
          onClick={() => {
            if (parsedAmount == null) return
            const signed = deposit ? -parsedAmount : parsedAmount
            const nextCategory = categoryId || undefined
            const nextName = toSentenceCase(name)
            const nextMerchant = toSentenceCase(merchant)
            onSave(
              txn.id,
              {
                description: nextName,
                merchant: nextMerchant,
                amount: signed,
                date,
                accountId,
                categoryId: nextCategory,
                customName:
                  nextMerchant !== displayMerchant(txn) ? true : txn.customName,
                customCategory:
                  nextCategory !== txn.categoryId ? true : txn.customCategory,
              },
              createRule
                ? {
                    match: match.trim(),
                    merchant: nextMerchant,
                    categoryId: nextCategory,
                  }
                : undefined,
            )
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

type ChildDraft = {
  id: string
  name: string
}

type GroupDraft = {
  id: string
  name: string
  expenseIds: string[]
  categories: ChildDraft[]
  subcategories: boolean
}

function snapshotCategoryPicks(groups: GroupDraft[]) {
  return JSON.stringify(
    groups.map((group) => ({
      id: group.id,
      name: group.name.trim(),
      expenseIds: [...group.expenseIds].sort(),
      categories: group.categories.map((item) => ({
        id: item.id,
        name: item.name.trim(),
      })),
    })),
  )
}

function ensureMainGroupDrafts(groups: GroupDraft[]) {
  const next = [...groups]
  const add = (name: string, subcategories: boolean) => {
    next.push({
      id: crypto.randomUUID(),
      name,
      expenseIds: [],
      categories: [],
      subcategories,
    })
  }
  if (!next.some((group) => isSpendingMainName(group.name))) add('Spending', true)
  if (!next.some((group) => categoryDonutKey(group.name) === 'food')) add('Food', false)
  if (!next.some((group) => categoryDonutKey(group.name) === 'gas')) add('Gas', false)
  const rank = (group: GroupDraft) => {
    if (isSpendingMainName(group.name)) return 0
    if (categoryDonutKey(group.name) === 'food') return 1
    if (categoryDonutKey(group.name) === 'gas') return 2
    return 3
  }
  return next.sort((left, right) => rank(left) - rank(right))
}

const GHOST_FIELD =
  'edit-ghost-field border-transparent bg-transparent shadow-none transition-colors hover:bg-transparent focus-visible:ring-0 focus-visible:ring-transparent dark:bg-transparent dark:hover:bg-transparent'

const MONTH_ALIASES = [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may', 'may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sep'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec'],
] as const

function monthFromStatementName(name: string) {
  const hay = name.toLowerCase().replace(/[_./]+/g, ' ')
  for (let month = 0; month < MONTH_ALIASES.length; month += 1) {
    const [full, short] = MONTH_ALIASES[month]
    if (new RegExp(`\\b${full}\\b`).test(hay)) return month
    if (new RegExp(`\\b${short}\\b`).test(hay)) return month
  }
  const iso = name.match(/(20\d{2})[-_./ ](0?[1-9]|1[0-2])/)
  if (iso) return Number(iso[2]) - 1
  const us = name.match(/(0?[1-9]|1[0-2])[-_./ ](20\d{2})/)
  if (us) return Number(us[1]) - 1
  return null
}

function yearFromStatementName(name: string) {
  const match = name.match(/\b(20\d{2})\b/)
  return match ? Number(match[1]) : null
}

function uploadMonthKey(
  upload: SpendingUpload,
  transactions: SpendingTxn[],
  uploads: SpendingUpload[],
) {
  const namedMonth = monthFromStatementName(upload.name)
  const namedYear = yearFromStatementName(upload.name)
  if (namedMonth != null) {
    if (namedYear != null) return { year: namedYear, month: namedMonth }
    const dated = transactionsForUpload(transactions, upload, uploads).find(
      (txn) => /^\d{4}-\d{2}/.test(txn.date),
    )
    const year = dated
      ? Number(dated.date.slice(0, 4))
      : new Date(upload.uploadedAt).getFullYear()
    return {
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      month: namedMonth,
    }
  }
  const dated = transactionsForUpload(transactions, upload, uploads).filter(
    (txn) => /^\d{4}-\d{2}/.test(txn.date),
  )
  if (dated.length > 0) {
    const counts = new Map<string, number>()
    for (const txn of dated) {
      const key = txn.date.slice(0, 7)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]
    if (top) {
      const [year, month] = top[0].split('-').map(Number)
      return { year, month: month - 1 }
    }
  }
  const uploaded = new Date(upload.uploadedAt)
  if (!Number.isFinite(uploaded.getTime())) return null
  return { year: uploaded.getFullYear(), month: uploaded.getMonth() }
}

function statementCountLabel(count: number) {
  return count === 1 ? '1 statement' : `${count} statements`
}

function statementName(txn: SpendingTxn, uploads: SpendingUpload[]) {
  if (txn.uploadId) {
    const upload = uploads.find((item) => item.id === txn.uploadId)
    if (upload) return upload.name
  }
  return txn.sourceFile ?? ''
}

function EditCategoriesDialog({
  open,
  categories,
  onClose,
  onSave,
}: {
  open: boolean
  categories: SpendingCategory[]
  onClose: () => void
  onSave: (categories: SpendingCategory[]) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const pendingScrollId = useRef<string | null>(null)
  const [drafts, setDrafts] = useState<GroupDraft[]>([])
  const [baseline, setBaseline] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const children = new Map<string, ChildDraft[]>()
    for (const item of categories) {
      if (!item.parentId) continue
      const list = children.get(item.parentId) ?? []
      list.push({
        id: item.id,
        name: item.name,
      })
      children.set(item.parentId, list)
    }
    const nextDrafts: GroupDraft[] = []
    for (const item of categories) {
      if (item.parentId) continue
      if (
        !isGroupedSpendingCategory(item) &&
        !(isActiveSpendingCategory(item) && categoryExpenseIds(item).length > 0)
      ) {
        continue
      }
      nextDrafts.push({
        id: item.id,
        name: item.name,
        expenseIds: categoryExpenseIds(item),
        categories: children.get(item.id) ?? [],
        subcategories:
          isSpendingMainName(item.name) ||
          ((children.get(item.id)?.length ?? 0) > 0 &&
            categoryDonutKey(item.name) == null),
      })
    }
    const ensured = ensureMainGroupDrafts(nextDrafts)
    setDrafts(ensured)
    setBaseline(snapshotCategoryPicks(ensured))
    setConfirmOpen(false)
    pendingScrollId.current = null
  }, [categories, open])

  useLayoutEffect(() => {
    const id = pendingScrollId.current
    if (!id) return
    pendingScrollId.current = null
    const node = listRef.current?.querySelector(`[data-scroll-id="${id}"]`)
    if (!(node instanceof HTMLElement)) return
    node.scrollIntoView({ behavior: 'smooth', block: 'end' })
    node.querySelector('input')?.focus()
  }, [drafts])

  const dirty =
    baseline !== '' && snapshotCategoryPicks(drafts) !== baseline

  function closeClean() {
    setConfirmOpen(false)
    onClose()
  }

  function requestClose() {
    if (confirmOpen) return
    if (dirty) {
      setConfirmOpen(true)
      return
    }
    closeClean()
  }

  function updateGroup(id: string, patch: Partial<GroupDraft>) {
    setDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function addGroup() {
    const id = crypto.randomUUID()
    pendingScrollId.current = id
    setDrafts((current) => [
      ...current,
      { id, name: '', expenseIds: [], categories: [], subcategories: false },
    ])
  }

  function addCategory(groupId: string) {
    const id = crypto.randomUUID()
    pendingScrollId.current = id
    setDrafts((current) =>
      current.map((item) =>
        item.id === groupId
          ? {
              ...item,
              categories: [...item.categories, { id, name: '' }],
            }
          : item,
      ),
    )
  }

  function handleSave() {
    const next: SpendingCategory[] = []
    for (const group of drafts) {
      const name = toSentenceCase(group.name)
      if (!name) continue
      next.push({
        id: group.id,
        name,
        grouped: true,
        ...(group.expenseIds.length > 0 ? { expenseIds: group.expenseIds } : {}),
      })
      for (const child of group.categories) {
        const childName = toSentenceCase(child.name)
        if (!childName) continue
        next.push({
          id: child.id,
          name: childName,
          parentId: group.id,
        })
      }
    }
    for (const item of categories) {
      if (item.enabled !== false) continue
      if (item.parentId || item.grouped) continue
      if (next.some((row) => row.id === item.id)) continue
      next.push(item)
    }
    onSave(next)
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose()
        }}
      >
        <DialogContent
          className="w-[min(46rem,calc(100%-2rem))] max-w-[calc(100%-2rem)] gap-0 p-4 sm:max-w-2xl"
          showCloseButton={false}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            if (confirmOpen) {
              setConfirmOpen(false)
              return
            }
            requestClose()
          }}
        >
          <div className="-mx-4 border-b px-4 pb-4">
            <div className="flex items-center justify-between gap-3">
              <DialogHeader>
                <DialogTitle className="pl-2.5 text-2xl tracking-tight">
                  Edit categories
                </DialogTitle>
              </DialogHeader>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={addGroup}
              >
                Add group
              </Button>
            </div>
          </div>

          <div
            ref={listRef}
            className="no-scrollbar max-h-[min(70vh,40rem)] overflow-y-auto py-3"
          >
            {drafts.length === 0 ? (
              <p className="text-muted-foreground px-2.5 py-2 text-sm">
                Add a group, then add subcategories under Spending.
              </p>
            ) : (
              <ul className="divide-y divide-black/10">
                {drafts.map((group) => (
                  <li
                    key={group.id}
                    data-scroll-id={group.id}
                    className="py-1"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-2 py-1.5 pr-2.5 pl-2.5">
                      <Input
                        className={cn('h-8 min-w-0', GHOST_FIELD)}
                        value={group.name}
                        placeholder="Group"
                        aria-label="Group name"
                        onChange={(event) =>
                          updateGroup(group.id, { name: event.target.value })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label={`Remove ${group.name || 'group'}`}
                        onClick={() =>
                          setDrafts((current) =>
                            current.filter((item) => item.id !== group.id),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {group.subcategories ? (
                      <div className="mb-1 grid gap-0.5">
                        {group.categories.map((child) => (
                          <div
                            key={child.id}
                            data-scroll-id={child.id}
                            className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-2 py-1 pr-2.5 pl-2.5"
                          >
                            <Input
                              className={cn(
                                'h-8 min-w-0 flex-1 ml-4',
                                GHOST_FIELD,
                              )}
                              value={child.name}
                              placeholder="Subcategory"
                              aria-label="Subcategory name"
                              onChange={(event) =>
                                updateGroup(group.id, {
                                  categories: group.categories.map((item) =>
                                    item.id === child.id
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0"
                              aria-label={`Remove ${child.name || 'subcategory'}`}
                              onClick={() =>
                                updateGroup(group.id, {
                                  categories: group.categories.filter(
                                    (item) => item.id !== child.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        ))}
                        <div className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-2 pr-2.5 pl-2.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground ml-4 h-8 justify-start px-2.5 hover:bg-transparent hover:text-foreground"
                            onClick={() => addCategory(group.id)}
                          >
                            <Plus className="size-3.5" />
                            Add subcategory
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="relative z-20 items-center sm:justify-end sm:gap-4">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!dirty} onClick={handleSave}>
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
    </>
  )
}
