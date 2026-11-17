import {
  loadBudget,
  markBudgetSeedsApplied,
  parseBudgetState,
  saveBudget,
  type BudgetState,
} from '@/lib/budget'
import { mergeBudgetStates } from '@/lib/budget-merge'
import {
  loadDebtPlan,
  markPlanMigrationsApplied,
  parseDebtPlan,
  saveDebtPlan,
  withoutSessionExtra,
  type DebtPlanState,
} from '@/lib/debt-plan'
import { mergeDebtPlanStates } from '@/lib/debt-plan-merge'
import {
  APP_STATE_PAY_DATE,
  fetchPaystubDataByDate,
  fetchPaystubDataByDateResult,
  upsertPaystubRecord,
} from '@/lib/paystub'
import {
  emptySpending,
  loadSpending,
  parseSpendingState,
  saveSpending,
  type SpendingState,
} from '@/lib/spending'
import { mergeSpendingStates } from '@/lib/spending-merge'
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
let inflight: Promise<CloudSync> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pullIntervalId: ReturnType<typeof setInterval> | null = null
let ongoingPull: Promise<void> | null = null
let syncCleanupFns: Array<() => void> = []

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
  cache = { ...localAppState(), plan: withoutSessionExtra(plan) }
}

export function rememberSpending(spending: SpendingState) {
  cache = { ...localAppState(), spending }
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
  if (pullIntervalId) {
    clearInterval(pullIntervalId)
    pullIntervalId = null
  }
  ongoingPull = null
  // Run all cleanup functions
  syncCleanupFns.forEach((fn) => fn())
  syncCleanupFns = []
}

function isMissingTable(error: { code?: string; message: string }) {
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table|schema cache|does not exist/i.test(error.message)
  )
}

type CloudRead =
  | { status: 'ready'; state: UserAppState; upload: boolean }
  | { status: 'empty' }
  | { status: 'error' }

async function readDedicatedRow(): Promise<
  { ok: true; row: RemoteRow | null } | { ok: false }
> {
  if (!supabase) return { ok: false }
  try {
    const userId = await currentUserId()
    if (!userId) return { ok: false }
    const { data, error } = await supabase
      .from('user_app_state')
      .select('budget, plan')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      if (isMissingTable(error)) return { ok: true, row: null }
      console.error(error.message)
      return { ok: false }
    }
    return { ok: true, row: (data as RemoteRow | null) ?? null }
  } catch {
    return { ok: false }
  }
}

async function readCloudAppState(): Promise<CloudRead> {
  const dedicated = await readDedicatedRow()
  const paystub = await fetchPaystubDataByDateResult(APP_STATE_PAY_DATE)
  if (!dedicated.ok || !paystub.ok) return { status: 'error' }

  const paystubRow = (paystub.data as AppStatePaystubData | null) ?? null
  if (!dedicated.row && !paystubRow) return { status: 'empty' }

  const dedicatedBudget = dedicated.row ? parseBudgetState(dedicated.row.budget) : null
  const dedicatedPlan = dedicated.row ? planFrom(dedicated.row.plan) : null
  const paystubBudget = paystubRow ? parseBudgetState(paystubRow.budget) : null
  const paystubPlan = paystubRow ? planFrom(paystubRow.plan) : null
  const paystubSpending = paystubRow ? parseSpendingState(paystubRow.spending) : null
  if (
    (dedicated.row && !dedicatedBudget && !dedicatedPlan) ||
    (paystubRow && !paystubBudget && !paystubPlan && !paystubSpending)
  ) {
    return { status: 'error' }
  }

  const local = localAppState()
  return {
    status: 'ready',
    upload: !paystubRow,
    state: {
      budget: dedicatedBudget ?? paystubBudget ?? local.budget,
      plan: dedicatedPlan ?? paystubPlan ?? local.plan,
      spending: paystubRow ? (paystubSpending ?? emptySpending()) : local.spending,
    },
  }
}

function planFrom(value: unknown) {
  if (
    value == null ||
    typeof value !== 'object' ||
    !Array.isArray((value as { affirmLoans?: unknown }).affirmLoans)
  ) {
    return null
  }
  return parseDebtPlan(value)
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
  // Before pushing, fetch current remote state and merge to prevent conflicts
  const read = await readCloudAppState()
  let mergedState = state
  
  if (read.status === 'ready') {
    // Merge local changes with remote state
    mergedState = {
      budget: mergeBudgetStates(state.budget, read.state.budget),
      plan: mergeDebtPlanStates(state.plan, read.state.plan),
      spending: mergeSpendingStates(state.spending, read.state.spending),
    }
    
    // Update cache and local storage with merged state
    cache = mergedState
    saveBudget(mergedState.budget)
    saveDebtPlan(mergedState.plan)
    saveSpending(mergedState.spending)
  }
  
  await upsertPaystubAppState(mergedState)
  await upsertDedicatedAppState(mergedState)
}

function applyLocal(state: UserAppState) {
  saveBudget(state.budget)
  saveDebtPlan(state.plan)
  saveSpending(state.spending)
  markBudgetSeedsApplied()
  markPlanMigrationsApplied()
  cache = state
}

export type CloudSync = {
  state: UserAppState
  fromCloud: boolean
}

export function syncUserAppStateFromCloud(): Promise<CloudSync> {
  if (!inflight) {
    inflight = (async () => {
      const read = await readCloudAppState()
      if (read.status === 'error') {
        return { state: localAppState(), fromCloud: false }
      }
      if (read.status === 'empty') {
        const local = localAppState()
        applyLocal(local)
        await upsertUserAppState(local)
        return { state: local, fromCloud: true }
      }
      applyLocal(read.state)
      if (read.upload) await upsertUserAppState(read.state)
      return { state: read.state, fromCloud: true }
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

export async function pushUserAppStateNow() {
  ready = true
  await upsertUserAppState(localAppState())
}

/**
 * Pulls remote changes and merges them with local state.
 * Called on visibility change and periodically to prevent stale data.
 */
export async function pullAndMergeRemoteChanges(): Promise<void> {
  if (!ready || !supabase) return
  
  // Prevent concurrent pulls
  if (ongoingPull) {
    await ongoingPull
    return
  }
  
  ongoingPull = (async () => {
    try {
      const read = await readCloudAppState()
      if (read.status !== 'ready') return
      
      const local = localAppState()
      
      // Merge remote state with local
      const merged: UserAppState = {
        budget: mergeBudgetStates(local.budget, read.state.budget),
        plan: mergeDebtPlanStates(local.plan, read.state.plan),
        spending: mergeSpendingStates(local.spending, read.state.spending),
      }
      
      // Apply merged state locally
      cache = merged
      saveBudget(merged.budget)
      saveDebtPlan(merged.plan)
      saveSpending(merged.spending)
      
      // Notify contexts to reload (they watch localStorage)
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'mybudget.spending.v1',
        newValue: JSON.stringify(merged.spending),
        storageArea: localStorage,
      }))
    } finally {
      ongoingPull = null
    }
  })()
  
  await ongoingPull
}

/**
 * Starts periodic pulling and visibility-based sync.
 * Call this once when the app initializes with a logged-in user.
 */
export function startPeriodicSync() {
  if (!ready || !supabase || pullIntervalId) return
  
  // Pull every 30 seconds to catch changes from other devices
  pullIntervalId = setInterval(() => {
    void pullAndMergeRemoteChanges()
  }, 30000)
  
  // Pull when tab becomes visible (user switches back to this tab)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void pullAndMergeRemoteChanges()
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // Pull when window gains focus
  const handleFocus = () => {
    void pullAndMergeRemoteChanges()
  }
  window.addEventListener('focus', handleFocus)
  
  // Register cleanup functions
  syncCleanupFns.push(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })
  syncCleanupFns.push(() => {
    window.removeEventListener('focus', handleFocus)
  })
}
