import {
  loadBudget,
  markBudgetSeedsApplied,
  parseBudgetState,
  saveBudget,
  type BudgetState,
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
import { supabase } from '@/lib/supabase'

export type UserAppState = {
  budget: BudgetState
  plan: DebtPlanState
}

type RemoteRow = {
  budget?: unknown
  plan?: unknown
}

type AppStatePaystubData = {
  id?: string
  appState?: unknown
  budget?: unknown
  plan?: unknown
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
  }
}

export function rememberBudget(budget: BudgetState) {
  cache = { ...localAppState(), budget }
}

export function rememberPlan(plan: DebtPlanState) {
  cache = { ...localAppState(), plan }
}

export function markCloudReady() {
  ready = true
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
  if (!budget && !plan) return null
  return {
    budget: budget ?? loadBudget(),
    plan: plan ?? loadDebtPlan(),
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
  if (dedicated) return dedicated
  return fetchPaystubAppState()
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
  })
}

async function upsertUserAppState(state: UserAppState) {
  await upsertPaystubAppState(state)
  await upsertDedicatedAppState(state)
}

function applyLocal(state: UserAppState) {
  saveBudget(state.budget)
  saveDebtPlan(state.plan)
  markBudgetSeedsApplied()
  markPlanMigrationsApplied()
  cache = state
}

export function syncUserAppStateFromCloud() {
  if (!inflight) {
    inflight = (async () => {
      const remote = await fetchUserAppState()
      if (remote) {
        applyLocal(remote)
        await upsertPaystubAppState(remote)
        return remote
      }
      const local = localAppState()
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
