/**
 * Cloud-authoritative sync with optimistic concurrency control.
 * 
 * Architecture:
 * - Cloud (user_app_state table) is the source of truth
 * - localStorage is only an offline cache
 * - On load: Read cloud first, show loading state, replace with cloud data
 * - On edit: Optimistic UI update, then push with version check and retry on conflict
 * - On pull: Overwrite local cache with cloud data
 * - No stuck pending-edit flags
 * - Version check forces old tabs to reload
 */

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
  withoutSessionExtra,
  type DebtPlanState,
} from '@/lib/debt-plan'
import {
  APP_STATE_PAY_DATE,
  fetchPaystubDataByDate,
  type Paystub,
} from '@/lib/paystub'
import {
  emptySpending,
  loadSpending,
  parseSpendingState,
  saveSpending,
  type SpendingState,
} from '@/lib/spending'
import { supabase } from '@/lib/supabase'
import { checkAndEnforceSyncVersion } from '@/lib/app-version'

export type UserAppState = {
  budget: BudgetState
  plan: DebtPlanState
  spending: SpendingState
}

type CloudState = UserAppState & {
  syncVersion: number
  updatedAt: string
}

type UserAppStateRow = {
  user_id: string
  budget: unknown
  plan: unknown
  spending: unknown
  sync_version: number
  updated_at: string
}

type UpsertResult = {
  success: boolean
  sync_version?: number
  updated_at?: string
  error?: string
  message?: string
  current_version?: number
}

// In-memory cache
let cache: CloudState | null = null
let ready = false
let inflight: Promise<CloudState | null> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pullIntervalId: ReturnType<typeof setInterval> | null = null
let ongoingPull: Promise<void> | null = null
let syncCleanupFns: Array<() => void> = []

async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * Read from cloud (user_app_state table), with one-time fallback to paystubs migration.
 */
async function readCloudState(): Promise<CloudState | null> {
  if (!supabase) return null
  
  const userId = await currentUserId()
  if (!userId) return null

  try {
    // Try user_app_state table first
    const { data, error } = await supabase
      .from('user_app_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      // Table might not exist yet, or other error
      if (error.code === 'PGRST116' || error.code === '42P01') {
        console.warn('user_app_state table not found, checking paystubs migration')
      } else {
        console.error('Error reading user_app_state:', error.message)
      }
    }

    if (data) {
      const row = data as UserAppStateRow
      const budget = parseBudgetState(row.budget)
      const plan = parseDebtPlan(row.plan)
      const spending = parseSpendingState(row.spending)

      if (!budget || !plan || !spending) {
        console.error('Invalid data in user_app_state')
        return null
      }

      return {
        budget,
        plan,
        spending,
        syncVersion: row.sync_version,
        updatedAt: row.updated_at,
      }
    }

    // If no row in user_app_state, try one-time migration from paystubs
    const paystubData = await fetchPaystubDataByDate(APP_STATE_PAY_DATE)
    if (paystubData && typeof paystubData === 'object') {
      const record = paystubData as {
        budget?: unknown
        plan?: unknown
        spending?: unknown
        fileName?: string
        appState?: boolean
      }

      if (record.fileName === '__app_state__' || record.appState === true) {
        const budget = parseBudgetState(record.budget)
        const plan = parseDebtPlan(record.plan)
        const spending = parseSpendingState(record.spending)

        if (budget && plan && spending) {
          console.info('Migrating app state from paystubs to user_app_state')
          // Write to user_app_state (version will be 1)
          const writeResult = await writeCloudState({ budget, plan, spending }, null)
          if (writeResult) {
            return writeResult
          }
          // If write failed, return the migrated data anyway (client will retry push)
          return {
            budget,
            plan,
            spending,
            syncVersion: 0, // Unknown version, will be set on first write
            updatedAt: new Date().toISOString(),
          }
        }
      }
    }

    // No data in cloud or paystubs, return null (will use empty defaults)
    return null
  } catch (err) {
    console.error('Error reading cloud state:', err)
    return null
  }
}

/**
 * Write to cloud with optimistic concurrency control.
 * Returns the new cloud state if successful, null if conflict or error.
 */
async function writeCloudState(
  state: UserAppState,
  expectedVersion: number | null,
): Promise<CloudState | null> {
  if (!supabase) return null

  try {
    const { data, error } = await supabase.rpc('upsert_user_app_state', {
      p_budget: state.budget,
      p_plan: state.plan,
      p_spending: state.spending,
      p_expected_version: expectedVersion,
    })

    if (error) {
      console.error('Error calling upsert_user_app_state:', error.message)
      return null
    }

    const result = data as UpsertResult

    if (!result.success) {
      if (result.error === 'version_conflict') {
        console.warn('Version conflict:', result.message)
        return null // Caller will re-read and retry
      }
      console.error('Upsert failed:', result.message)
      return null
    }

    return {
      ...state,
      syncVersion: result.sync_version!,
      updatedAt: result.updated_at!,
    }
  } catch (err) {
    console.error('Error writing cloud state:', err)
    return null
  }
}

/**
 * Save state to localStorage (offline cache only).
 */
function saveLocalCache(state: UserAppState) {
  saveBudget(state.budget)
  saveDebtPlan(state.plan)
  saveSpending(state.spending)
}

/**
 * Load state from localStorage (offline cache only).
 */
function loadLocalCache(): UserAppState {
  return {
    budget: loadBudget(),
    plan: loadDebtPlan(),
    spending: loadSpending(),
  }
}

/**
 * Initial sync: Read cloud, fall back to localStorage only if offline.
 * Returns CloudState if cloud is available, null if using localStorage fallback.
 */
export async function initialSync(): Promise<CloudState | null> {
  // Check version and reload if old
  if (!checkAndEnforceSyncVersion()) {
    return null // Will reload, so return null
  }

  if (inflight) {
    return inflight
  }

  inflight = (async () => {
    const cloudState = await readCloudState()

    if (cloudState) {
      // Cloud is authoritative
      cache = cloudState
      saveLocalCache(cloudState)
      markBudgetSeedsApplied()
      markPlanMigrationsApplied()
      return cloudState
    }

    // No cloud data, use localStorage as fallback (offline or first run)
    const localState = loadLocalCache()
    cache = {
      ...localState,
      syncVersion: 0, // Will be set on first push
      updatedAt: new Date().toISOString(),
    }
    markBudgetSeedsApplied()
    markPlanMigrationsApplied()

    // Try to push to cloud (will create initial row)
    const written = await writeCloudState(localState, null)
    if (written) {
      cache = written
    }

    return cache
  })().finally(() => {
    inflight = null
  })

  return inflight
}

/**
 * Remember state change from UI (optimistic update).
 */
export function rememberBudget(budget: BudgetState) {
  if (cache) {
    cache = { ...cache, budget }
  }
}

export function rememberPlan(plan: DebtPlanState) {
  if (cache) {
    cache = { ...cache, plan: withoutSessionExtra(plan) }
  }
}

export function rememberSpending(spending: SpendingState) {
  if (cache) {
    cache = { ...cache, spending }
  }
}

/**
 * Schedule a debounced push to cloud.
 */
export function schedulePush() {
  if (!ready || !supabase) return

  if (pushTimer) clearTimeout(pushTimer)
  
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushToCloud()
  }, 400)
}

/**
 * Push to cloud immediately with retry on version conflict.
 */
export async function pushToCloud(): Promise<void> {
  if (!cache) return

  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    attempt++

    const currentState: UserAppState = {
      budget: cache.budget,
      plan: cache.plan,
      spending: cache.spending,
    }

    const written = await writeCloudState(currentState, cache.syncVersion || null)

    if (written) {
      // Success
      cache = written
      saveLocalCache(written)
      return
    }

    // Version conflict or error, re-read cloud
    console.warn(`Push attempt ${attempt} failed, re-reading cloud...`)
    const freshCloud = await readCloudState()

    if (!freshCloud) {
      console.error('Could not re-read cloud state after conflict')
      return
    }

    // Merge fresh cloud with our pending changes
    // For now, cloud wins (we could implement smarter merge here)
    cache = freshCloud
    saveLocalCache(freshCloud)

    // User will need to re-apply their edits if there was a conflict
    // In practice, this is rare with per-user data
  }

  console.error('Push failed after', maxRetries, 'attempts')
}

/**
 * Pull from cloud and overwrite local cache.
 */
export async function pullFromCloud(): Promise<void> {
  if (!ready || !supabase) return

  if (ongoingPull) {
    await ongoingPull
    return
  }

  ongoingPull = (async () => {
    try {
      const cloudState = await readCloudState()

      if (cloudState) {
        cache = cloudState
        saveLocalCache(cloudState)
        
        // Notify contexts to reload
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'mybudget.plan.v1',
          newValue: JSON.stringify(cloudState.plan),
          storageArea: localStorage,
        }))
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'mybudget.spending.v1',
          newValue: JSON.stringify(cloudState.spending),
          storageArea: localStorage,
        }))
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'mybudget.budget.v1',
          newValue: JSON.stringify(cloudState.budget),
          storageArea: localStorage,
        }))
      }
    } finally {
      ongoingPull = null
    }
  })()

  await ongoingPull
}

/**
 * Start periodic sync (pull every 30s, on focus, on visibility).
 */
export function startPeriodicSync() {
  if (!ready || !supabase || pullIntervalId) return

  // Pull every 30 seconds
  pullIntervalId = setInterval(() => {
    void pullFromCloud()
  }, 30000)

  // Pull on visibility change
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void pullFromCloud()
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Pull on focus
  const handleFocus = () => {
    void pullFromCloud()
  }
  window.addEventListener('focus', handleFocus)

  // Register cleanup
  syncCleanupFns.push(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })
  syncCleanupFns.push(() => {
    window.removeEventListener('focus', handleFocus)
  })
}

/**
 * Mark sync as ready.
 */
export function markCloudReady() {
  ready = true
}

/**
 * Reset sync state.
 */
export function resetSync() {
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
  
  syncCleanupFns.forEach((fn) => fn())
  syncCleanupFns = []
}

/**
 * Get current cached state.
 */
export function getCachedState(): UserAppState | null {
  return cache ? {
    budget: cache.budget,
    plan: cache.plan,
    spending: cache.spending,
  } : null
}

// Pagehide: push immediately
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (cache && ready) {
      void pushToCloud()
    }
  })
}
