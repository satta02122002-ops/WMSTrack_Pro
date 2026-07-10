import React, { Component, Suspense, lazy, useEffect, useState } from 'react'
import { useStore, pagesForUser } from './store.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import { EmptyState } from './components/ui.jsx'

const OperationsExecution = lazy(() => import('./pages/OperationsExecution.jsx'))
const OperationsMonitor = lazy(() => import('./pages/OperationsMonitor.jsx'))
const StorageHandling = lazy(() => import('./pages/StorageHandling.jsx'))
const VAS = lazy(() => import('./pages/VAS.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const MonthlyBilling = lazy(() => import('./pages/MonthlyBilling.jsx'))
const MasterData = lazy(() => import('./pages/MasterData.jsx'))
const Parameter = lazy(() => import('./pages/Parameter.jsx'))
const Attendance = lazy(() => import('./pages/Attendance.jsx'))
const Productivity = lazy(() => import('./pages/Productivity.jsx'))
const Analytics = lazy(() => import('./pages/Analytics.jsx'))
const ActivityLog = lazy(() => import('./pages/ActivityLog.jsx'))
const Users = lazy(() => import('./pages/Users.jsx'))

class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem', padding: 20 }}>
          <h2 style={{ color: '#c00', margin: 0 }}>Something went wrong</h2>
          <p style={{ color: '#666', maxWidth: 480, textAlign: 'center' }}>{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '0.5rem 1.5rem', cursor: 'pointer', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const PAGE_COMPONENTS = {
  operations: OperationsExecution,
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

function AppInner() {
  const { currentUser, session, logout } = useStore()
  const [page, setPage] = useState('operations')

  useEffect(() => {
    if (session && (!currentUser || !currentUser.active)) logout(true)
  }, [session, currentUser, logout])

  if (!currentUser) return <Login />

  const allowed = pagesForUser(currentUser)
  const effectivePage = allowed.includes(page) ? page : allowed[0]
  const PageComponent = PAGE_COMPONENTS[effectivePage]

  return (
    <Layout page={effectivePage} setPage={setPage}>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span style={{ color: 'var(--ink-400)' }}>Loading…</span></div>}>
        {PageComponent ? (
          <PageComponent setPage={setPage} />
        ) : (
          <EmptyState icon="🔒" title="No accessible pages" hint="Ask an administrator to grant you page access." />
        )}
      </Suspense>
    </Layout>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  )
}
