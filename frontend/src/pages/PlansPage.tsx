import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
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

interface OrderDto {
  id: number
  outTradeNo: string
  planName: string
  amountFen: number
  tradeType: string
  status: string
  codeUrl: string
}

interface SubscriptionDto {
  remainingUses: number
  expiresAt: string | null
  yearlyActive: boolean
}

const isWeChat = /MicroMessenger/i.test(navigator.userAgent)

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanDto[]>([])
  const [sub, setSub] = useState<SubscriptionDto | null>(null)
  const [order, setOrder] = useState<OrderDto | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [params, setParams] = useSearchParams()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadSub = () => {
    api.get('/me/subscription').then((r) => setSub(r.data))
  }

  useEffect(() => {
    api.get('/plans').then((r) => setPlans(r.data))
    loadSub()
  }, [])

  // 微信内 OAuth 回跳：携带 openid + planId，直接发起 JSAPI 支付
  useEffect(() => {
    const openid = params.get('openid')
    const planId = params.get('planId')
    if (openid && planId) {
      setParams({}, { replace: true })
      void jsapiPay(Number(planId), openid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const startPolling = (orderId: number) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const r = await api.get(`/pay/orders/${orderId}`)
      if (r.data.status !== 'pending') {
        setOrder(r.data)
        if (pollRef.current) clearInterval(pollRef.current)
        if (r.data.status === 'paid') loadSub()
      }
    }, 3000)
  }

  const nativePay = async (planId: number) => {
    setError('')
    setPaying(true)
    try {
      const r = await api.post('/pay/orders', { planId, tradeType: 'native' })
      const o: OrderDto = r.data.order
      setOrder(o)
      setQrDataUrl(await QRCode.toDataURL(o.codeUrl, { margin: 1, width: 240 }))
      startPolling(o.id)
    } catch (err: any) {
      setError(err.response?.data?.message ?? '下单失败')
    } finally {
      setPaying(false)
    }
  }

  const jsapiPay = async (planId: number, openid: string) => {
    setError('')
    setPaying(true)
    try {
      const r = await api.post('/pay/orders', { planId, tradeType: 'jsapi', openid })
      const o: OrderDto = r.data.order
      setOrder(o)
      const p = r.data.payParams
      const bridge = (window as any).WeixinJSBridge
      if (bridge) {
        bridge.invoke('getBrandWCPayRequest', p, (res: any) => {
          if (res.err_msg === 'get_brand_wcpay_request:ok') startPolling(o.id)
          else setError('支付未完成')
        })
      } else {
        setError('请在微信内打开本页面完成支付')
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? '下单失败')
    } finally {
      setPaying(false)
    }
  }

  const buy = (p: PlanDto) => {
    if (isWeChat) {
      // 公众号 JSAPI：先走网页授权取 openid
      window.location.href = `/api/pay/oauth?state=${p.id}`
    } else {
      void nativePay(p.id)
    }
  }

  const closeOrder = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setOrder(null)
    setQrDataUrl('')
  }

  return (
    <div className="section">
      <div className="section-title">[+] 收费套餐</div>
      {sub && (
        <div className="card" style={{ marginBottom: 16 }}>
          <b>我的套餐</b>
          <p className="mute" style={{ margin: '8px 0 0' }}>
            {sub.yearlyActive && sub.expiresAt
              ? `[√] 年度套餐有效，到期时间：${new Date(sub.expiresAt).toLocaleDateString('zh-CN')}`
              : '[ ] 暂无有效年度套餐'}
            {' · '}剩余按次额度：{sub.remainingUses} 次
            {!sub.yearlyActive && sub.remainingUses === 0 && '（购买套餐后才能使用智能体）'}
          </p>
        </div>
      )}
      {error && <div className="error">[x] {error}</div>}

      {order && (
        <div className="card" style={{ textAlign: 'center' }}>
          {order.status === 'paid' ? (
            <>
              <p className="status-done" style={{ fontWeight: 700 }}>
                [√] 支付成功
              </p>
              <p className="mute">
                {order.planName} · ¥{(order.amountFen / 100).toFixed(2)} · 单号 {order.outTradeNo}
              </p>
              <button className="btn btn-secondary" onClick={closeOrder}>
                关闭
              </button>
            </>
          ) : (
            <>
              <p>
                <b>{order.planName}</b> · ¥{(order.amountFen / 100).toFixed(2)}
              </p>
              {qrDataUrl && (
                <>
                  <img src={qrDataUrl} alt="微信支付二维码" style={{ width: 240, height: 240 }} />
                  <p className="mute">[~] 请使用微信扫码支付，支付后自动确认…</p>
                </>
              )}
              <button className="btn btn-secondary" onClick={closeOrder}>
                取消
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid-2">
        {plans.map((p) => (
          <div className="card" key={p.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <b>{p.name}</b>
              <span className="badge">{billingTypeLabels[p.billingType] ?? p.billingType}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: '12px 0' }}>{planPriceText(p)}</div>
            <p className="mute">[+] {p.description}</p>
            <button className="btn" style={{ width: '100%' }} disabled={paying} onClick={() => buy(p)}>
              {isWeChat ? '微信支付' : '微信扫码支付'}
            </button>
          </div>
        ))}
      </div>
      {plans.length === 0 && <p className="mute">暂无可用套餐。</p>}
    </div>
  )
}
