import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { statusLabels, type TaskDto } from './TasksPage'

export default function TaskDetailPage() {
  const { id } = useParams()
  const [task, setTask] = useState<TaskDto | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const load = () =>
      api.get(`/tasks/${id}`).then((r) => {
        setTask(r.data)
        if ((r.data.status === 'done' || r.data.status === 'failed') && timer) {
          clearInterval(timer)
        }
      })
    load()
    timer = setInterval(load, 3000)
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [id])

  if (!task) return <p className="mute">加载中…</p>

  const token = localStorage.getItem('token')
  const pdfUrl = `/api/tasks/${task.id}/pdf?token=${token}`

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
      </div>

      {task.status === 'failed' && <div className="error">[x] 生成失败：{task.error}</div>}
      {(task.status === 'pending' || task.status === 'running') && (
        <p className="mute">[~] 智能体正在调研中，页面会自动刷新…</p>
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
