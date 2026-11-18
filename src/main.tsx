import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth-context'
import { BudgetProvider } from '@/lib/budget-context'
import { DebtPlanProvider } from '@/lib/debt-plan-context'
import { PaystubProvider } from '@/lib/paystub-context'
import { SpendingProvider } from '@/lib/spending-context'
import { startVersionGuard } from '@/lib/version-guard'

// Start version guard to detect stale tabs
startVersionGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PaystubProvider>
          <BudgetProvider>
            <DebtPlanProvider>
              <SpendingProvider>
                <App />
              </SpendingProvider>
            </DebtPlanProvider>
          </BudgetProvider>
        </PaystubProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
