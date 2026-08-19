import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

export interface TaskDto {
  id: number
  productName: string
  status: string
  error: string
  agentName: string
  inputTokens: number
  outputTokens: number
  cost: number
  createdAt: string
  hasPdf: boolean
}

export const statusLabels: Record<string, string> = {
  pending: '排队中',
  running: '调研中',
  done: '已完成',
  failed: '失败',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskDto[]>([])

  const load = () => api.get('/tasks').then((r) => setTasks(r.data))

  useEffect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="section">
      <div className="section-title">[+] 我的调研报告</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>产品</th>
            <th>智能体</th>
            <th>状态</th>
            <th>Tokens</th>
            <th>费用($)</th>
            <th>时间</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>{t.productName}</td>
              <td>{t.agentName}</td>
              <td className={`status-${t.status}`}>{statusLabels[t.status] ?? t.status}</td>
              <td>
                {t.inputTokens + t.outputTokens > 0
                  ? `${t.inputTokens}↑ ${t.outputTokens}↓`
                  : '-'}
              </td>
              <td>{t.cost ? t.cost.toFixed(6) : '-'}</td>
              <td className="mute">{new Date(t.createdAt).toLocaleString('zh-CN')}</td>
              <td>
                <Link to={`/tasks/${t.id}`}>查看 →</Link>
              </td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={8} className="mute">
                暂无任务，去首页提交一个产品调研吧。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
