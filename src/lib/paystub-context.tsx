import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  loadPaystubs,
  savePaystubs,
  type Paystub,
} from '@/lib/paystub'

type PaystubContextValue = {
  paystubs: Paystub[]
  upsertPaystub: (paystub: Paystub) => void
  removePaystub: (id: string) => void
}

const PaystubContext = createContext<PaystubContextValue | null>(null)

export function PaystubProvider({ children }: { children: ReactNode }) {
  const [paystubs, setPaystubs] = useState<Paystub[]>(() => loadPaystubs())

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
      },
      removePaystub(id) {
        setPaystubs((current) => {
          const next = current.filter((item) => item.id !== id)
          savePaystubs(next)
          return next
        })
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
