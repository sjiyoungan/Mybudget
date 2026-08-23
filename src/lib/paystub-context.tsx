import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from '@/lib/auth-context'
import {
  deleteRemotePaystub,
  fetchRemotePaystubs,
  loadPaystubs,
  savePaystubs,
  upsertRemotePaystub,
  type Paystub,
} from '@/lib/paystub'

type PaystubContextValue = {
  paystubs: Paystub[]
  upsertPaystub: (paystub: Paystub) => void
  removePaystub: (id: string) => void
}

const PaystubContext = createContext<PaystubContextValue | null>(null)

function mergePaystubs(remote: Paystub[], local: Paystub[]) {
  const byDate = new Map<string, Paystub>()
  for (const stub of remote) byDate.set(stub.payDate, stub)
  const extra: Paystub[] = []
  for (const stub of local) {
    const existing = byDate.get(stub.payDate)
    if (!existing) {
      byDate.set(stub.payDate, stub)
      extra.push(stub)
      continue
    }
    if (stub.uploadedAt > existing.uploadedAt) {
      byDate.set(stub.payDate, stub)
      extra.push(stub)
    }
  }
  return {
    merged: [...byDate.values()].sort((left, right) =>
      right.payDate.localeCompare(left.payDate),
    ),
    extra,
  }
}

export function PaystubProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [paystubs, setPaystubs] = useState<Paystub[]>(() => loadPaystubs())

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    void (async () => {
      const remote = await fetchRemotePaystubs()
      if (cancelled || remote == null) return

      const { merged, extra } = mergePaystubs(remote, loadPaystubs())
      savePaystubs(merged)
      setPaystubs(merged)
      await Promise.all(extra.map(upsertRemotePaystub))
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  const value = useMemo<PaystubContextValue>(
    () => ({
      paystubs,
      upsertPaystub(paystub) {
        setPaystubs((current) => {
          const next = [
            paystub,
            ...current.filter((item) => item.payDate !== paystub.payDate),
          ].sort((left, right) => right.payDate.localeCompare(left.payDate))
          savePaystubs(next)
          return next
        })
        void upsertRemotePaystub(paystub)
      },
      removePaystub(id) {
        setPaystubs((current) => {
          const next = current.filter((item) => item.id !== id)
          savePaystubs(next)
          return next
        })
        void deleteRemotePaystub(id)
      },
    }),
    [paystubs],
  )

  return (
    <PaystubContext.Provider value={value}>{children}</PaystubContext.Provider>
  )
}

export function usePaystubs() {
  const context = useContext(PaystubContext)
  if (!context) {
    throw new Error('usePaystubs must be used within PaystubProvider')
  }
  return context
}
