import { Navigate, Route, Routes } from 'react-router-dom'

import { DashboardPage } from '@/pages/dashboard-page'
import { IncomePage } from '@/pages/income-page'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/income" element={<IncomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
