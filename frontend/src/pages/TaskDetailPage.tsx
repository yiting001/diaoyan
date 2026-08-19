import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { statusLabels, type TaskDto } from './TasksPage'

interface ProgressEvent {
  time: string
  step: string
  message: string
  status: 'running' | 'done' | 'failed' | 'stopped'
}

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
  const logRef = useRef<HTMLDivElement>(null)

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
    es.addEventListener('status', (e) => {
      setTask(JSON.parse((e as MessageEvent).data))
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

      {task.status === 'done' && task.hasPdf && (
        <>
          <div style={{ margin: '16px 0', display: 'flex', gap: 12 }}>
            <a href={`${pdfUrl}&download=1`}>
              <button className="btn">下载 PDF ↓</button>
            </a>
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <button className="btn btn-secondary">新窗口打开</button>
            </a>
          </div>
          <iframe className="pdf-frame" src={pdfUrl} title="PDF 预览" />
        </>
      )}
    </div>
  )
}
