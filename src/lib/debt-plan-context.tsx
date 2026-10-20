import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

import { useAuth } from '@/lib/auth-context'
import { useBudget } from '@/lib/budget-context'
import {
  loadDebtPlan,
  paidOffLoggedDebtIds,
  saveDebtPlan,
  withClosedDebts,
  type DebtPlanState,
} from '@/lib/debt-plan'
import { supabase } from '@/lib/supabase'
import {
  markCloudReady,
  mergePlans,
  rememberPlan,
  resetUserAppStateSync,
  scheduleUserAppStatePush,
  syncUserAppStateFromCloud,
} from '@/lib/user-app-state'

type DebtPlanContextValue = {
  plan: DebtPlanState
  setPlan: Dispatch<SetStateAction<DebtPlanState>>
}

const DebtPlanContext = createContext<DebtPlanContextValue | null>(null)

export function DebtPlanProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const [plan, setPlanState] = useState<DebtPlanState>(() => loadDebtPlan())

  useEffect(() => {
    saveDebtPlan(plan)
    rememberPlan(plan)
    scheduleUserAppStatePush()
  }, [plan])

  useEffect(() => {
    if (loading) return
    if (!supabase || !user) {
      if (!supabase) markCloudReady()
      else resetUserAppStateSync()
      return
    }
    let cancelled = false
    void (async () => {
      const synced = await syncUserAppStateFromCloud()
      if (cancelled) return
      setPlanState((current) => mergePlans(synced.plan, current))
      markCloudReady()
    })()
    return () => {
      cancelled = true
    }
  }, [loading, user])

  const { debts, removeDebt } = useBudget()
  useEffect(() => {
    const paidOff = paidOffLoggedDebtIds(plan)
    const closing = debts.filter((debt) => paidOff.has(debt.id))
    if (closing.length === 0) return
    setPlanState((current) => withClosedDebts(current, closing))
    for (const debt of closing) removeDebt(debt.id)
  }, [plan, debts, removeDebt])

  const value = useMemo<DebtPlanContextValue>(
    () => ({
      plan,
      setPlan: setPlanState,
    }),
    [plan],
  )

  return (
    <DebtPlanContext.Provider value={value}>{children}</DebtPlanContext.Provider>
  )
}

export function useDebtPlan() {
  const context = useContext(DebtPlanContext)
  if (!context) {
    throw new Error('useDebtPlan must be used within DebtPlanProvider')
  }
  return context
}
