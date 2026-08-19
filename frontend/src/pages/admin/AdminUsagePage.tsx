import { useEffect, useState } from 'react'
import { api } from '../../api'

interface Summary {
  totals: { inputTokens: number; outputTokens: number; cost: number; calls: number }
  byModel: { model: string; inputTokens: number; outputTokens: number; cost: number; calls: number }[]
  byUser: { email: string; inputTokens: number; outputTokens: number; cost: number }[]
}

interface UsageRow {
  id: number
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  taskId: number | null
  createdAt: string
  user: { email: string } | null
}

export default function AdminUsagePage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<UsageRow[]>([])

  useEffect(() => {
    api.get('/admin/usage/summary').then((r) => setSummary(r.data))
    api.get('/admin/usage').then((r) => setRows(r.data))
  }, [])

  return (
    <div className="section">
      <div className="section-title">[+] Token 用量与费用统计</div>

      {summary && (
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="card soft">
            <div className="mute">LLM 调用次数</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.totals.calls ?? 0}</div>
          </div>
          <div className="card soft">
            <div className="mute">输入 Tokens</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.totals.inputTokens ?? 0}</div>
          </div>
          <div className="card soft">
            <div className="mute">输出 Tokens</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.totals.outputTokens ?? 0}</div>
          </div>
          <div className="card soft">
            <div className="mute">总费用 ($)</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {Number(summary.totals.cost ?? 0).toFixed(6)}
            </div>
          </div>
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 24 }}>
        <div>
          <div className="section-title">按模型</div>
          <table>
            <thead>
              <tr>
                <th>模型</th>
                <th>调用</th>
                <th>in / out</th>
                <th>费用($)</th>
              </tr>
            </thead>
            <tbody>
              {summary?.byModel.map((m) => (
                <tr key={m.model}>
                  <td>{m.model}</td>
                  <td>{m.calls}</td>
                  <td>
                    {m.inputTokens} / {m.outputTokens}
                  </td>
                  <td>{Number(m.cost).toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="section-title">按用户</div>
          <table>
            <thead>
              <tr>
                <th>用户</th>
                <th>in / out</th>
                <th>费用($)</th>
              </tr>
            </thead>
            <tbody>
              {summary?.byUser.map((u) => (
                <tr key={u.email}>
                  <td>{u.email}</td>
                  <td>
                    {u.inputTokens} / {u.outputTokens}
                  </td>
                  <td>{Number(u.cost).toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 24 }}>
        明细（最近 200 条）
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>用户</th>
            <th>模型</th>
            <th>任务</th>
            <th>in / out</th>
            <th>费用($)</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.user?.email}</td>
              <td>{r.model}</td>
              <td>{r.taskId ?? '-'}</td>
              <td>
                {r.inputTokens} / {r.outputTokens}
              </td>
              <td>{Number(r.cost).toFixed(6)}</td>
              <td className="mute">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
