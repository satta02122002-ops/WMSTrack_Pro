import React, { useEffect, useState } from 'react'
import { useStore, pagesForUser } from './store.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import OperationsExecution from './pages/OperationsExecution.jsx'
import PendingActivity from './pages/PendingActivity.jsx'
import OperationsMonitor from './pages/OperationsMonitor.jsx'
import StorageHandling from './pages/StorageHandling.jsx'
import VAS from './pages/VAS.jsx'
import Reports from './pages/Reports.jsx'
import MonthlyBilling from './pages/MonthlyBilling.jsx'
import MasterData from './pages/MasterData.jsx'
import Parameter from './pages/Parameter.jsx'
import Attendance from './pages/Attendance.jsx'
import Productivity from './pages/Productivity.jsx'
import Analytics from './pages/Analytics.jsx'
import ActivityLog from './pages/ActivityLog.jsx'
import Users from './pages/Users.jsx'
import { EmptyState } from './components/ui.jsx'

const PAGE_COMPONENTS = {
  operations: OperationsExecution,
  pending: PendingActivity,
  monitor: OperationsMonitor,
  storage: StorageHandling,
  vas: VAS,
  reports: Reports,
  billing: MonthlyBilling,
  masterdata: MasterData,
  parameter: Parameter,
  attendance: Attendance,
  productivity: Productivity,
  analytics: Analytics,
  activitylog: ActivityLog,
  users: Users,
}

export default function App() {
  const { currentUser, session, logout } = useStore()
  const [page, setPage] = useState('operations')

  // Session references a user that was deleted/deactivated -> force logout
  useEffect(() => {
    if (session && (!currentUser || !currentUser.active)) logout(true)
  }, [session, currentUser, logout])

  if (!currentUser) return <Login />

  const allowed = pagesForUser(currentUser)
  const effectivePage = allowed.includes(page) ? page : allowed[0]
  const PageComponent = PAGE_COMPONENTS[effectivePage]

  return (
    <Layout page={effectivePage} setPage={setPage}>
      {PageComponent ? (
        <PageComponent setPage={setPage} />
      ) : (
        <EmptyState icon="🔒" title="No accessible pages" hint="Ask an administrator to grant you page access." />
      )}
    </Layout>
  )
}
