import { useEffect, useState } from 'react'
import { api } from '../../api'

interface SpanDto {
  id: number
  name: string
  status: string
  startedAt: string
  endedAt: string
  input: string
  output: string
  inputTokens: number
  outputTokens: number
}

interface TraceDto {
  id: number
  taskId: number
  name: string
  status: string
  startedAt: string
  endedAt: string | null
  spans?: SpanDto[]
}

function duration(a?: string | null, b?: string | null) {
  if (!a || !b) return '-'
  return `${((new Date(b).getTime() - new Date(a).getTime()) / 1000).toFixed(1)}s`
}

export default function AdminTracesPage() {
  const [traces, setTraces] = useState<TraceDto[]>([])
  const [detail, setDetail] = useState<TraceDto | null>(null)

  useEffect(() => {
    api.get('/admin/traces').then((r) => setTraces(r.data))
  }, [])

  const open = (id: number) => api.get(`/admin/traces/${id}`).then((r) => setDetail(r.data))

  return (
    <div className="section">
      <div className="section-title">[+] 链路追踪（LangGraph 执行轨迹）</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>名称</th>
            <th>任务</th>
            <th>状态</th>
            <th>耗时</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>{t.name}</td>
              <td>{t.taskId}</td>
              <td className={`status-${t.status}`}>{t.status}</td>
              <td>{duration(t.startedAt, t.endedAt)}</td>
              <td>
                <button className="btn btn-secondary btn-sm" onClick={() => open(t.id)}>
                  查看 Spans
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail && (
        <div style={{ marginTop: 24 }}>
          <div className="section-title">
            Trace #{detail.id} · {detail.name}
          </div>
          {detail.spans?.map((s) => (
            <div className="card" key={s.id}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <b>{s.name}</b>
                <span className={`status-${s.status}`}>[{s.status}]</span>
                <span className="mute">{duration(s.startedAt, s.endedAt)}</span>
                <span className="mute">
                  tokens: {s.inputTokens}↑ {s.outputTokens}↓
                </span>
              </div>
              {s.input && (
                <details>
                  <summary className="mute">输入</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{s.input}</pre>
                </details>
              )}
              {s.output && (
                <details>
                  <summary className="mute">输出</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{s.output}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
