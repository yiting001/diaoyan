import { useEffect, useState } from 'react'
import { api, currentUser } from '../../api'

interface UserRow {
  id: number
  email: string
  role: 'user' | 'admin'
  createdAt: string
  taskCount: number
  remainingUses: number
  expiresAt: string | null
}

export default function AdminUsersPage() {
  const me = currentUser()
  const [users, setUsers] = useState<UserRow[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ email: '', role: 'user' as 'user' | 'admin' })
  const [resetId, setResetId] = useState<number | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = () => api.get('/admin/users').then((r) => setUsers(r.data))
  useEffect(() => {
    load()
  }, [])

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      await api.put(`/admin/users/${editingId}`, form)
      setEditingId(null)
      setMsg('[√] 已保存')
      load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? '保存失败')
    }
  }

  const saveReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMsg('')
    try {
      await api.post(`/admin/users/${resetId}/reset-password`, { password: newPassword })
      setResetId(null)
      setNewPassword('')
      setMsg('[√] 密码已重置')
    } catch (err: any) {
      setError(err.response?.data?.message ?? '重置失败')
    }
  }

  const remove = async (u: UserRow) => {
    if (!confirm(`确认删除用户 ${u.email}？其任务、订单、套餐权益将一并删除。`)) return
    setError('')
    setMsg('')
    try {
      await api.delete(`/admin/users/${u.id}`)
      setMsg('[√] 已删除')
      load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? '删除失败')
    }
  }

  return (
    <div className="section">
      <div className="section-title">[+] 用户管理</div>
      {error && <div className="error">[x] {error}</div>}
      {msg && <p className="status-done">{msg}</p>}

      {editingId !== null && (
        <form className="card soft" onSubmit={saveEdit}>
          <label>邮箱</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <label>角色</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'user' | 'admin' })}
          >
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <button className="btn">保存</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>
              取消
            </button>
          </div>
        </form>
      )}

      {resetId !== null && (
        <form className="card soft" onSubmit={saveReset}>
          <label>新密码（至少 6 位）</label>
          <input
            type="password"
            value={newPassword}
            minLength={6}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <button className="btn">重置密码</button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setResetId(null)
                setNewPassword('')
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}

      <table style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>报告数</th>
            <th>剩余次数</th>
            <th>年度到期</th>
            <th>注册时间</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>
                {u.email}
                {u.id === me?.id && <span className="badge light"> 我</span>}
              </td>
              <td>{u.role === 'admin' ? '管理员' : '用户'}</td>
              <td>{u.taskCount}</td>
              <td>{u.remainingUses}</td>
              <td>{u.expiresAt ? new Date(u.expiresAt).toLocaleDateString('zh-CN') : '-'}</td>
              <td>{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setResetId(null)
                    setEditingId(u.id)
                    setForm({ email: u.email, role: u.role })
                  }}
                >
                  编辑
                </button>{' '}
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setEditingId(null)
                    setResetId(u.id)
                    setNewPassword('')
                  }}
                >
                  重置密码
                </button>{' '}
                {u.id !== me?.id && (
                  <button className="btn btn-danger btn-sm" onClick={() => remove(u)}>
                    删除
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
