import React from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { currentUser, ensureAuth, logout } from './api'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import TasksPage from './pages/TasksPage'
import TaskDetailPage from './pages/TaskDetailPage'
import PlansPage from './pages/PlansPage'
import AccountPage from './pages/AccountPage'
import AdminAgentsPage from './pages/admin/AdminAgentsPage'
import AdminProvidersPage from './pages/admin/AdminProvidersPage'
import AdminUsagePage from './pages/admin/AdminUsagePage'
import AdminTracesPage from './pages/admin/AdminTracesPage'
import AdminPlansPage from './pages/admin/AdminPlansPage'
import AdminPayPage from './pages/admin/AdminPayPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'

function Nav() {
  const user = currentUser()
  const isGuest = !user || user.isGuest
  const [open, setOpen] = React.useState(false)
  const location = useLocation()
  React.useEffect(() => {
    setOpen(false)
  }, [location.pathname])
  return (
    <div className="nav">
      <div className="nav-inner">
        <span className="wordmark">凡夫价投智能体</span>
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
              <NavLink to="/admin/pay">支付配置</NavLink>
              <NavLink to="/admin/users">用户管理</NavLink>
            </>
          )}
          <div className="nav-user-mobile">
            {isGuest ? (
              <NavLink to="/login">登录 / 注册</NavLink>
            ) : (
              <>
                <NavLink to="/account" className="mute">
                  {user?.email}
                </NavLink>
                <button className="btn btn-secondary btn-sm" onClick={logout}>
                  退出
                </button>
              </>
            )}
          </div>
        </div>
        <div className="nav-user">
          {isGuest ? (
            <NavLink to="/login">
              <button className="btn btn-sm">登录 / 注册</button>
            </NavLink>
          ) : (
            <>
              <NavLink to="/account">{user?.email}</NavLink>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                退出
              </button>
            </>
          )}
        </div>
        <button className="nav-toggle" aria-label="菜单" onClick={() => setOpen((v) => !v)}>
          {open ? '[x]' : '[≡]'}
        </button>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-disclaimer">
        本智能体输出调研报告仅为客观信息分析，不构成任何投资建议，投资有风险，决策请自行负责。
      </div>
      <div className="site-footer-contact">更多企业深度调研沟通请联系：fangfushangye</div>
    </footer>
  )
}

function Protected({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const user = currentUser()
  const location = useLocation()
  if (!user || user.isGuest) return <Navigate to="/login" state={{ from: location }} replace />
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return (
    <>
      <Nav />
      <div className="container">{children}</div>
      <Footer />
    </>
  )
}

// 免登录页面：没有账号时自动创建游客会话
function Open({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(!!currentUser())
  React.useEffect(() => {
    if (!ready) void ensureAuth().then(() => setReady(true))
  }, [ready])
  if (!ready) return null
  return (
    <>
      <Nav />
      <div className="container">{children}</div>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/" element={<Open><HomePage /></Open>} />
      <Route path="/tasks" element={<Open><TasksPage /></Open>} />
      <Route path="/tasks/:id" element={<Open><TaskDetailPage /></Open>} />
      <Route path="/plans" element={<Open><PlansPage /></Open>} />
      <Route path="/account" element={<Protected><AccountPage /></Protected>} />
      <Route path="/admin/agents" element={<Protected admin><AdminAgentsPage /></Protected>} />
      <Route path="/admin/providers" element={<Protected admin><AdminProvidersPage /></Protected>} />
      <Route path="/admin/usage" element={<Protected admin><AdminUsagePage /></Protected>} />
      <Route path="/admin/traces" element={<Protected admin><AdminTracesPage /></Protected>} />
      <Route path="/admin/plans" element={<Protected admin><AdminPlansPage /></Protected>} />
      <Route path="/admin/pay" element={<Protected admin><AdminPayPage /></Protected>} />
      <Route path="/admin/users" element={<Protected admin><AdminUsersPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
