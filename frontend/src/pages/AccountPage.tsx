import { useState } from 'react'
import { api, currentUser, logout } from '../api'

export default function AccountPage() {
  const user = currentUser()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk(false)
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword })
      setOk(true)
      setOldPassword('')
      setNewPassword('')
      setConfirm('')
      setTimeout(logout, 1500)
    } catch (err: any) {
      setError(err.response?.data?.message ?? '请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-box">
      <h2>[#] 账号设置</h2>
      <p className="mute">
        {user?.email}（{user?.role === 'admin' ? '管理员' : '普通用户'}）
      </p>
      <h3 style={{ marginTop: 24 }}>修改密码</h3>
      <form onSubmit={submit}>
        <label>当前密码</label>
        <input
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
        />
        <label>新密码（至少 6 位）</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={6}
          required
        />
        <label>确认新密码</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={6}
          required
        />
        {error && <div className="error">[x] {error}</div>}
        {ok && <div className="hint">[√] 密码已修改，即将跳转重新登录…</div>}
        <div style={{ marginTop: 16 }}>
          <button className="btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? '处理中…' : '修改密码'}
          </button>
        </div>
      </form>
    </div>
  )
}
