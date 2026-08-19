import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api, currentUser } from '../api'
import PdfPreview from '../components/PdfPreview'
import { statusLabels, type TaskDto } from './TasksPage'

interface ProgressEvent {
  time: string
  step: string
  message: string
  status: 'running' | 'done' | 'failed' | 'stopped'
}

interface StreamEvent {
  node: string
  channel: 'reasoning' | 'content'
  delta: string
  reset?: boolean
}

const nodeLabel = (node: string) =>
  node === 'outline' ? '规划大纲' : node.startsWith('section:') ? `撰写「${node.slice(8)}」` : node

const stepIcons: Record<string, string> = {
  start: '[>]',
  web_search: '[@]',
  outline: '[#]',
  section: '[¶]',
  pdf: '[▤]',
  done: '[+]',
  failed: '[x]',
  stopped: '[-]',
}

export default function TaskDetailPage() {
  const { id } = useParams()
  const [task, setTask] = useState<TaskDto | null>(null)
  const [events, setEvents] = useState<ProgressEvent[]>([])
  const [stopping, setStopping] = useState(false)
  const [stream, setStream] = useState<{ node: string; reasoning: string; content: string } | null>(null)
  const [showReasoning, setShowReasoning] = useState(true)
  const streamRef = useRef<HTMLDivElement>(null)
  const [unlocking, setUnlocking] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const user = currentUser()

  useEffect(() => {
    api.get(`/tasks/${id}`).then((r) => {
      setTask(r.data)
      setEvents(r.data.progress ?? [])
    })
  }, [id])

  const running = task && (task.status === 'pending' || task.status === 'running')

  useEffect(() => {
    if (!running) return
    const token = localStorage.getItem('token')
    const es = new EventSource(`/api/tasks/${id}/events?token=${token}`)
    es.addEventListener('progress', (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as ProgressEvent
      setEvents((prev) =>
        prev.some((p) => p.time === ev.time && p.message === ev.message) ? prev : [...prev, ev],
      )
    })
    es.addEventListener('stream', (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as StreamEvent
      setStream((prev) => {
        if (ev.reset || !prev || prev.node !== ev.node)
          return { node: ev.node, reasoning: '', content: '' }
        return {
          ...prev,
          reasoning: ev.channel === 'reasoning' ? prev.reasoning + ev.delta : prev.reasoning,
          content: ev.channel === 'content' ? prev.content + ev.delta : prev.content,
        }
      })
    })
    es.addEventListener('status', (e) => {
      setTask(JSON.parse((e as MessageEvent).data))
      setStream(null)
      es.close()
    })
    es.onerror = () => {
      es.close()
      setTimeout(() => api.get(`/tasks/${id}`).then((r) => setTask(r.data)), 2000)
    }
    return () => es.close()
  }, [id, running])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [events])

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight })
  }, [stream])

  if (!task) return <p className="mute">加载中…</p>

  const token = localStorage.getItem('token')
  const pdfUrl = `/api/tasks/${task.id}/pdf?token=${token}`

  const stop = async () => {
    setStopping(true)
    try {
      await api.post(`/tasks/${task.id}/stop`)
    } catch {
      setStopping(false)
    }
  }

  const unlock = async () => {
    if (user?.isGuest) {
      navigate(`/login?from=/tasks/${task.id}`)
      return
    }
    setUnlocking(true)
    try {
      const r = await api.post(`/tasks/${task.id}/unlock`)
      setTask(r.data)
    } catch (err: any) {
      if (err.response?.status === 403) navigate(`/plans?back=/tasks/${task.id}`)
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div className="section">
      <div className="section-title">
        [+] {task.productName} · 调研报告 #{task.id}
      </div>
      <div className="list-row">
        <span>
          状态：<b className={`status-${task.status}`}>{statusLabels[task.status] ?? task.status}</b>
        </span>
        <span>智能体：{task.agentName}</span>
        {task.model && <span>模型：{task.model}</span>}
        <span>
          Tokens：{task.inputTokens}↑ {task.outputTokens}↓
        </span>
        <span>费用：${task.cost?.toFixed(6) ?? 0}</span>
        {running && (
          <button className="btn btn-secondary" onClick={stop} disabled={stopping}>
            {stopping ? '正在停止…' : '停止任务 ■'}
          </button>
        )}
      </div>

      {running && (
        <p className="mute">[~] 智能体在后台执行，可随时离开本页面，回来即可查看进度。</p>
      )}
      {task.status === 'failed' && <div className="error">[x] 生成失败：{task.error}</div>}
      {task.status === 'stopped' && <p className="mute">[-] 任务已被停止。</p>}

      {events.length > 0 && (
        <div className="progress-log" ref={logRef}>
          {events.map((e, i) => (
            <div key={i} className={`progress-line progress-${e.status}`}>
              <span className="progress-time">
                {new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
              <span className="progress-icon">{stepIcons[e.step] ?? '[·]'}</span>
              <span>{e.message}</span>
            </div>
          ))}
          {running && <div className="progress-line progress-running blink">[~] 执行中…</div>}
        </div>
      )}

      {running && stream && (stream.reasoning || stream.content) && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>[▸] 模型实时输出 · {nodeLabel(stream.node)}</b>
            {stream.reasoning && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowReasoning((v) => !v)}>
                {showReasoning ? '隐藏思考过程' : '显示思考过程'}
              </button>
            )}
          </div>
          <div
            ref={streamRef}
            style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {showReasoning && stream.reasoning && (
              <div className="mute" style={{ fontStyle: 'italic', borderLeft: '3px solid #ccc', paddingLeft: 8, marginBottom: 8 }}>
                💭 {stream.reasoning}
              </div>
            )}
            {stream.content}
            <span className="blink">▍</span>
          </div>
        </div>
      )}

      {task.status === 'done' && task.unlocked && task.hasPdf && (
        <>
          <div style={{ margin: '16px 0', display: 'flex', gap: 12 }}>
            <a href={`${pdfUrl}&download=1`}>
              <button className="btn">下载 PDF ↓</button>
            </a>
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <button className="btn btn-secondary">新窗口打开</button>
            </a>
          </div>
          <PdfPreview url={`/tasks/${task.id}/pdf`} />
        </>
      )}

      {task.status === 'done' && !task.unlocked && (
        <div className="paywall">
          <div
            className="paywall-preview"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(marked.parse(task.preview ?? '', { async: false })),
            }}
          />
          <div className="paywall-fade" />
          <div className="paywall-cta">
            <div className="paywall-title">[锁] 报告已生成，以上仅为开头预览</div>
            <p className="mute">
              {user?.isGuest
                ? '注册登录并购买套餐后，即可查看完整报告并下载 PDF（游客期间的报告会保留到您的账号）'
                : '购买套餐后即可解锁完整报告并下载 PDF'}
            </p>
            <button className="btn" onClick={unlock} disabled={unlocking}>
              {unlocking ? '处理中…' : user?.isGuest ? '注册 / 登录解锁完整报告' : '付费解锁完整报告'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
