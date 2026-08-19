import React from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { currentUser, logout } from './api'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import TasksPage from './pages/TasksPage'
import TaskDetailPage from './pages/TaskDetailPage'
import PlansPage from './pages/PlansPage'
import AdminAgentsPage from './pages/admin/AdminAgentsPage'
import AdminProvidersPage from './pages/admin/AdminProvidersPage'
import AdminUsagePage from './pages/admin/AdminUsagePage'
import AdminTracesPage from './pages/admin/AdminTracesPage'
import AdminPlansPage from './pages/admin/AdminPlansPage'

function Nav() {
  const user = currentUser()
  const [open, setOpen] = React.useState(false)
  const location = useLocation()
  React.useEffect(() => {
    setOpen(false)
  }, [location.pathname])
  return (
    <div className="nav">
      <div className="nav-inner">
        <span className="wordmark">{'█▀█ █▀▀ █▀ █▀▀ █▀█ █▀█ █▀▀ █░█\n█▀▄ ██▄ ▄█ ██▄ █▀█ █▀▄ █▄▄ █▀█'}</span>
        <div className={`nav-links ${open ? 'open' : ''}`}>
          <NavLink to="/">智能体</NavLink>
          <NavLink to="/tasks">我的报告</NavLink>
          <NavLink to="/plans">套餐</NavLink>
          {user?.role === 'admin' && (
            <>
              <NavLink to="/admin/agents">[后台]智能体</NavLink>
              <NavLink to="/admin/providers">供应商</NavLink>
              <NavLink to="/admin/usage">用量统计</NavLink>
              <NavLink to="/admin/traces">链路追踪</NavLink>
              <NavLink to="/admin/plans">套餐管理</NavLink>
            </>
          )}
          <div className="nav-user-mobile">
            <span className="mute">{user?.email}</span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              退出
            </button>
          </div>
        </div>
        <div className="nav-user">
          <span>{user?.email}</span>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            退出
          </button>
        </div>
        <button className="nav-toggle" aria-label="菜单" onClick={() => setOpen((v) => !v)}>
          {open ? '[x]' : '[≡]'}
        </button>
      </div>
    </div>
  )
}

function Protected({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const user = currentUser()
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return (
    <>
      <Nav />
      <div className="container">{children}</div>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="/tasks" element={<Protected><TasksPage /></Protected>} />
      <Route path="/tasks/:id" element={<Protected><TaskDetailPage /></Protected>} />
      <Route path="/plans" element={<Protected><PlansPage /></Protected>} />
      <Route path="/admin/agents" element={<Protected admin><AdminAgentsPage /></Protected>} />
      <Route path="/admin/providers" element={<Protected admin><AdminProvidersPage /></Protected>} />
      <Route path="/admin/usage" element={<Protected admin><AdminUsagePage /></Protected>} />
      <Route path="/admin/traces" element={<Protected admin><AdminTracesPage /></Protected>} />
      <Route path="/admin/plans" element={<Protected admin><AdminPlansPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
