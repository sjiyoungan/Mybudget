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
  initialSync,
  markCloudReady,
  rememberPlan,
  resetSync,
  schedulePush,
  startPeriodicSync,
} from '@/lib/user-app-state-v2'

type DebtPlanContextValue = {
  plan: DebtPlanState
  setPlan: Dispatch<SetStateAction<DebtPlanState>>
}

const DebtPlanContext = createContext<DebtPlanContextValue | null>(null)

export function DebtPlanProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const [plan, setPlanState] = useState<DebtPlanState | null>(null)
  const [isLoadingCloud, setIsLoadingCloud] = useState(true)

  useEffect(() => {
    if (plan) {
      saveDebtPlan(plan)
      rememberPlan(plan)
      schedulePush()
    }
  }, [plan])

  useEffect(() => {
    if (loading) return
    if (!supabase || !user) {
      // Offline mode: use localStorage
      setPlanState(loadDebtPlan())
      setIsLoadingCloud(false)
      if (!supabase) markCloudReady()
      else resetSync()
      return
    }
    
    let cancelled = false
    void (async () => {
      const cloudState = await initialSync()
      if (cancelled) return
      
      if (cloudState) {
        setPlanState(cloudState.plan)
      } else {
        // Fallback to localStorage (offline or error)
        setPlanState(loadDebtPlan())
      }
      
      setIsLoadingCloud(false)
      markCloudReady()
      startPeriodicSync()
    })()
    
    return () => {
      cancelled = true
    }
  }, [loading, user])

  const { debts, removeDebt } = useBudget()
  useEffect(() => {
    if (!plan) return
    const paidOff = paidOffLoggedDebtIds(plan)
    const closing = debts.filter((debt) => paidOff.has(debt.id))
    if (closing.length === 0) return
    setPlanState((current) => current ? withClosedDebts(current, closing) : current)
    for (const debt of closing) removeDebt(debt.id)
  }, [plan, debts, removeDebt])

  const value = useMemo<DebtPlanContextValue>(
    () => ({
      plan: plan || loadDebtPlan(),
      setPlan: setPlanState as Dispatch<SetStateAction<DebtPlanState>>,
    }),
    [plan],
  )

  // Show loading state while fetching cloud
  if (isLoadingCloud && user && supabase) {
    return <DebtPlanContext.Provider value={value}>{children}</DebtPlanContext.Provider>
  }

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
