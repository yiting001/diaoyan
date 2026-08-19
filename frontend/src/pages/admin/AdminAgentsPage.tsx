import { useEffect, useState } from 'react'
import { api } from '../../api'

interface ProviderDto {
  id: number
  name: string
  model: string
  type: string
}

interface AgentDto {
  id: number
  name: string
  description: string
  systemPrompt: string
  outlinePrompt: string
  sectionPrompt: string
  active: boolean
  provider: ProviderDto | null
}

const empty = {
  name: '',
  description: '',
  systemPrompt: '',
  outlinePrompt: '',
  sectionPrompt: '',
  providerId: 0,
  active: true,
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentDto[]>([])
  const [providers, setProviders] = useState<ProviderDto[]>([])
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [error, setError] = useState('')

  const load = () => {
    api.get('/admin/agents').then((r) => setAgents(r.data))
    api.get('/admin/providers').then((r) => setProviders(r.data))
  }
  useEffect(load, [])

  const startEdit = (a: AgentDto) => {
    setEditingId(a.id)
    setForm({
      name: a.name,
      description: a.description,
      systemPrompt: a.systemPrompt,
      outlinePrompt: a.outlinePrompt,
      sectionPrompt: a.sectionPrompt,
      providerId: a.provider?.id ?? 0,
      active: a.active,
    })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editingId === 'new') await api.post('/admin/agents', form)
      else await api.put(`/admin/agents/${editingId}`, form)
      setEditingId(null)
      load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? '保存失败')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('确认删除该智能体？')) return
    await api.delete(`/admin/agents/${id}`)
    load()
  }

  return (
    <div className="section">
      <div className="section-title">[+] 智能体管理（提示词可编辑）</div>
      <button
        className="btn"
        onClick={() => {
          setEditingId('new')
          setForm({ ...empty, providerId: providers[0]?.id ?? 0 })
        }}
      >
        + 新建智能体
      </button>

      {editingId !== null && (
        <form className="card soft" style={{ marginTop: 16 }} onSubmit={save}>
          <label>名称</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label>描述</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label>系统提示词（System Prompt）</label>
          <textarea
            rows={3}
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          />
          <label>大纲提示词（生成章节大纲）</label>
          <textarea
            rows={2}
            value={form.outlinePrompt}
            onChange={(e) => setForm({ ...form, outlinePrompt: e.target.value })}
          />
          <label>章节提示词（撰写章节内容）</label>
          <textarea
            rows={2}
            value={form.sectionPrompt}
            onChange={(e) => setForm({ ...form, sectionPrompt: e.target.value })}
          />
          <label>模型供应商</label>
          <select
            value={form.providerId}
            onChange={(e) => setForm({ ...form, providerId: Number(e.target.value) })}
          >
            <option value={0}>-- 未配置 --</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.type === 'mock' ? 'mock' : p.model}）
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              style={{ width: 'auto', marginRight: 8 }}
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            对用户可见
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
            <th>供应商</th>
            <th>可见</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id}>
              <td>{a.id}</td>
              <td>
                <b>{a.name}</b>
                <div className="mute">{a.description}</div>
              </td>
              <td>{a.provider ? `${a.provider.name}` : '-'}</td>
              <td>{a.active ? '[x]' : '[ ]'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => startEdit(a)}>
                  编辑
                </button>{' '}
                <button className="btn btn-danger btn-sm" onClick={() => remove(a.id)}>
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
