import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Check, ChevronDown, Menu, Pencil } from 'lucide-react'

import { AffirmCard } from '@/components/affirm-card'
import { CardGearButton, EditDebtsDialog } from '@/components/budget-cards'
import { MetricStrip } from '@/components/metric-strip'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { paymentWithoutCharges, type Debt } from '@/lib/budget'
import { useBudget } from '@/lib/budget-context'
import { useDebtPlan } from '@/lib/debt-plan-context'
import {
  PAYOFF_STRATEGIES,
  debtFreeLabel,
  debtsWithAffirmPlan,
  debtsWithHistoryAccounts,
  historyRows,
  historyVisibleDebts,
  logPlannerMonth,
  applyPlannerMonthValue,
  monthWithLineValue,
  type PlannerValueField,
  chargeOverride,
  interestOverride,
  monthKey,
  paymentOverride,
  ALL_DEBT_YEARS,
  actualDebtMetricMonths,
  debtMetricMonths,
  plannerMetricYears,
  plannerRows,
  plannerVisibleDebts,
  pruneExpiredAffirmLoans,
  projectDebtPlan,
  resolveCustomOrder,
  strategyDebtOrder,
  strategyLabel,
  withLiveMonthlyBudget,
  yearDebtSummary,
  ymIndex,
  type DebtMetricYear,
  type DebtPlanState,
  type PayoffStrategy,
  type PlannerLine,
  type PlannerMonth,
} from '@/lib/debt-plan'
import { formatUsdWhole } from '@/lib/format'
import { plannerMonthlyNet } from '@/lib/income'
import { usePaystubs } from '@/lib/paystub-context'
import { cn } from '@/lib/utils'

type PlannerView = 'planner' | 'history'

const MONTH_COL = 88
const LABEL_COL = 64
const EXTRA_FILL = 'bg-[#F3E6E9]'
const EXTRA_LINE = 'bg-[#E0D0D3]'
const EXTRA_DARK = 'text-[#3A121C]'
const EXTRA_LIGHT = 'text-[#C9A8AE]'
const PLAN_HORIZON = 120
const PLAN_UNDO_LIMIT = 10
const TIP_DELAY_MS = 1000

type MonthTip = {
  key: string
  line: PlannerLine
  top: number
  left: number
}

type TipApi = {
  enter: (key: string, line: PlannerLine, el: HTMLElement) => void
  leave: (event: PointerEvent<HTMLElement>, key: string) => void
  hide: () => void
}

const TipContext = createContext<TipApi>({
  enter: () => {},
  leave: () => {},
  hide: () => {},
})

function lineHasDetail(line: PlannerLine) {
  return (
    line.start > 0.005 ||
    line.paid > 0.005 ||
    line.interest > 0.005 ||
    Math.abs(line.charged) > 0.005 ||
    line.balance > 0.005
  )
}

function tipPosition(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const width = 176
  const gap = 8
  let left = rect.right + gap
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, rect.left - width - gap)
  }
  const top = Math.min(
    Math.max(8, rect.top),
    window.innerHeight - 120,
  )
  return { top, left }
}

export function DebtPage() {
  const { paystubs } = usePaystubs()
  const { debts, expenses } = useBudget()
  const { plan, setPlan } = useDebtPlan()
  const now = useMemo(() => new Date(), [])
  const monthlyNet = useMemo(
    () => Math.round(plannerMonthlyNet(paystubs, now)),
    [paystubs, now],
  )
  const plannerDebts = useMemo(
    () => debtsWithAffirmPlan(debts, plan.affirmLoans, now),
    [debts, plan.affirmLoans, now],
  )
  const allDebts = useMemo(
    () => debtsWithHistoryAccounts(plannerDebts),
    [plannerDebts],
  )

  const planForMath = useMemo(
    () => withLiveMonthlyBudget(plan, plannerDebts, expenses, monthlyNet),
    [plan, plannerDebts, expenses, monthlyNet],
  )
  const months = useMemo(
    () => projectDebtPlan(allDebts, planForMath, expenses, PLAN_HORIZON, now),
    [allDebts, expenses, planForMath, now],
  )
  const upcoming = plannerRows(months, plan, now)
  const history = historyRows(months, plan, now, allDebts)
  const freeOn = debtFreeLabel(months)
  const metricMonths = useMemo(
    () => actualDebtMetricMonths(months, plan, now, allDebts),
    [allDebts, months, plan, now],
  )
  const years = useMemo(
    () => plannerMetricYears(metricMonths, now),
    [metricMonths, now],
  )
  const [year, setYear] = useState<DebtMetricYear>(() => now.getFullYear())
  const selectedYear: DebtMetricYear =
    year === ALL_DEBT_YEARS || years.includes(year)
      ? year
      : (years[0] ?? now.getFullYear())
  const yearStats = useMemo(
    () =>
      yearDebtSummary(
        debtMetricMonths(months, plan, selectedYear, now, allDebts),
        selectedYear,
      ),
    [allDebts, months, now, plan, selectedYear],
  )

  return (
    <main className="mx-auto grid max-w-5xl px-6 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-medium">
          Debt payoff planner
        </h1>
        <Select
          value={String(selectedYear)}
          onValueChange={(value) =>
            setYear(value === ALL_DEBT_YEARS ? ALL_DEBT_YEARS : Number(value))
          }
        >
          <SelectTrigger
            aria-label="Debt year"
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
            <SelectItem value={ALL_DEBT_YEARS} className="text-base">
              All
            </SelectItem>
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

      <MetricStrip className="mt-8">
        <YearStat label="Starting balance" amount={yearStats.startTotal} />
        <YearStat
          label="Ending balance"
          amount={yearStats.endTotal}
          delta={yearStats.reduced}
        />
        <YearStat label="Interest paid" amount={yearStats.interest} />
        <YearStat label="Total towards debt" amount={yearStats.paid} />
      </MetricStrip>

      <div className="mt-8 grid gap-6">
        <PlannerCard
          debts={allDebts}
          plan={plan}
          freeOn={freeOn}
          history={history}
          upcoming={upcoming}
          now={now}
          onPlanChange={setPlan}
        />

        <AffirmCard
          loans={plan.affirmLoans}
          now={now}
          onLoansChange={(affirmLoans) => {
            setPlan((current) => ({
              ...current,
              affirmLoans: pruneExpiredAffirmLoans(affirmLoans, now),
            }))
          }}
        />
      </div>
    </main>
  )
}

function isTypingInField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      (target.tagName === 'INPUT' && !target.classList.contains('paid-input')))
  )
}

function paidInputHasDraft(target: EventTarget | null) {
  if (
    !(target instanceof HTMLInputElement) ||
    !target.classList.contains('paid-input')
  ) {
    return false
  }
  const committed = Number(target.dataset.committed ?? '0')
  const raw = target.value.trim()
  if (raw === '') return committed !== 0
  const parsed = Number(raw.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(parsed)) return true
  return Math.round(parsed) !== committed
}

function isLoggablePlannerMonth(row: PlannerMonth, now: Date) {
  return ymIndex(row.year, row.month) <= ymIndex(now.getFullYear(), now.getMonth())
}

function PlannerCard({
  debts,
  plan,
  freeOn,
  history,
  upcoming,
  now,
  onPlanChange,
}: {
  debts: Debt[]
  plan: DebtPlanState
  freeOn: string
  history: PlannerMonth[]
  upcoming: PlannerMonth[]
  now: Date
  onPlanChange: (plan: DebtPlanState) => void
}) {
  const [view, setView] = useState<PlannerView>('planner')
  const [customOpen, setCustomOpen] = useState(false)
  const [debtsOpen, setDebtsOpen] = useState(false)
  const [undoStack, setUndoStack] = useState<DebtPlanState[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const discardPaidCommit = useRef(false)
  const ordered = useMemo(() => strategyDebtOrder(debts, plan), [debts, plan])
  const columns = useMemo(
    () =>
      view === 'planner'
        ? plannerVisibleDebts(ordered, upcoming)
        : historyVisibleDebts(ordered, history),
    [ordered, view, upcoming, history],
  )
  const rows = view === 'planner' ? upcoming : [...history].reverse()

  useEffect(() => {
    if (view !== 'planner' || !editingKey) return
    const row = upcoming.find(
      (item) => monthKey(item.year, item.month) === editingKey,
    )
    if (row && !isLoggablePlannerMonth(row, now)) setEditingKey(null)
  }, [view, editingKey, upcoming, now])

  function changePlan(next: DebtPlanState) {
    if (JSON.stringify(next) === JSON.stringify(plan)) return
    setUndoStack((stack) => [...stack, plan].slice(-PLAN_UNDO_LIMIT))
    onPlanChange(next)
  }

  function undoPlan() {
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    setUndoStack(undoStack.slice(0, -1))
    onPlanChange(previous)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'z' && event.key !== 'Z') return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return
      }
      if (customOpen || debtsOpen) return
      if (isTypingInField(event.target) || paidInputHasDraft(event.target)) {
        return
      }
      if (undoStack.length === 0) return
      event.preventDefault()
      undoPlan()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [customOpen, debtsOpen, onPlanChange, undoStack])

  function chooseStrategy(strategy: PayoffStrategy) {
    const active = plannerVisibleDebts(debts, upcoming)
    if (strategy === 'custom') {
      const customOrder =
        plan.customOrder.length > 0
          ? resolveCustomOrder(
              active.map((debt) => debt.id),
              plan.customOrder,
            )
          : strategyDebtOrder(active, plan).map((debt) => debt.id)
      changePlan({ ...plan, strategy, customOrder })
      return
    }
    changePlan({ ...plan, strategy })
  }

  return (
    <>
      <Card className="pb-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-8">
            <HeaderStat label="Debt-free" value={freeOn} />
          </div>
          <div className="flex items-center gap-1">
            {view === 'planner' && plan.strategy === 'custom' ? (
              <button
                type="button"
                className="hover-fill rounded-lg px-3 py-1.5 text-sm"
                onClick={() => setCustomOpen(true)}
              >
                Edit
              </button>
            ) : null}
            {view === 'planner' ? (
              <StrategyMenu
                strategy={plan.strategy}
                onChoose={chooseStrategy}
              />
            ) : null}
            <ViewTab
              label="Planner"
              active={view === 'planner'}
              onClick={() => setView('planner')}
            />
            <ViewTab
              label="History"
              active={view === 'history'}
              onClick={() => {
                setEditingKey(null)
                setView('history')
              }}
            />
            <CardGearButton
              label="Edit debts"
              onClick={() => setDebtsOpen(true)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <MonthTable
          debts={columns}
          plan={plan}
          months={rows}
          lockHeight={view === 'history'}
          showStart={view === 'planner'}
          showExtra={view === 'planner'}
          monthAction={view === 'planner' ? 'task' : 'pencil'}
          now={now}
          editingKey={editingKey}
          onEditMonth={(row) => {
            if (view === 'planner' && !isLoggablePlannerMonth(row, now)) return
            setEditingKey(monthKey(row.year, row.month))
          }}
          onExitEdit={() => {
            const focused = document.activeElement
            if (
              focused instanceof HTMLInputElement &&
              focused.classList.contains('paid-input')
            ) {
              focused.blur()
            }
            setEditingKey(null)
          }}
          onLogMonth={(row) => {
            const { plan: next, row: snapshot } = applyFocusedPaidInput(
              plan,
              row,
            )
            changePlan(logPlannerMonth(next, snapshot))
            setEditingKey(null)
          }}
          onPaidChange={(year, month, debtId, amount) => {
            if (discardPaidCommit.current) return
            changePlan(
              applyPlannerMonthValue(plan, year, month, debtId, 'paid', amount),
            )
          }}
          onChargeChange={(year, month, debtId, amount) => {
            if (discardPaidCommit.current) return
            changePlan(
              applyPlannerMonthValue(
                plan,
                year,
                month,
                debtId,
                'charged',
                amount,
              ),
            )
          }}
          onInterestChange={(year, month, debtId, amount) => {
            if (discardPaidCommit.current) return
            changePlan(
              applyPlannerMonthValue(
                plan,
                year,
                month,
                debtId,
                'interest',
                amount,
              ),
            )
          }}
        />
      </CardContent>
      <CustomOrderDialog
        open={customOpen}
        debts={plannerVisibleDebts(debts, upcoming)}
        order={plan.customOrder}
        interestById={new Map(
          (upcoming[0]?.lines ?? []).map((line) => [line.debtId, line.interest]),
        )}
        onOpenChange={setCustomOpen}
        onSave={(customOrder) => {
          changePlan({ ...plan, strategy: 'custom', customOrder })
          setCustomOpen(false)
        }}
      />
      </Card>
      <EditDebtsDialog open={debtsOpen} onOpenChange={setDebtsOpen} />
    </>
  )
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label} · </span>
      <span className="font-medium tabular-nums">{value}</span>
    </p>
  )
}

function YearStat({
  label,
  amount,
  delta,
}: {
  label: string
  amount: number
  delta?: number
}) {
  return (
    <div className="w-full">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-4 flex items-baseline gap-2 text-2xl font-normal tabular-nums">
        {formatUsdWhole(amount)}
        {delta != null ? (
          <span className="text-muted-foreground inline-flex items-center gap-0.5 text-sm font-normal">
            {delta >= 0 ? (
              <ArrowDown className="size-3.5" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
            {formatUsdWhole(Math.abs(delta))}
          </span>
        ) : null}
      </p>
    </div>
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

const ORDER_GRID =
  'grid grid-cols-[1.25rem_1.25rem_minmax(0,1fr)_5.5rem_5.5rem_5.5rem] items-center gap-x-2'

function CustomOrderDialog({
  open,
  debts,
  order,
  interestById,
  onOpenChange,
  onSave,
}: {
  open: boolean
  debts: Debt[]
  order: string[]
  interestById: Map<string, number>
  onOpenChange: (open: boolean) => void
  onSave: (order: string[]) => void
}) {
  const [draft, setDraft] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(resolveCustomOrder(debts.map((debt) => debt.id), order))
    draggingIdRef.current = null
    setDraggingId(null)
  }, [open, debts, order])

  function onDragStart(event: DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    draggingIdRef.current = id
    setDraggingId(id)
  }

  function onDragOver(event: DragEvent<HTMLLIElement>, id: string) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const fromId = draggingIdRef.current
    if (!fromId || fromId === id) return
    setDraft((current) => {
      const from = current.indexOf(fromId)
      const to = current.indexOf(id)
      if (from === -1 || to === -1 || from === to) return current
      const next = [...current]
      next.splice(from, 1)
      next.splice(to, 0, fromId)
      return next
    })
  }

  function onDragEnd() {
    draggingIdRef.current = null
    setDraggingId(null)
  }

  const named = draft
    .map((id) => debts.find((debt) => debt.id === id))
    .filter((debt): debt is Debt => debt != null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Payoff order</DialogTitle>
          <DialogDescription>
            Extra payments go to 1st until it is paid off. Drag to reorder.
            Interest is for the upcoming month.
          </DialogDescription>
        </DialogHeader>
        <div className={cn(ORDER_GRID, 'text-muted-foreground mt-2 px-1 text-xs')}>
          <span />
          <span />
          <span>Creditor</span>
          <span className="text-right">Balance</span>
          <span className="text-right">Minimum</span>
          <span className="text-right">Interest</span>
        </div>
        <ol className="grid select-none">
          {named.map((debt, index) => (
            <li
              key={debt.id}
              data-debt-id={debt.id}
              onDragOver={(event) => onDragOver(event, debt.id)}
              onDrop={(event) => event.preventDefault()}
              className={cn(
                ORDER_GRID,
                'rounded-lg px-1 py-1.5',
                draggingId === debt.id && 'bg-[#f6f6f6] opacity-60',
              )}
            >
              <span className="text-muted-foreground text-sm tabular-nums">
                {index + 1}
              </span>
              <button
                type="button"
                draggable
                className="text-muted-foreground flex size-5 cursor-grab items-center justify-center touch-none active:cursor-grabbing"
                aria-label={`Drag ${debt.lender}`}
                onDragStart={(event) => onDragStart(event, debt.id)}
                onDragEnd={onDragEnd}
              >
                <Menu className="size-3.5" />
              </button>
              <span className="min-w-0 truncate text-sm">{debt.lender}</span>
              <span className="text-right text-sm tabular-nums">
                {formatUsdWhole(debt.balance)}
              </span>
              <span className="text-right text-sm tabular-nums">
                {formatUsdWhole(paymentWithoutCharges(debt))}
              </span>
              <span className="text-right text-sm tabular-nums">
                {formatUsdWhole(interestById.get(debt.id) ?? 0)}
              </span>
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
  lockHeight = false,
  showStart,
  showExtra = true,
  monthAction,
  now,
  editingKey,
  onEditMonth,
  onExitEdit,
  onLogMonth,
  onPaidChange,
  onChargeChange,
  onInterestChange,
}: {
  debts: { id: string; lender: string; apr: number }[]
  plan: DebtPlanState
  months: PlannerMonth[]
  lockHeight?: boolean
  showStart: boolean
  showExtra?: boolean
  monthAction: 'task' | 'pencil'
  now: Date
  editingKey: string | null
  onEditMonth: (row: PlannerMonth) => void
  onExitEdit: () => void
  onLogMonth: (row: PlannerMonth) => void
  onPaidChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
  onChargeChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
  onInterestChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const plannerRef = useRef<HTMLDivElement>(null)
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const [editFrame, setEditFrame] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  const [editActions, setEditActions] = useState<{
    top: number
    right: number
  } | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [canDrag, setCanDrag] = useState(false)
  const [bodyHeight, setBodyHeight] = useState<number | null>(null)
  const [tip, setTip] = useState<MonthTip | null>(null)
  const pendingRef = useRef<{ key: string; timer: number } | null>(null)
  const hideRef = useRef<number | null>(null)
  const shownKeyRef = useRef<string | null>(null)
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    scroll: 0,
    pointerId: -1,
  })
  const years = groupMonthsByYear(months)
  const editingRow = months.find(
    (row) => monthKey(row.year, row.month) === editingKey,
  )

  useLayoutEffect(() => {
    if (!editingKey) {
      setEditFrame(null)
      setEditActions(null)
      return
    }
    const wrap = tableWrapRef.current
    const planner = plannerRef.current
    const scroller = scrollerRef.current
    if (!wrap || !planner) return
    const editRows = [
      ...wrap.querySelectorAll('tr.month-edit-row'),
    ].filter((row): row is HTMLElement => row instanceof HTMLElement)
    const first = editRows[0]
    const last = editRows[editRows.length - 1]
    if (!first || !last) return
    const root = wrap
    const shell = planner

    function measure() {
      const wrapRect = root.getBoundingClientRect()
      const firstRect = first.getBoundingClientRect()
      const lastRect = last.getBoundingClientRect()
      setEditFrame({
        top: firstRect.top - wrapRect.top,
        left: firstRect.left - wrapRect.left,
        width: firstRect.width,
        height: lastRect.bottom - firstRect.top,
      })
      const plannerRect = shell.getBoundingClientRect()
      setEditActions({
        top: lastRect.bottom + 4,
        right: window.innerWidth - plannerRect.right + 8,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(first)
    observer.observe(last)
    observer.observe(shell)
    scroller?.addEventListener('scroll', measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      observer.disconnect()
      scroller?.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [editingKey, debts.length, months, plan])

  const clearPending = useCallback(() => {
    if (pendingRef.current) {
      window.clearTimeout(pendingRef.current.timer)
      pendingRef.current = null
    }
  }, [])

  const clearHide = useCallback(() => {
    if (hideRef.current != null) {
      window.clearTimeout(hideRef.current)
      hideRef.current = null
    }
  }, [])

  const hideTip = useCallback(() => {
    clearPending()
    clearHide()
    shownKeyRef.current = null
    setTip(null)
  }, [clearHide, clearPending])

  const enter = useCallback(
    (key: string, line: PlannerLine, el: HTMLElement) => {
      if (editingKey) return
      if (drag.current.moved) return
      if (!lineHasDetail(line)) {
        hideTip()
        return
      }
      clearHide()
      if (shownKeyRef.current === key) {
        setTip({ key, line, ...tipPosition(el) })
        return
      }
      if (pendingRef.current?.key === key) return
      clearPending()
      const timer = window.setTimeout(() => {
        pendingRef.current = null
        if (editingKey || drag.current.moved) return
        shownKeyRef.current = key
        setTip({ key, line, ...tipPosition(el) })
      }, TIP_DELAY_MS)
      pendingRef.current = { key, timer }
    },
    [clearHide, clearPending, editingKey, hideTip],
  )

  useEffect(() => {
    if (editingKey) hideTip()
  }, [editingKey, hideTip])

  useEffect(() => {
    if (!editingKey) return
    function onPointerDown(event: globalThis.PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target.closest(
          '.month-edit-row, .month-edit-frame, [data-month-edit-actions], .month-label',
        )
      ) {
        return
      }
      onExitEdit()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [editingKey, onExitEdit])

  const leave = useCallback(
    (event: PointerEvent<HTMLElement>, key: string) => {
      const next = event.relatedTarget
      if (
        next instanceof Element &&
        (next.closest(`[data-debt-tip="${CSS.escape(key)}"]`) ||
          next.closest('[data-debt-tip-pop]'))
      ) {
        return
      }
      clearPending()
      clearHide()
      hideRef.current = window.setTimeout(hideTip, 120)
    },
    [clearHide, clearPending, hideTip],
  )

  useEffect(() => () => hideTip(), [hideTip])

  useLayoutEffect(() => {
    if (lockHeight) return
    const el = plannerRef.current
    if (!el) return
    const height = el.offsetHeight
    if (height > 0) setBodyHeight(height)
  }, [lockHeight, months, debts.length, showStart])

  useLayoutEffect(() => {
    if (!lockHeight) return
    scrollerRef.current?.scrollTo({ top: 0 })
  }, [lockHeight])

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const node = el
    function update() {
      setCanDrag(node.scrollWidth > node.clientWidth + 1)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    const inner = node.firstElementChild
    if (inner) observer.observe(inner)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [debts.length, months])

  const tipApi = useMemo(
    () => ({ enter, leave, hide: hideTip }),
    [enter, hideTip, leave],
  )
  const capped = lockHeight && bodyHeight != null

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !canDrag) return
    if (
      event.target instanceof Element &&
      event.target.closest('input, button, [data-no-drag], .sticky')
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
      hideTip()
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
    <TipContext.Provider value={tipApi}>
    <div
      ref={plannerRef}
      className={cn('planner-scroll relative', capped && 'planner-scroll-capped')}
      style={capped ? { maxHeight: bodyHeight } : undefined}
    >
      <div
        ref={scrollerRef}
        className="drag-scroll"
        data-can-drag={canDrag ? '' : undefined}
        style={capped ? { maxHeight: bodyHeight } : undefined}
        onScroll={() => {
          const el = scrollerRef.current
          setScrolled((el?.scrollLeft ?? 0) > 0)
          hideTip()
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={tableWrapRef} className="relative w-max min-w-full">
        <table className="w-max min-w-full border-separate border-spacing-0 select-none text-sm">
          <colgroup>
            <col style={{ width: MONTH_COL }} />
            <col style={{ width: LABEL_COL }} />
          </colgroup>
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="sticky top-0 left-0 z-30 bg-card pt-2 pr-3 pb-2 pl-4 font-medium">
                Month
              </th>
              <th className="sticky top-0 z-30 bg-card pt-2 pr-4 pb-2 font-medium" style={{ left: MONTH_COL }}>
                <span className="sr-only">Line</span>
              </th>
            {debts.map((debt) => (
              <th
                key={debt.id}
                className="sticky top-0 z-20 bg-card px-4 pt-2 pb-2 text-center font-medium"
              >
                <div className="flex flex-col items-center whitespace-nowrap">
                  <span>{debt.lender}</span>
                  <span className="font-normal tabular-nums">{debt.apr}%</span>
                </div>
              </th>
            ))}
            <th className="total-rule sticky top-0 z-20 bg-card pt-2 pr-4 pb-2 pl-4 text-right font-medium">
              Total
            </th>
          </tr>
          <HairlineRow
            debts={debts}
            highlighted={showExtra ? extraFlags(debts, months[0]) : debts.map(() => false)}
            sticky="sticky left-0 z-20 bg-card p-0"
          />
        </thead>
        <tbody>
          {years.length === 0 ? (
            <tr>
              <td
                colSpan={debts.length + 3}
                className="text-muted-foreground px-4 py-8 text-center text-sm"
              >
                No history yet
              </td>
            </tr>
          ) : null}
          {years.map((group, groupIndex) => (
            <YearGroupRows
              key={group.year}
              year={group.year}
              months={group.months}
              nextMonth={years[groupIndex + 1]?.months[0]}
              debts={debts}
              plan={plan}
              showStart={showStart && groupIndex === 0}
              showExtra={showExtra}
              spaced={groupIndex > 0}
              lastGroup={groupIndex === years.length - 1}
              monthAction={monthAction}
              now={now}
              editingKey={editingKey}
              onEditMonth={onEditMonth}
              onExitEdit={onExitEdit}
              onPaidChange={onPaidChange}
              onChargeChange={onChargeChange}
              onInterestChange={onInterestChange}
            />
          ))}
        </tbody>
      </table>
        {editFrame ? (
          <div
            className="month-edit-frame"
            style={{
              top: editFrame.top,
              left: editFrame.left,
              width: editFrame.width,
              height: editFrame.height,
            }}
          />
        ) : null}
        </div>
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
      {editActions &&
      editingRow &&
      monthAction === 'task' &&
      isLoggablePlannerMonth(editingRow, now)
        ? createPortal(
            <div
              data-no-drag
              data-month-edit-actions
              className="fixed z-30 flex items-center rounded-md bg-white p-1 shadow-md"
              style={{ top: editActions.top, right: editActions.right }}
            >
              <button
                type="button"
                className="hover-fill flex items-center gap-1 rounded px-2 py-1 text-sm"
                aria-label={`Log ${formatMonthName(editingRow.month)}`}
                onClick={() => onLogMonth(editingRow)}
              >
                <Check className="size-4" />
                Log
              </button>
            </div>,
            document.body,
          )
        : null}
      {tip
        ? createPortal(
            <MonthDetailTip
              tip={tip}
              onEnter={() => {
                clearHide()
              }}
              onLeave={(event) => leave(event, tip.key)}
            />,
            document.body,
          )
        : null}
    </div>
    </TipContext.Provider>
  )
}

function extraFocus(line: PlannerLine | undefined) {
  if (!line) return false
  if (line.extra > 0.005) return true
  return line.paid > 0.005 && line.balance <= 0.005 && line.start > 0.005
}

function extraFlags(
  debts: { id: string }[],
  ...rows: (PlannerMonth | undefined)[]
) {
  return debts.map((debt) =>
    rows.some((row) =>
      extraFocus(row?.lines.find((line) => line.debtId === debt.id)),
    ),
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
  nextMonth,
  debts,
  plan,
  showStart,
  showExtra = true,
  spaced,
  lastGroup,
  monthAction,
  now,
  editingKey,
  onEditMonth,
  onExitEdit,
  onPaidChange,
  onChargeChange,
  onInterestChange,
}: {
  year: number
  months: PlannerMonth[]
  nextMonth?: PlannerMonth
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  showStart: boolean
  showExtra?: boolean
  spaced: boolean
  lastGroup: boolean
  monthAction: 'task' | 'pencil'
  now: Date
  editingKey: string | null
  onEditMonth: (row: PlannerMonth) => void
  onExitEdit: () => void
  onPaidChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
  onChargeChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
  onInterestChange: (
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
              'text-muted-foreground sticky left-0 z-10 bg-card pl-4 text-xs font-medium',
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
          nextRow={
            index + 1 < months.length ? months[index + 1] : nextMonth
          }
          showStart={showStart && index === 0}
          showExtra={showExtra}
          last={lastGroup && index === months.length - 1}
          monthAction={monthAction}
          now={now}
          editing={editingKey === monthKey(row.year, row.month)}
          onEditMonth={onEditMonth}
          onExitEdit={onExitEdit}
          onPaidChange={onPaidChange}
          onChargeChange={onChargeChange}
          onInterestChange={onInterestChange}
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
  nextRow,
  showStart,
  showExtra = true,
  last,
  monthAction,
  now,
  editing,
  onEditMonth,
  onExitEdit,
  onPaidChange,
  onChargeChange,
  onInterestChange,
}: {
  year: number
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  row: PlannerMonth
  nextRow?: PlannerMonth
  showStart: boolean
  showExtra?: boolean
  last: boolean
  monthAction: 'task' | 'pencil'
  now: Date
  editing: boolean
  onEditMonth: (row: PlannerMonth) => void
  onExitEdit: () => void
  onPaidChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
  onChargeChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
  onInterestChange: (
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
    return showExtra && extraFocus(paidById.get(debtId))
  }

  function paidOff(debtId: string) {
    const line = paidById.get(debtId)
    return (line?.paid ?? 0) > 0.005 && (line?.balance ?? 0) <= 0.005
  }

  return (
    <>
      {showStart ? (
        <>
          <tr>
            <td className="text-muted-foreground sticky left-0 z-10 bg-card py-1.5 pr-3 pl-4 text-xs font-medium">
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
            <td className="total-rule py-1.5 pr-4 pl-4 text-right tabular-nums">
              {plannerUsd(startTotal)}
            </td>
          </tr>
          <HairlineRow
            debts={debts}
            highlighted={showExtra ? extraFlags(debts, row) : debts.map(() => false)}
          />
        </>
      ) : null}
      <tr className={cn(editing && 'month-edit-row')}>
        <MonthCell
          label={label}
          rowSpan={editing ? 4 : 2}
          action={
            monthAction === 'task' && !isLoggablePlannerMonth(row, now)
              ? null
              : monthAction
          }
          editing={editing}
          onEdit={() => onEditMonth(row)}
          onExit={onExitEdit}
        />
        {editing ? (
          <>
            <LabelCell>Interest</LabelCell>
            {debts.map((debt) => {
              const line = paidById.get(debt.id)
              return (
                <PaidCell
                  key={`${debt.id}-interest`}
                  debtId={debt.id}
                  field="interest"
                  value={line?.interest ?? 0}
                  detailKey={`${row.year}-${row.month}-${debt.id}`}
                  detail={line}
                  overridden={
                    interestOverride(plan, debt.id, row.year, row.month) != null
                  }
                  onCommit={(next) => {
                    onInterestChange(row.year, row.month, debt.id, next)
                  }}
                />
              )
            })}
            <td className="total-rule py-1.5 pr-4 pl-4 text-right tabular-nums">
              {plannerUsd(row.totalInterest)}
            </td>
          </>
        ) : (
          <>
            <LabelCell>Paid</LabelCell>
            {debts.map((debt) => {
              const line = paidById.get(debt.id)
              return (
                <AmountCell
                  key={`${debt.id}-paid`}
                  value={line?.paid ?? 0}
                  detailKey={`${row.year}-${row.month}-${debt.id}`}
                  detail={line}
                  muted={extraOn(debt.id)}
                  faint={!extraOn(debt.id)}
                  highlighted={extraOn(debt.id)}
                />
              )
            })}
            <td className="total-rule text-muted-foreground py-1.5 pr-4 pl-4 text-right tabular-nums">
              {plannerUsd(row.totalPaid)}
            </td>
          </>
        )}
      </tr>
      {editing ? (
        <>
          <tr className="month-edit-row">
            <LabelCell>Charged</LabelCell>
            {debts.map((debt) => {
              const line = paidById.get(debt.id)
              return (
                <PaidCell
                  key={`${debt.id}-charged`}
                  debtId={debt.id}
                  field="charged"
                  value={line?.charged ?? 0}
                  detailKey={`${row.year}-${row.month}-${debt.id}`}
                  detail={line}
                  overridden={
                    chargeOverride(plan, debt.id, row.year, row.month) != null
                  }
                  muted
                  onCommit={(next) => {
                    onChargeChange(row.year, row.month, debt.id, next)
                  }}
                />
              )
            })}
            <td className="total-rule text-muted-foreground py-1.5 pr-4 pl-4 text-right tabular-nums">
              {plannerUsd(
                row.lines.reduce((sum, line) => sum + line.charged, 0),
              )}
            </td>
          </tr>
          <tr className="month-edit-row">
            <LabelCell>Paid</LabelCell>
            {debts.map((debt) => {
              const line = paidById.get(debt.id)
              return (
                <PaidCell
                  key={`${debt.id}-paid`}
                  debtId={debt.id}
                  field="paid"
                  value={line?.paid ?? 0}
                  detailKey={`${row.year}-${row.month}-${debt.id}`}
                  detail={line}
                  overridden={
                    paymentOverride(plan, debt.id, row.year, row.month) != null
                  }
                  onCommit={(next) => {
                    onPaidChange(row.year, row.month, debt.id, next)
                  }}
                />
              )
            })}
            <td className="total-rule py-1.5 pr-4 pl-4 text-right tabular-nums">
              {plannerUsd(row.totalPaid)}
            </td>
          </tr>
        </>
      ) : null}
      <tr className={cn(editing && 'month-edit-row')}>
        <LabelCell>End</LabelCell>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const balance = line?.balance ?? 0
          return (
            <AmountCell
              key={`${debt.id}-bal`}
              value={balance}
              detailKey={`${row.year}-${row.month}-${debt.id}`}
              detail={line}
              showZero={paidOff(debt.id)}
              highlighted={!editing && extraOn(debt.id)}
              faint={editing}
            />
          )
        })}
        <td
          className={cn(
            'total-rule py-1.5 pr-4 pl-4 text-right tabular-nums',
            editing ? 'text-muted-foreground/40' : 'font-medium',
          )}
        >
          {plannerUsd(
            row.remainingTotal,
            row.remainingTotal <= 0.005 && row.totalPaid > 0.005,
          )}
        </td>
      </tr>
      {last ? null : (
        <HairlineRow
          debts={debts}
          highlighted={
            showExtra ? extraFlags(debts, row, nextRow) : debts.map(() => false)
          }
        />
      )}
    </>
  )
}

function HairlineRow({
  debts,
  highlighted,
  sticky = 'sticky left-0 z-10 bg-card p-0',
}: {
  debts: { id: string }[]
  highlighted: boolean[]
  sticky?: string
}) {
  return (
    <tr>
      <td colSpan={2} className={sticky}>
        <div className="bg-border h-px" />
      </td>
      {debts.map((debt, index) => (
        <td key={debt.id} className="p-0">
          <div
            className={cn('h-px', highlighted[index] ? EXTRA_LINE : 'bg-border')}
          />
        </td>
      ))}
      <td className="total-rule p-0">
        <div className="bg-border h-px" />
      </td>
    </tr>
  )
}

function plannerUsd(value: number, showZero = false) {
  if (Math.round(value) !== 0) return formatUsdWhole(value)
  return showZero ? formatUsdWhole(0) : ''
}

function formatMonthName(month: number) {
  return new Date(2026, month, 1).toLocaleDateString('en-US', {
    month: 'short',
  })
}

function TaskAltIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M22 5.18 10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zm-2.21 5.04C19.92 10.79 20 11.39 20 12c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8c1.58 0 3.04.46 4.28 1.25l1.44-1.44C16.1 2.67 14.13 2 12 2 6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-1.19-.22-2.33-.6-3.39z" />
    </svg>
  )
}

function MonthCell({
  label,
  rowSpan,
  action,
  editing = false,
  onEdit,
  onExit,
}: {
  label: string
  rowSpan: number
  action: 'task' | 'pencil' | null
  editing?: boolean
  onEdit?: () => void
  onExit?: () => void
}) {
  return (
    <td
      rowSpan={rowSpan}
      className={cn(
        'month-label sticky left-0 z-10 bg-card py-1.5 pr-3 pl-4 align-top font-medium whitespace-nowrap',
        editing && 'month-editing',
      )}
    >
      <div className="flex flex-col items-start gap-1">
        <span>{label}</span>
        {action ? (
          <button
            type="button"
            data-no-drag
            className="text-muted-foreground hover:text-foreground flex size-5 items-center justify-center"
            aria-label={
              action === 'pencil'
                ? `Edit ${label}`
                : editing
                  ? `Done editing ${label}`
                  : `Edit ${label}`
            }
            aria-pressed={editing}
            onClick={(event) => {
              event.stopPropagation()
              if (editing) onExit?.()
              else onEdit?.()
            }}
          >
            {action === 'pencil' ? (
              <Pencil className="size-3.5" />
            ) : (
              <TaskAltIcon className="size-4" />
            )}
          </button>
        ) : null}
      </div>
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

function extraTone(highlighted: boolean, muted: boolean, faint: boolean) {
  if (!highlighted) {
    return cn(
      muted && 'text-muted-foreground',
      faint && 'text-muted-foreground/40',
    )
  }
  return muted || faint ? EXTRA_LIGHT : EXTRA_DARK
}

function AmountCell({
  value,
  muted = false,
  faint = false,
  highlighted = false,
  showZero = false,
  detailKey,
  detail,
}: {
  value: number
  muted?: boolean
  faint?: boolean
  highlighted?: boolean
  showZero?: boolean
  detailKey?: string
  detail?: PlannerLine
}) {
  const tip = useContext(TipContext)
  return (
    <td
      data-debt-tip={detailKey}
      className={cn(
        'min-w-24 px-4 py-1.5 text-right tabular-nums',
        extraTone(highlighted, muted, faint),
        highlighted && EXTRA_FILL,
      )}
      onPointerEnter={(event) => {
        if (!detailKey || !detail) return
        tip.enter(detailKey, detail, event.currentTarget)
      }}
      onPointerLeave={(event) => {
        if (!detailKey) return
        tip.leave(event, detailKey)
      }}
    >
      {plannerUsd(value, showZero)}
    </td>
  )
}

function PaidCell({
  debtId,
  field = 'paid',
  value,
  overridden,
  muted = false,
  faint = false,
  highlighted = false,
  detailKey,
  detail,
  onCommit,
}: {
  debtId: string
  field?: 'paid' | 'charged' | 'interest'
  value: number
  overridden: boolean
  muted?: boolean
  faint?: boolean
  highlighted?: boolean
  detailKey?: string
  detail?: PlannerLine
  onCommit: (amount: number | null) => void
}) {
  const display = plannerUsd(value)
  const tip = useContext(TipContext)

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
      data-debt-tip={detailKey}
      className={cn(
        'min-w-24 px-4 py-1.5 text-right tabular-nums',
        extraTone(highlighted, muted, faint),
        highlighted && EXTRA_FILL,
      )}
      onPointerEnter={(event) => {
        if (!detailKey || !detail) return
        tip.enter(detailKey, detail, event.currentTarget)
      }}
      onPointerLeave={(event) => {
        if (!detailKey) return
        tip.leave(event, detailKey)
      }}
    >
      <input
        key={`${overridden ? 'o' : 'c'}-${Math.round(value)}`}
        data-no-drag
        data-debt-id={debtId}
        data-field={field}
        data-committed={Math.round(value)}
        draggable={false}
        size={1}
        className="paid-input paid-input-boxed select-text"
        inputMode="decimal"
        aria-label={
          field === 'charged'
            ? 'Charged'
            : field === 'interest'
              ? 'Interest'
              : 'Paid'
        }
        defaultValue={display}
        onFocus={(event) => {
          tip.hide()
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
        onDragStart={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'none'
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      />
    </td>
  )
}

function MonthDetailTip({
  tip,
  onEnter,
  onLeave,
}: {
  tip: MonthTip
  onEnter: () => void
  onLeave: (event: PointerEvent<HTMLElement>) => void
}) {
  const rows = [
    ['Paid', tip.line.paid],
    ['Interest', tip.line.interest],
    ['Charged', tip.line.charged],
    ['End', tip.line.balance],
  ] as const

  return (
    <div
      data-debt-tip-pop
      className="pointer-events-auto fixed z-50 rounded-lg bg-white px-3 py-2 text-sm shadow-md ring-1 ring-foreground/10"
      style={{ top: tip.top, left: tip.left }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <div className="grid grid-cols-[auto_auto] items-baseline gap-x-5 gap-y-1">
        {rows.map(([label, amount]) => (
          <div key={label} className="contents">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="text-right tabular-nums">
              {formatUsdWhole(amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function parseUsdInput(raw: string) {
  const parsed = Number(raw.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

function applyFocusedPaidInput(plan: DebtPlanState, row: PlannerMonth) {
  const focused = document.activeElement
  if (
    !(focused instanceof HTMLInputElement) ||
    !focused.classList.contains('paid-input') ||
    !focused.dataset.debtId
  ) {
    return { plan, row }
  }
  const field = focused.dataset.field
  if (field !== 'interest' && field !== 'charged' && field !== 'paid') {
    return { plan, row }
  }
  const typed = field as PlannerValueField
  const raw = focused.value.trim()
  const amount = raw === '' ? null : parseUsdInput(raw)
  focused.blur()
  return {
    plan: applyPlannerMonthValue(
      plan,
      row.year,
      row.month,
      focused.dataset.debtId,
      typed,
      amount,
    ),
    row: monthWithLineValue(row, focused.dataset.debtId, typed, amount),
  }
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100
}
