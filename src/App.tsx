import { Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { DashboardPage } from '@/pages/dashboard-page'
import { ExpensesPage } from '@/pages/expenses-page'
import { IncomePage } from '@/pages/income-page'
import { LoginPage } from '@/pages/login-page'

export default function App() {
  const { user, loading } = useAuth()

  if (supabase && loading) {
    return <div className="min-h-svh bg-background" />
  }

  if (supabase && !user) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/income" element={<IncomePage />} />
      <Route path="/expenses" element={<ExpensesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
