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

interface ModelDto {
  id: number
  name: string
  model: string
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
  const [models, setModels] = useState<ModelDto[]>([])
  const [modelId, setModelId] = useState<number | null>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const [productName, setProductName] = useState('')
  const [tasks, setTasks] = useState<TaskDto[]>([])
  const [error, setError] = useState('')
  const [needPlan, setNeedPlan] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const navigate = useNavigate()
  const user = currentUser()

  useEffect(() => {
    api.get('/agents').then((r) => {
      setAgents(r.data)
      if (r.data.length > 0) setSelected(r.data[0].id)
    })
    api.get('/models').then((r) => setModels(r.data)).catch(() => setModels([]))
    api.get('/tasks').then((r) => setTasks(r.data.slice(0, 8)))
  }, [])

  const selectedAgent = agents.find((a) => a.id === selected)
  const selectedModel = models.find((m) => m.id === modelId)

  const submit = async () => {
    if (!selected || !productName.trim() || loading) return
    setError('')
    setNeedPlan(false)
    setNeedLogin(false)
    if (!user || user.isGuest) {
      setError('请先注册登录后再生成报告')
      setNeedLogin(true)
      return
    }
    setLoading(true)
    try {
      const res = await api.post('/tasks', {
        agentId: selected,
        productName: productName.trim(),
        ...(modelId ? { providerId: modelId } : {}),
      })
      navigate(`/tasks/${res.data.id}`)
    } catch (err: any) {
      const msg = err.response?.data?.message ?? '提交失败'
      setError(msg)
      if (err.response?.status === 403) {
        if (String(msg).includes('登录')) setNeedLogin(true)
        else setNeedPlan(true)
      }
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
        {greeting()}，{user && !user.isGuest ? user.email.split('@')[0] : '投资者'}！
      </div>
      <div className="home-tagline">企业战略和价值投资双重视角</div>

      <div className="prompt-card">
        <textarea
          ref={inputRef}
          rows={3}
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入需要调研的上市公司准确名称或者代码信息"
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
            <div className="prompt-chip-wrap">
              <button
                type="button"
                className="prompt-chip"
                onClick={() => setModelOpen((v) => !v)}
              >
                ◈ {selectedModel ? selectedModel.name : selectedAgent?.model ? `默认（${selectedAgent.model}）` : '选择模型'} ▾
              </button>
              {modelOpen && (
                <div className="prompt-menu">
                  <div
                    className="prompt-menu-item"
                    onClick={() => {
                      setModelId(null)
                      setModelOpen(false)
                    }}
                  >
                    <span>{modelId === null ? '[x]' : '[ ]'}</span> <b>智能体默认模型</b>
                    {selectedAgent?.model && <span className="mute"> {selectedAgent.model}</span>}
                  </div>
                  {models.map((m) => (
                    <div
                      key={m.id}
                      className="prompt-menu-item"
                      onClick={() => {
                        setModelId(m.id)
                        setModelOpen(false)
                      }}
                    >
                      <span>{modelId === m.id ? '[x]' : '[ ]'}</span> <b>{m.name}</b>
                      <span className="mute"> {m.model}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
      {error && (
        <div className="error" style={{ textAlign: 'center' }}>
          [x] {error}
          {needPlan && (
            <>
              {' '}
              <Link to="/plans">去购买套餐 →</Link>
            </>
          )}
          {needLogin && (
            <>
              {' '}
              <Link to="/login">去登录 / 注册 →</Link>
            </>
          )}
        </div>
      )}
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

    </div>
  )
}
