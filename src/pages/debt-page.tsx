import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ListTodo, Menu, Undo2 } from 'lucide-react'

import { CardGearButton, EditDebtsDialog } from '@/components/budget-cards'
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
import { paymentWithoutCharges, type Debt } from '@/lib/budget'
import { useBudget } from '@/lib/budget-context'
import {
  PAYOFF_STRATEGIES,
  affirmTotals,
  debtFreeLabel,
  formatYm,
  loadDebtPlan,
  historyRows,
  logPlannerMonth,
  monthKey,
  monthsUntilPayoff,
  paymentOverride,
  plannedInterest,
  plannerRows,
  projectDebtPlan,
  resolveCustomOrder,
  saveDebtPlan,
  setMonthPayment,
  strategyDebtOrder,
  strategyLabel,
  withLiveMonthlyBudget,
  type DebtPlanState,
  type PayoffStrategy,
  type PlannerLine,
  type PlannerMonth,
} from '@/lib/debt-plan'
import { formatUsd, formatUsdWhole } from '@/lib/format'
import { currentMonthNet } from '@/lib/income'
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
  const [plan, setPlan] = useState<DebtPlanState>(() => loadDebtPlan())
  const now = useMemo(() => new Date(), [])
  const monthlyNet = useMemo(
    () => Math.round(currentMonthNet(paystubs)),
    [paystubs],
  )

  const planForMath = useMemo(
    () => withLiveMonthlyBudget(plan, debts, expenses, monthlyNet),
    [plan, debts, expenses, monthlyNet],
  )

  useEffect(() => {
    saveDebtPlan(planForMath)
  }, [planForMath])
  const months = useMemo(
    () => projectDebtPlan(debts, planForMath, expenses, PLAN_HORIZON, now),
    [debts, expenses, planForMath, now],
  )
  const affirm = affirmTotals(plan.affirmLoans)
  const upcoming = plannerRows(months, plan, now)
  const history = historyRows(months, plan, now)
  const freeOn = debtFreeLabel(months)
  const interestPaid = plannedInterest(upcoming)

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <h1 className="font-heading text-3xl font-medium">
        Debt payoff planner
      </h1>

        <PlannerCard
          debts={debts}
          plan={plan}
          freeOn={freeOn}
          interestPaid={interestPaid}
          history={history}
          upcoming={upcoming}
          onPlanChange={setPlan}
        />

        <AffirmCard loans={plan.affirmLoans} totals={affirm} />
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

function PlannerCard({
  debts,
  plan,
  freeOn,
  interestPaid,
  history,
  upcoming,
  onPlanChange,
}: {
  debts: Debt[]
  plan: DebtPlanState
  freeOn: string
  interestPaid: number
  history: PlannerMonth[]
  upcoming: PlannerMonth[]
  onPlanChange: (plan: DebtPlanState) => void
}) {
  const [view, setView] = useState<PlannerView>('planner')
  const [customOpen, setCustomOpen] = useState(false)
  const [debtsOpen, setDebtsOpen] = useState(false)
  const [undoStack, setUndoStack] = useState<DebtPlanState[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const columns = useMemo(() => strategyDebtOrder(debts, plan), [debts, plan])
  const rows = view === 'planner' ? upcoming : [...history].reverse()

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
    if (strategy === 'custom') {
      const customOrder =
        plan.customOrder.length > 0
          ? resolveCustomOrder(
              debts.map((debt) => debt.id),
              plan.customOrder,
            )
          : strategyDebtOrder(debts, plan).map((debt) => debt.id)
      changePlan({ ...plan, strategy, customOrder })
      return
    }
    changePlan({ ...plan, strategy })
  }

  return (
    <>
      <Card className="pb-1">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-8">
            <HeaderStat label="Debt-free" value={freeOn} />
            <HeaderStat
              label="Interest paid"
              value={formatUsdWhole(interestPaid)}
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="hover-fill flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm disabled:pointer-events-none disabled:opacity-40"
              disabled={undoStack.length === 0}
              aria-keyshortcuts="Control+Z Meta+Z"
              onClick={undoPlan}
            >
              <Undo2 className="size-3.5" />
              Undo
            </button>
            {plan.strategy === 'custom' ? (
              <button
                type="button"
                className="hover-fill rounded-lg px-3 py-1.5 text-sm"
                onClick={() => setCustomOpen(true)}
              >
                Edit
              </button>
            ) : null}
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
          showStart={view === 'planner'}
          showLog={view === 'planner'}
          editingKey={editingKey}
          onEditMonth={(row) => setEditingKey(monthKey(row.year, row.month))}
          onSaveMonth={(row) => {
            const focused = document.activeElement
            const overrides: Record<string, number | null> = {}
            if (
              focused instanceof HTMLInputElement &&
              focused.classList.contains('paid-input') &&
              focused.dataset.debtId
            ) {
              const raw = focused.value.trim()
              overrides[focused.dataset.debtId] =
                raw === '' ? null : parseUsdInput(raw)
              focused.blur()
            }
            changePlan(
              logPlannerMonth(
                plan,
                row,
                Object.keys(overrides).length > 0 ? overrides : undefined,
              ),
            )
            setEditingKey(null)
          }}
          onPaidChange={(year, month, debtId, amount) => {
            changePlan(setMonthPayment(plan, year, month, debtId, amount))
          }}
        />
      </CardContent>
      <CustomOrderDialog
        open={customOpen}
        debts={debts}
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
  showStart,
  showLog,
  editingKey,
  onEditMonth,
  onSaveMonth,
  onPaidChange,
}: {
  debts: { id: string; lender: string; apr: number }[]
  plan: DebtPlanState
  months: PlannerMonth[]
  showStart: boolean
  showLog: boolean
  editingKey: string | null
  onEditMonth: (row: PlannerMonth) => void
  onSaveMonth: (row: PlannerMonth) => void
  onPaidChange: (
    year: number,
    month: number,
    debtId: string,
    amount: number | null,
  ) => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
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
        if (drag.current.moved) return
        shownKeyRef.current = key
        setTip({ key, line, ...tipPosition(el) })
      }, TIP_DELAY_MS)
      pendingRef.current = { key, timer }
    },
    [clearHide, clearPending, hideTip],
  )

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

  const tipApi = useMemo(
    () => ({ enter, leave, hide: hideTip }),
    [enter, hideTip, leave],
  )

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
    <div className="planner-scroll relative">
      <div
        ref={scrollerRef}
        className="drag-scroll"
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
        <table className="w-max min-w-full border-separate border-spacing-0 select-none text-sm">
          <colgroup>
            <col style={{ width: MONTH_COL }} />
            <col style={{ width: LABEL_COL }} />
          </colgroup>
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="sticky left-0 z-20 bg-card pt-2 pr-3 pb-2 pl-4 font-medium">
                Month
              </th>
              <th className="sticky z-20 bg-card pt-2 pr-4 pb-2 font-medium" style={{ left: MONTH_COL }}>
                <span className="sr-only">Line</span>
              </th>
            {debts.map((debt) => (
              <th
                key={debt.id}
                className="px-5 pt-2 pb-2 text-center font-medium"
              >
                <div className="flex flex-col items-center whitespace-nowrap">
                  <span>{debt.lender}</span>
                  <span className="font-normal tabular-nums">{debt.apr}%</span>
                </div>
              </th>
            ))}
            <th className="total-rule pt-2 pr-4 pb-2 pl-5 text-right font-medium">
              Total
            </th>
          </tr>
          <HairlineRow
            debts={debts}
            highlighted={extraFlags(debts, months[0])}
            sticky="sticky left-0 z-20 bg-card p-0"
          />
        </thead>
        <tbody>
          {years.map((group, groupIndex) => (
            <YearGroupRows
              key={group.year}
              year={group.year}
              months={group.months}
              nextMonth={years[groupIndex + 1]?.months[0]}
              debts={debts}
              plan={plan}
              showStart={showStart && groupIndex === 0}
              spaced={groupIndex > 0}
              lastGroup={groupIndex === years.length - 1}
              showLog={showLog}
              editingKey={editingKey}
              onEditMonth={onEditMonth}
              onSaveMonth={onSaveMonth}
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
  spaced,
  lastGroup,
  showLog,
  editingKey,
  onEditMonth,
  onSaveMonth,
  onPaidChange,
}: {
  year: number
  months: PlannerMonth[]
  nextMonth?: PlannerMonth
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  showStart: boolean
  spaced: boolean
  lastGroup: boolean
  showLog: boolean
  editingKey: string | null
  onEditMonth: (row: PlannerMonth) => void
  onSaveMonth: (row: PlannerMonth) => void
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
          last={lastGroup && index === months.length - 1}
          showLog={showLog}
          editing={editingKey === monthKey(row.year, row.month)}
          onEditMonth={onEditMonth}
          onSaveMonth={onSaveMonth}
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
  nextRow,
  showStart,
  last,
  showLog,
  editing,
  onEditMonth,
  onSaveMonth,
  onPaidChange,
}: {
  year: number
  debts: { id: string; lender: string }[]
  plan: DebtPlanState
  row: PlannerMonth
  nextRow?: PlannerMonth
  showStart: boolean
  last: boolean
  showLog: boolean
  editing: boolean
  onEditMonth: (row: PlannerMonth) => void
  onSaveMonth: (row: PlannerMonth) => void
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
    return extraFocus(paidById.get(debtId))
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
            <td className="total-rule py-1.5 pr-4 pl-5 text-right tabular-nums">
              {plannerUsd(startTotal)}
            </td>
          </tr>
          <HairlineRow
            debts={debts}
            highlighted={extraFlags(debts, row)}
          />
        </>
      ) : null}
      <tr>
        <MonthCell
          label={label}
          rowSpan={2}
          showLog={showLog}
          editing={editing}
          onEdit={() => onEditMonth(row)}
          onSave={() => onSaveMonth(row)}
        />
        <LabelCell>Paid</LabelCell>
        {debts.map((debt) => {
          const line = paidById.get(debt.id)
          const amount = line?.paid ?? 0
          if (editing) {
            return (
              <PaidCell
                key={`${debt.id}-paid`}
                debtId={debt.id}
                value={amount}
                detailKey={`${row.year}-${row.month}-${debt.id}`}
                detail={line}
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
              detailKey={`${row.year}-${row.month}-${debt.id}`}
              detail={line}
              muted={extraOn(debt.id)}
              faint={!extraOn(debt.id)}
              highlighted={extraOn(debt.id)}
            />
          )
        })}
        <td className="total-rule text-muted-foreground py-1.5 pr-4 pl-5 text-right tabular-nums">
          {plannerUsd(row.totalPaid)}
        </td>
      </tr>
      <tr>
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
              highlighted={extraOn(debt.id)}
            />
          )
        })}
        <td className="total-rule py-1.5 pr-4 pl-5 text-right font-medium tabular-nums">
          {plannerUsd(
            row.remainingTotal,
            row.remainingTotal <= 0.005 && row.totalPaid > 0.005,
          )}
        </td>
      </tr>
      {last ? null : (
        <HairlineRow
          debts={debts}
          highlighted={extraFlags(debts, row, nextRow)}
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

function MonthCell({
  label,
  rowSpan,
  showLog = false,
  editing = false,
  onEdit,
  onSave,
}: {
  label: string
  rowSpan: number
  showLog?: boolean
  editing?: boolean
  onEdit?: () => void
  onSave?: () => void
}) {
  return (
    <td
      rowSpan={rowSpan}
      className={cn(
        'month-label sticky left-0 z-10 bg-card py-1.5 pr-3 align-top font-medium whitespace-nowrap',
        showLog ? 'pl-2' : 'pl-4',
        editing && 'month-editing',
      )}
    >
      {showLog ? (
        <div className="flex items-start gap-1">
          <button
            type="button"
            data-no-drag
            className="month-log-btn text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md"
            aria-label={editing ? `Save ${label}` : `Log ${label}`}
            onClick={(event) => {
              event.stopPropagation()
              if (editing) onSave?.()
              else onEdit?.()
            }}
          >
            {editing ? (
              <Check className="size-3.5" />
            ) : (
              <ListTodo className="size-3.5" />
            )}
          </button>
          <span className="pt-0.5">{label}</span>
        </div>
      ) : (
        label
      )}
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
        'min-w-24 px-5 py-1.5 text-right tabular-nums',
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
        'min-w-24 px-5 py-1.5 text-right tabular-nums',
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
        data-committed={Math.round(value)}
        draggable={false}
        size={1}
        className="paid-input paid-input-boxed select-text"
        inputMode="decimal"
        aria-label="Paid"
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
