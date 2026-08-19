import { useEffect, useState } from 'react'
import { api, billingTypeLabels } from '../api'

export interface PlanDto {
  id: number
  name: string
  description: string
  billingType: string
  basePrice: number
  tokenPricePer1K: number
  active: boolean
}

export function planPriceText(p: PlanDto): string {
  switch (p.billingType) {
    case 'per_use':
      return `¥${p.basePrice} / 次`
    case 'yearly':
      return `¥${p.basePrice} / 年`
    case 'yearly_plus_token':
      return `¥${p.basePrice} / 年 + ¥${p.tokenPricePer1K} / 1K tokens`
    case 'per_use_plus_token':
      return `¥${p.basePrice} / 次 + ¥${p.tokenPricePer1K} / 1K tokens`
    default:
      return `¥${p.basePrice}`
  }
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanDto[]>([])

  useEffect(() => {
    api.get('/plans').then((r) => setPlans(r.data))
  }, [])

  return (
    <div className="section">
      <div className="section-title">[+] 收费套餐</div>
      <div className="grid-2">
        {plans.map((p) => (
          <div className="card" key={p.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <b>{p.name}</b>
              <span className="badge">{billingTypeLabels[p.billingType] ?? p.billingType}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: '12px 0' }}>{planPriceText(p)}</div>
            <p className="mute">[+] {p.description}</p>
            <button className="btn" style={{ width: '100%' }}>
              选择该套餐
            </button>
          </div>
        ))}
      </div>
      {plans.length === 0 && <p className="mute">暂无可用套餐。</p>}
    </div>
  )
}
