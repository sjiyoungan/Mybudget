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
import { supabase } from '@/lib/supabase'

export type UserAppState = {
  budget: BudgetState
  plan: DebtPlanState
}

type RemoteRow = {
  budget: unknown
  plan: unknown
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

async function fetchUserAppState(): Promise<UserAppState | null> {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) return null
  const { data, error } = await supabase
    .from('user_app_state')
    .select('budget, plan')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error(error.message)
    return null
  }
  if (!data) return null
  const row = data as RemoteRow
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

async function upsertUserAppState(state: UserAppState) {
  if (!supabase) return
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
  if (error) console.error(error.message)
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
