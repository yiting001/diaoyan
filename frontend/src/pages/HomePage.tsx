import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

interface AgentDto {
  id: number
  name: string
  description: string
  model: string | null
}

export default function HomePage() {
  const [agents, setAgents] = useState<AgentDto[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [productName, setProductName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/agents').then((r) => {
      setAgents(r.data)
      if (r.data.length > 0) setSelected(r.data[0].id)
    })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/tasks', { agentId: selected, productName })
      navigate(`/tasks/${res.data.id}`)
    } catch (err: any) {
      setError(err.response?.data?.message ?? '提交失败')
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="hero">
        <div style={{ fontSize: 28, fontWeight: 700 }}>AI 智能体产品调研</div>
        <div className="prompt-row">
          | 输入产品名称 → 智能体自动调研 → 生成 PDF 报告 [预览/下载]
        </div>
        <div className="hint">tab 选择智能体 · enter 提交调研任务</div>
      </div>

      <div className="section">
        <div className="section-title">[+] 选择智能体</div>
        {agents.length === 0 && <p className="mute">暂无可用智能体，请联系管理员在后台添加。</p>}
        {agents.map((a) => (
          <div
            key={a.id}
            className="list-row"
            style={{ cursor: 'pointer' }}
            onClick={() => setSelected(a.id)}
          >
            <span>{selected === a.id ? '[x]' : '[ ]'}</span>
            <b>{a.name}</b>
            <span>{a.description}</span>
            {a.model && <span className="badge light">{a.model}</span>}
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-title">[+] 提交调研任务</div>
        <form onSubmit={submit}>
          <label>产品名称</label>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例如：小米SU7、iPhone 16、Notion"
            required
          />
          {error && <div className="error">[x] {error}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn" disabled={loading || !selected}>
              {loading ? '提交中…' : '开始调研 →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
