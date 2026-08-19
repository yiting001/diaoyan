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

function SearchConfigSection() {
  const [cfg, setCfg] = useState<{ apiKey: string; resultCount: number; enabled: boolean } | null>(null)
  const [msg, setMsg] = useState('')
  const [testResult, setTestResult] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/admin/search/config').then((r) => setCfg(r.data))
  }, [])

  if (!cfg) return null

  const save = async () => {
    setMsg('')
    setBusy(true)
    try {
      const r = await api.put('/admin/search/config', cfg)
      setCfg(r.data)
      setMsg('已保存')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setTestResult('')
    setBusy(true)
    try {
      const r = await api.post('/admin/search/test', { query: '小米SU7 最新' })
      setTestResult(r.data.ok ? `[√] 搜索正常，返回 ${r.data.count} 条结果` : `[x] ${r.data.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="section">
      <div className="section-title">[+] 联网搜索（博查AI）</div>
      <div className="card">
        <p className="mute">
          启用后，智能体调研前会先通过博查AI Web Search 搜索产品最新信息，搜索结果会注入提示词并在报告末尾列出参考来源，搜索过程记入链路追踪。API Key 在 bochaai.com 获取。
        </p>
        <label>博查AI API Key</label>
        <input
          value={cfg.apiKey}
          onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
          placeholder="sk-xxxx（保存后掩码显示）"
        />
        <label>每次搜索结果数（1-20）</label>
        <input
          type="number"
          min={1}
          max={20}
          value={cfg.resultCount}
          onChange={(e) => setCfg({ ...cfg, resultCount: Number(e.target.value) })}
        />
        <label>
          <input
            type="checkbox"
            style={{ width: 'auto', marginRight: 8 }}
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
          启用联网搜索
        </label>
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn" disabled={busy} onClick={save}>
            保存
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={test}>
            测试搜索
          </button>
          {msg && <span className="status-done">[√] {msg}</span>}
          {testResult && <span className="mute">{testResult}</span>}
        </div>
      </div>
    </div>
  )
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

      <SearchConfigSection />
    </div>
  )
}
