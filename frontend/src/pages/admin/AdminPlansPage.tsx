import { useEffect, useState } from 'react'
import { api, billingTypeLabels } from '../../api'
import { planPriceText, type PlanDto } from '../PlansPage'

const empty = {
  name: '',
  description: '',
  billingType: 'per_use',
  basePrice: 0,
  tokenPricePer1K: 0,
  active: true,
}

interface SubRow {
  id: number
  email: string
  remainingUses: number
  expiresAt: string | null
  updatedAt: string
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<PlanDto[]>([])
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [error, setError] = useState('')
  const [subs, setSubs] = useState<SubRow[]>([])
  const [grantEmail, setGrantEmail] = useState('')
  const [grantPlanId, setGrantPlanId] = useState<number | ''>('')
  const [grantMsg, setGrantMsg] = useState('')

  const load = () => api.get('/admin/plans').then((r) => setPlans(r.data))
  const loadSubs = () => api.get('/admin/subscriptions').then((r) => setSubs(r.data))
  useEffect(() => {
    load()
    loadSubs()
  }, [])

  const grant = async (e: React.FormEvent) => {
    e.preventDefault()
    setGrantMsg('')
    try {
      await api.post('/admin/subscriptions/grant', { email: grantEmail, planId: grantPlanId })
      setGrantMsg('[√] 开通成功')
      setGrantEmail('')
      loadSubs()
    } catch (err: any) {
      setGrantMsg(`[x] ${err.response?.data?.message ?? '开通失败'}`)
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editingId === 'new') await api.post('/admin/plans', form)
      else await api.put(`/admin/plans/${editingId}`, form)
      setEditingId(null)
      load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? '保存失败')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('确认删除该套餐？')) return
    await api.delete(`/admin/plans/${id}`)
    load()
  }

  const needsToken = form.billingType.endsWith('_plus_token')
  const baseLabel =
    form.billingType.startsWith('yearly') ? '年费价格（¥ / 年）' : '单次价格（¥ / 次）'

  return (
    <div className="section">
      <div className="section-title">[+] 套餐管理</div>
      <button
        className="btn"
        onClick={() => {
          setEditingId('new')
          setForm({ ...empty })
        }}
      >
        + 添加套餐
      </button>

      {editingId !== null && (
        <form className="card soft" style={{ marginTop: 16 }} onSubmit={save}>
          <label>套餐名称</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label>描述</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label>计费方式</label>
          <select
            value={form.billingType}
            onChange={(e) => setForm({ ...form, billingType: e.target.value })}
          >
            <option value="per_use">按次收费（一次多少钱）</option>
            <option value="yearly">按年付费（一年多少钱）</option>
            <option value="yearly_plus_token">按年 + Token 计价</option>
            <option value="per_use_plus_token">按次 + Token 计价</option>
          </select>
          <label>{baseLabel}</label>
          <input
            type="number"
            step="0.01"
            value={form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
          />
          {needsToken && (
            <>
              <label>Token 价格（¥ / 1K tokens）</label>
              <input
                type="number"
                step="0.001"
                value={form.tokenPricePer1K}
                onChange={(e) => setForm({ ...form, tokenPricePer1K: Number(e.target.value) })}
              />
            </>
          )}
          <label>
            <input
              type="checkbox"
              style={{ width: 'auto', marginRight: 8 }}
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            上架
          </label>
          {error && <div className="error">[x] {error}</div>}
          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <button className="btn">保存</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>
              取消
            </button>
          </div>
        </form>
      )}

      <table style={{ marginTop: 24 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>名称</th>
            <th>计费方式</th>
            <th>价格</th>
            <th>上架</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>
                <b>{p.name}</b>
                <div className="mute">{p.description}</div>
              </td>
              <td>{billingTypeLabels[p.billingType] ?? p.billingType}</td>
              <td>{planPriceText(p)}</td>
              <td>{p.active ? '[x]' : '[ ]'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setEditingId(p.id)
                    setForm({
                      name: p.name,
                      description: p.description,
                      billingType: p.billingType,
                      basePrice: p.basePrice,
                      tokenPricePer1K: p.tokenPricePer1K,
                      active: p.active,
                    })
                  }}
                >
                  编辑
                </button>{' '}
                <button className="btn btn-danger btn-sm" onClick={() => remove(p.id)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-title" style={{ marginTop: 32 }}>[+] 用户套餐权益</div>
      <form className="card soft" onSubmit={grant}>
        <label>手动开通套餐（等同于支付成功一次：按次套餐 +1 次，年度套餐延长一年）</label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            style={{ flex: 2, minWidth: 200 }}
            placeholder="用户邮箱"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            required
          />
          <select
            style={{ flex: 1, minWidth: 160 }}
            value={grantPlanId}
            onChange={(e) => setGrantPlanId(Number(e.target.value))}
            required
          >
            <option value="" disabled>
              选择套餐
            </option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{billingTypeLabels[p.billingType] ?? p.billingType}）
              </option>
            ))}
          </select>
          <button className="btn">开通</button>
        </div>
        {grantMsg && <p className={grantMsg.startsWith('[x]') ? 'error' : 'status-done'}>{grantMsg}</p>}
      </form>

      <table style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>用户</th>
            <th>剩余次数</th>
            <th>年度到期</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td>{s.email}</td>
              <td>{s.remainingUses}</td>
              <td>
                {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('zh-CN') : '-'}
              </td>
              <td>{new Date(s.updatedAt).toLocaleString('zh-CN')}</td>
            </tr>
          ))}
          {subs.length === 0 && (
            <tr>
              <td colSpan={4} className="mute">
                暂无用户套餐记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
