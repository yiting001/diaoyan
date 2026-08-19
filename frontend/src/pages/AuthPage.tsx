import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api, currentUser, setAuth } from '../api'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // 游客转正：携带游客 token，把游客期间生成的报告归并到账号
      const guestToken = currentUser()?.isGuest ? localStorage.getItem('token') : null
      const res = await api.post(`/auth/${mode}`, {
        email,
        password,
        ...(guestToken ? { guestToken } : {}),
      })
      setAuth(res.data.token, res.data.user)
      const from = params.get('from') || (location.state as any)?.from?.pathname || '/'
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.message ?? '请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-box">
      <div className="hero" style={{ textAlign: 'center' }}>
        <div className="wordmark" style={{ fontSize: 14 }}>
          凡夫价投智能体
        </div>
        <div className="hint">AI 智能体 · 产品调研 · PDF 报告</div>
      </div>
      <div className="tabs">
        <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
          [+] 登录
        </button>
        <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
          [+] 注册
        </button>
      </div>
      <form onSubmit={submit}>
        <label>邮箱</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>密码（至少 6 位）</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        {error && <div className="error">[x] {error}</div>}
        <div style={{ marginTop: 16 }}>
          <button className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </div>
      </form>
      <p className="mute" style={{ marginTop: 16 }}>
        [-] 注册后可保留游客期间生成的报告，购买套餐即可解锁完整报告
      </p>
    </div>
  )
}
