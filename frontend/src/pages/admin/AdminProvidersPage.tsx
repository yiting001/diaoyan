import { useEffect, useState } from 'react'
import { api } from '../../api'

interface ProviderDto {
  id: number
  name: string
  type: string
  baseUrl: string
  apiKey: string
  model: string
  inputPricePer1M: number
  outputPricePer1M: number
  active: boolean
}

const empty = {
  name: '',
  type: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  model: '',
  inputPricePer1M: 0,
  outputPricePer1M: 0,
  active: true,
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<ProviderDto[]>([])
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [error, setError] = useState('')

  const load = () => api.get('/admin/providers').then((r) => setProviders(r.data))
  useEffect(() => {
    load()
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editingId === 'new') await api.post('/admin/providers', form)
      else await api.put(`/admin/providers/${editingId}`, form)
      setEditingId(null)
      load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? '保存失败')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('确认删除该供应商？')) return
    await api.delete(`/admin/providers/${id}`)
    load()
  }

  return (
    <div className="section">
      <div className="section-title">[+] 模型供应商管理</div>
      <button
        className="btn"
        onClick={() => {
          setEditingId('new')
          setForm({ ...empty })
        }}
      >
        + 添加供应商
      </button>

      {editingId !== null && (
        <form className="card soft" style={{ marginTop: 16 }} onSubmit={save}>
          <div className="grid-2">
            <div>
              <label>名称</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>类型</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="openai-compatible">OpenAI 兼容 API</option>
                <option value="mock">Mock（演示用，无需 Key）</option>
              </select>
              <label>Base URL（如 https://api.openai.com/v1、https://api.deepseek.com）</label>
              <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
              <label>API Key</label>
              <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </div>
            <div>
              <label>模型名称（如 gpt-4o-mini、deepseek-chat）</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              <label>输入价格（$ / 1M tokens）</label>
              <input
                type="number"
                step="0.0001"
                value={form.inputPricePer1M}
                onChange={(e) => setForm({ ...form, inputPricePer1M: Number(e.target.value) })}
              />
              <label>输出价格（$ / 1M tokens）</label>
              <input
                type="number"
                step="0.0001"
                value={form.outputPricePer1M}
                onChange={(e) => setForm({ ...form, outputPricePer1M: Number(e.target.value) })}
              />
              <label>
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginRight: 8 }}
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                启用
              </label>
            </div>
          </div>
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
            <th>类型</th>
            <th>模型</th>
            <th>API Key</th>
            <th>价格($/1M in/out)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.name}</td>
              <td>{p.type}</td>
              <td>{p.model}</td>
              <td>{p.apiKey || '-'}</td>
              <td>
                {p.inputPricePer1M} / {p.outputPricePer1M}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setEditingId(p.id)
                    setForm({ ...p })
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
    </div>
  )
}
