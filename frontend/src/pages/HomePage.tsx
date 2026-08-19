import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, currentUser } from '../api'
import { statusLabels, type TaskDto } from './TasksPage'

interface AgentDto {
  id: number
  name: string
  description: string
  model: string | null
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '上午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export default function HomePage() {
  const [agents, setAgents] = useState<AgentDto[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [productName, setProductName] = useState('')
  const [tasks, setTasks] = useState<TaskDto[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const navigate = useNavigate()
  const user = currentUser()

  useEffect(() => {
    api.get('/agents').then((r) => {
      setAgents(r.data)
      if (r.data.length > 0) setSelected(r.data[0].id)
    })
    api.get('/tasks').then((r) => setTasks(r.data.slice(0, 8)))
  }, [])

  const selectedAgent = agents.find((a) => a.id === selected)

  const submit = async () => {
    if (!selected || !productName.trim() || loading) return
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/tasks', { agentId: selected, productName: productName.trim() })
      navigate(`/tasks/${res.data.id}`)
    } catch (err: any) {
      setError(err.response?.data?.message ?? '提交失败')
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="home">
      <div className="home-greeting">
        {greeting()}，{user?.email?.split('@')[0] ?? '投资者'}！
      </div>

      <div className="prompt-card">
        <textarea
          ref={inputRef}
          rows={3}
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入产品名称，智能体自动调研并生成 PDF 报告，例如：小米SU7、iPhone 16、Notion…"
        />
        <div className="prompt-toolbar">
          <div className="prompt-tools">
            <div className="prompt-chip-wrap">
              <button
                type="button"
                className="prompt-chip"
                onClick={() => setAgentOpen((v) => !v)}
              >
                ✦ {selectedAgent ? selectedAgent.name : '选择智能体'} ▾
              </button>
              {agentOpen && (
                <div className="prompt-menu">
                  {agents.length === 0 && <div className="prompt-menu-item mute">暂无智能体</div>}
                  {agents.map((a) => (
                    <div
                      key={a.id}
                      className="prompt-menu-item"
                      onClick={() => {
                        setSelected(a.id)
                        setAgentOpen(false)
                      }}
                    >
                      <span>{selected === a.id ? '[x]' : '[ ]'}</span> <b>{a.name}</b>
                      <span className="mute"> {a.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedAgent?.model && <span className="badge light">{selectedAgent.model}</span>}
          </div>
          <button
            type="button"
            className="prompt-send"
            disabled={loading || !selected || !productName.trim()}
            onClick={submit}
            aria-label="开始调研"
          >
            {loading ? '…' : '↑'}
          </button>
        </div>
      </div>
      {error && <div className="error" style={{ textAlign: 'center' }}>[x] {error}</div>}
      <div className="home-hint">enter 提交 · shift+enter 换行 · 生成 PDF 报告可预览下载</div>

      <div className="home-row-head">
        <span>最近报告</span>
        <Link to="/tasks" className="mute">全部 →</Link>
      </div>
      <div className="recent-row">
        <div
          className="recent-card recent-new"
          onClick={() => inputRef.current?.focus()}
        >
          <div style={{ fontSize: 22 }}>+</div>
          <div>开始调研</div>
        </div>
        {tasks.map((t) => (
          <Link to={`/tasks/${t.id}`} key={t.id} className="recent-card">
            <div className="recent-title">{t.productName}</div>
            <div className="mute">{t.agentName}</div>
            <div className={`status-${t.status}`}>{statusLabels[t.status] ?? t.status}</div>
            <div className="mute" style={{ fontSize: 12 }}>
              {new Date(t.createdAt).toLocaleDateString('zh-CN')}
            </div>
          </Link>
        ))}
        {tasks.length === 0 && (
          <div className="recent-card mute" style={{ justifyContent: 'center' }}>
            暂无报告
          </div>
        )}
      </div>

      <div className="home-row-head">
        <span>亮点功能</span>
      </div>
      <div className="feature-grid">
        <Link to="/tasks" className="feature-card f-a">
          <b>调研报告 →</b>
          <span>PDF 预览 / 下载</span>
        </Link>
        <Link to="/plans" className="feature-card f-b">
          <b>收费套餐 →</b>
          <span>微信扫码 / 公众号支付</span>
        </Link>
        {user?.role === 'admin' && (
          <>
            <Link to="/admin/agents" className="feature-card f-c">
              <b>智能体管理 →</b>
              <span>提示词后台可编辑</span>
            </Link>
            <Link to="/admin/usage" className="feature-card f-d">
              <b>用量统计 →</b>
              <span>Token 用量 / 费用</span>
            </Link>
            <Link to="/admin/traces" className="feature-card f-e">
              <b>链路追踪 →</b>
              <span>LangGraph Trace</span>
            </Link>
            <Link to="/admin/providers" className="feature-card f-f">
              <b>模型供应商 →</b>
              <span>OpenAI 兼容 API</span>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
