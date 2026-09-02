import {
  loadBudget,
  markBudgetSeedsApplied,
  parseBudgetState,
  saveBudget,
  type BudgetState,
  type Debt,
} from '@/lib/budget'
import {
  loadDebtPlan,
  markPlanMigrationsApplied,
  parseDebtPlan,
  saveDebtPlan,
  type DebtPlanState,
} from '@/lib/debt-plan'
import {
  APP_STATE_PAY_DATE,
  fetchPaystubDataByDate,
  upsertPaystubRecord,
} from '@/lib/paystub'
import { seededDebtBalances } from '@/lib/debt-plan-seed'
import {
  emptySpending,
  loadSpending,
  mergeSpending,
  parseSpendingState,
  saveSpending,
  type SpendingState,
} from '@/lib/spending'
import { supabase } from '@/lib/supabase'

export type UserAppState = {
  budget: BudgetState
  plan: DebtPlanState
  spending: SpendingState
}

type RemoteRow = {
  budget?: unknown
  plan?: unknown
  spending?: unknown
}

type AppStatePaystubData = {
  id?: string
  appState?: unknown
  budget?: unknown
  plan?: unknown
  spending?: unknown
}

let cache: UserAppState | null = null
let ready = false
let inflight: Promise<UserAppState> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null

async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function localAppState(): UserAppState {
  return {
    budget: cache?.budget ?? loadBudget(),
    plan: cache?.plan ?? loadDebtPlan(),
    spending: cache?.spending ?? loadSpending(),
  }
}

export function rememberBudget(budget: BudgetState) {
  cache = { ...localAppState(), budget }
}

export function rememberPlan(plan: DebtPlanState) {
  cache = { ...localAppState(), plan }
}

export function rememberSpending(spending: SpendingState) {
  cache = { ...localAppState(), spending }
}

export function markCloudReady() {
  ready = true
  scheduleUserAppStatePush()
}

export function resetUserAppStateSync() {
  cache = null
  ready = false
  inflight = null
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
}

function parseRemoteAppState(row: RemoteRow | null | undefined): UserAppState | null {
  if (!row) return null
  const budget = parseBudgetState(row.budget)
  const planValue = row.plan
  const hasPlan =
    planValue != null &&
    typeof planValue === 'object' &&
    Array.isArray((planValue as { affirmLoans?: unknown }).affirmLoans)
  const plan = hasPlan ? parseDebtPlan(planValue) : null
  const spending = parseSpendingState(row.spending)
  if (!budget && !plan && !spending) return null
  return {
    budget: budget ?? loadBudget(),
    plan: plan ?? loadDebtPlan(),
    spending: spending ?? emptySpending(),
  }
}

function isMissingTable(error: { code?: string; message: string }) {
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|schema cache|does not exist/i.test(error.message)
  )
}

async function fetchDedicatedAppState(): Promise<UserAppState | null> {
  if (!supabase) return null
  try {
    const userId = await currentUserId()
    if (!userId) return null
    const { data, error } = await supabase
      .from('user_app_state')
      .select('budget, plan')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      if (!isMissingTable(error)) console.error(error.message)
      return null
    }
    return parseRemoteAppState(data as RemoteRow | null)
  } catch {
    return null
  }
}

async function fetchPaystubAppState(): Promise<UserAppState | null> {
  const payload = (await fetchPaystubDataByDate(APP_STATE_PAY_DATE)) as
    | AppStatePaystubData
    | null
  return parseRemoteAppState(payload)
}

async function fetchUserAppState(): Promise<UserAppState | null> {
  const dedicated = await fetchDedicatedAppState()
  const fromPaystub = await fetchPaystubAppState()
  if (!dedicated && !fromPaystub) return null
  if (!dedicated) return fromPaystub
  if (!fromPaystub) return dedicated
  return {
    budget: dedicated.budget,
    plan: dedicated.plan,
    spending: mergeSpending(dedicated.spending, fromPaystub.spending),
  }
}

async function upsertDedicatedAppState(state: UserAppState) {
  if (!supabase) return
  try {
    const userId = await currentUserId()
    if (!userId) return
    const { error } = await supabase.from('user_app_state').upsert(
      {
        user_id: userId,
        budget: state.budget,
        plan: state.plan,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (error && !isMissingTable(error)) console.error(error.message)
  } catch {
    // Table is optional; paystubs row is the working store.
  }
}

async function upsertPaystubAppState(state: UserAppState) {
  const existing = (await fetchPaystubDataByDate(APP_STATE_PAY_DATE)) as
    | AppStatePaystubData
    | null
  const id =
    typeof existing?.id === 'string' && existing.id
      ? existing.id
      : crypto.randomUUID()
  await upsertPaystubRecord(id, APP_STATE_PAY_DATE, {
    id,
    fileName: '__app_state__',
    uploadedAt: new Date().toISOString(),
    payDate: APP_STATE_PAY_DATE,
    earnings: [],
    deductions: [],
    grossPay: 0,
    netPay: 0,
    appState: true,
    budget: state.budget,
    plan: state.plan,
    spending: state.spending,
  })
}

async function upsertUserAppState(state: UserAppState) {
  await upsertPaystubAppState(state)
  await upsertDedicatedAppState(state)
}

function applyLocal(state: UserAppState) {
  saveBudget(state.budget)
  saveDebtPlan(state.plan)
  saveSpending(state.spending)
  markBudgetSeedsApplied()
  markPlanMigrationsApplied()
  cache = state
}

function monthMapFilled(month: Record<string, number> | undefined) {
  if (!month) return 0
  return Object.values(month).filter((value) => Math.abs(value) > 0.005).length
}

function mergeMonthMaps(
  left: Record<string, Record<string, number>>,
  right: Record<string, Record<string, number>>,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  const merged: Record<string, Record<string, number>> = {}
  for (const key of keys) {
    const a = left[key]
    const b = right[key]
    if (!a) merged[key] = b
    else if (!b) merged[key] = a
    else merged[key] = monthMapFilled(b) >= monthMapFilled(a) ? b : a
  }
  return merged
}

function almostEqual(left: number, right: number) {
  return Math.abs(left - right) <= 0.005
}

function isSeedBalance(debt: Debt) {
  const seed = seededDebtBalances[debt.id]
  return typeof seed === 'number' && almostEqual(debt.balance, seed)
}

function mergeDebtPair(
  remote: Debt,
  local: Debt,
  prefer: 'local' | 'remote',
): Debt {
  if (remote.balance <= 0.005 && local.balance > 0.005) return local
  if (local.balance <= 0.005 && remote.balance > 0.005) {
    return prefer === 'local' ? { ...local, balance: remote.balance } : remote
  }
  if (prefer === 'local') {
    if (isSeedBalance(local) && !isSeedBalance(remote)) return remote
    return local
  }
  if (isSeedBalance(remote) && !isSeedBalance(local)) return local
  return remote
}

function mergeDebts(
  remote: Debt[],
  local: Debt[],
  prefer: 'local' | 'remote',
) {
  const remoteById = new Map(remote.map((debt) => [debt.id, debt]))
  const localById = new Map(local.map((debt) => [debt.id, debt]))
  const ordered = prefer === 'local' ? [...local, ...remote] : [...remote, ...local]
  const seen = new Set<string>()
  const merged: Debt[] = []
  for (const debt of ordered) {
    if (seen.has(debt.id)) continue
    seen.add(debt.id)
    const fromRemote = remoteById.get(debt.id)
    const fromLocal = localById.get(debt.id)
    if (fromRemote && fromLocal) {
      merged.push(mergeDebtPair(fromRemote, fromLocal, prefer))
    } else {
      merged.push(fromRemote ?? fromLocal ?? debt)
    }
  }
  return merged
}

function stampTime(value: string | undefined) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function mergeBudgets(remote: BudgetState, local: BudgetState): BudgetState {
  const remoteAt = stampTime(remote.updatedAt)
  const localAt = stampTime(local.updatedAt)
  if (localAt > remoteAt) {
    return {
      ...local,
      debts: mergeDebts(remote.debts, local.debts, 'local'),
    }
  }
  if (remoteAt > localAt) {
    return {
      ...remote,
      debts: mergeDebts(remote.debts, local.debts, 'remote'),
    }
  }
  const remoteExpenses = remote.expenses.length
  const localExpenses = local.expenses.length
  return {
    accounts:
      remote.accounts.length >= local.accounts.length
        ? remote.accounts
        : local.accounts,
    expenses: remoteExpenses >= localExpenses ? remote.expenses : local.expenses,
    debts: mergeDebts(remote.debts, local.debts, 'local'),
    categories:
      remote.categories.length >= local.categories.length
        ? remote.categories
        : local.categories,
    updatedAt: local.updatedAt ?? remote.updatedAt,
  }
}

export function mergePlans(remote: DebtPlanState, local: DebtPlanState): DebtPlanState {
  const loggedMonths = [
    ...new Set([...(remote.loggedMonths ?? []), ...(local.loggedMonths ?? [])]),
  ].sort()
  return {
    ...remote,
    customOrder:
      remote.customOrder.length > 0 ? remote.customOrder : local.customOrder,
    affirmLoans:
      remote.affirmLoans.length >= local.affirmLoans.length
        ? remote.affirmLoans
        : local.affirmLoans,
    loggedMonths,
    loggedHistory: {
      ...(remote.loggedHistory ?? {}),
      ...(local.loggedHistory ?? {}),
    },
    paymentsByMonth: mergeMonthMaps(
      remote.paymentsByMonth,
      local.paymentsByMonth,
    ),
    chargesByMonth: mergeMonthMaps(remote.chargesByMonth, local.chargesByMonth),
    interestByMonth: mergeMonthMaps(
      remote.interestByMonth,
      local.interestByMonth,
    ),
    recurringCharges:
      Object.keys(remote.recurringCharges).length >=
      Object.keys(local.recurringCharges).length
        ? remote.recurringCharges
        : local.recurringCharges,
  }
}

function mergeAppState(remote: UserAppState, local: UserAppState): UserAppState {
  return {
    budget: mergeBudgets(remote.budget, local.budget),
    plan: mergePlans(remote.plan, local.plan),
    spending: mergeSpending(remote.spending, local.spending),
  }
}

export function syncUserAppStateFromCloud() {
  if (!inflight) {
    inflight = (async () => {
      const remote = await fetchUserAppState()
      const local = localAppState()
      if (remote) {
        const merged = mergeAppState(remote, local)
        applyLocal(merged)
        await upsertUserAppState(merged)
        return merged
      }
      applyLocal(local)
      await upsertUserAppState(local)
      return local
    })()
  }
  return inflight
}

export function scheduleUserAppStatePush() {
  if (!ready || !supabase) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void upsertUserAppState(localAppState())
  }, 400)
}
