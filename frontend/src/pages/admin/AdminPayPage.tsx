import { useEffect, useState } from 'react'
import { api } from '../../api'

interface PayConfig {
  appId: string
  appSecret: string
  mchId: string
  serialNo: string
  apiV3Key: string
  publicKeyId: string
  notifyUrl: string
  enabled: boolean
  hasPrivateKey: boolean
  hasCert: boolean
  hasPublicKey: boolean
}

interface AdminOrder {
  id: number
  outTradeNo: string
  planName: string
  amountFen: number
  tradeType: string
  status: string
  userEmail: string
  createdAt: string
}

const orderStatusLabels: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  closed: '已关闭',
  failed: '失败',
}

export default function AdminPayPage() {
  const [cfg, setCfg] = useState<PayConfig | null>(null)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null)
  const [certFile, setCertFile] = useState<File | null>(null)
  const [p12File, setP12File] = useState<File | null>(null)
  const [p12Password, setP12Password] = useState('')
  const [publicKeyFile, setPublicKeyFile] = useState<File | null>(null)

  const load = () => {
    api.get('/admin/pay/config').then((r) => setCfg(r.data))
    api.get('/admin/pay/orders').then((r) => setOrders(r.data))
  }
  useEffect(load, [])

  if (!cfg) return <p className="mute">加载中…</p>

  const set = (k: keyof PayConfig, v: string | boolean) => setCfg({ ...cfg, [k]: v } as PayConfig)

  const save = async () => {
    setMsg('')
    setError('')
    setSaving(true)
    try {
      const r = await api.put('/admin/pay/config', {
        appId: cfg.appId,
        appSecret: cfg.appSecret,
        mchId: cfg.mchId,
        serialNo: cfg.serialNo,
        apiV3Key: cfg.apiV3Key,
        publicKeyId: cfg.publicKeyId,
        notifyUrl: cfg.notifyUrl,
        enabled: cfg.enabled,
      })
      setCfg(r.data)
      setMsg('配置已保存')
    } catch (err: any) {
      setError(err.response?.data?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const uploadCerts = async () => {
    setMsg('')
    setError('')
    if (!privateKeyFile && !certFile && !p12File && !publicKeyFile) {
      setError('请选择要上传的证书文件')
      return
    }
    const form = new FormData()
    if (privateKeyFile) form.append('privateKey', privateKeyFile)
    if (certFile) form.append('cert', certFile)
    if (p12File) form.append('p12', p12File)
    if (p12Password) form.append('p12Password', p12Password)
    if (publicKeyFile) form.append('publicKey', publicKeyFile)
    setSaving(true)
    try {
      const r = await api.post('/admin/pay/cert', form)
      setCfg(r.data)
      setMsg('证书上传成功')
      setPrivateKeyFile(null)
      setCertFile(null)
      setP12File(null)
      setPublicKeyFile(null)
    } catch (err: any) {
      setError(err.response?.data?.message ?? '上传失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="section">
      <div className="section-title">[+] 微信支付配置（APIv3）</div>
      {msg && <p className="status-done">[√] {msg}</p>}
      {error && <div className="error">[x] {error}</div>}

      <div className="grid-2">
        <div className="card">
          <b>基础参数</b>
          <label>公众号 AppID</label>
          <input value={cfg.appId} onChange={(e) => set('appId', e.target.value)} placeholder="wx1234567890abcdef" />
          <label>公众号 AppSecret（JSAPI 网页授权用）</label>
          <input value={cfg.appSecret} onChange={(e) => set('appSecret', e.target.value)} placeholder="填写后保存，显示为掩码" />
          <label>商户号 MchID</label>
          <input value={cfg.mchId} onChange={(e) => set('mchId', e.target.value)} placeholder="1600000000" />
          <label>APIv3 密钥（32 位）</label>
          <input value={cfg.apiV3Key} onChange={(e) => set('apiV3Key', e.target.value)} placeholder="填写后保存，显示为掩码" />
          <label>支付结果通知地址 notify_url（公网 https）</label>
          <input value={cfg.notifyUrl} onChange={(e) => set('notifyUrl', e.target.value)} placeholder="https://your-domain.com/api/pay/notify" />
          <label>证书序列号（上传证书后自动识别，可手动修改）</label>
          <input value={cfg.serialNo} onChange={(e) => set('serialNo', e.target.value)} />
          <label>微信支付公钥ID（公钥模式，形如 PUB_KEY_ID_...）</label>
          <input value={cfg.publicKeyId} onChange={(e) => set('publicKeyId', e.target.value)} placeholder="PUB_KEY_ID_0000000000000024101100397200000006" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            启用微信支付
          </label>
          <div style={{ marginTop: 16 }}>
            <button className="btn" disabled={saving} onClick={save}>
              保存配置
            </button>
          </div>
        </div>

        <div className="card">
          <b>商户证书 / 私钥上传</b>
          <p className="mute">
            当前状态：私钥 {cfg.hasPrivateKey ? '[√] 已配置' : '[x] 未配置'} · 证书{' '}
            {cfg.hasCert ? '[√] 已配置' : '[x] 未配置'} · 微信支付公钥{' '}
            {cfg.hasPublicKey ? '[√] 已配置' : '[x] 未配置'}
          </p>
          <label>方式一：p12 证书文件（apiclient_cert.p12）</label>
          <input type="file" accept=".p12,.pfx" onChange={(e) => setP12File(e.target.files?.[0] ?? null)} />
          <label>p12 密码（默认为商户号，可留空）</label>
          <input value={p12Password} onChange={(e) => setP12Password(e.target.value)} placeholder="留空则使用商户号" />
          <label style={{ marginTop: 16 }}>方式二：PEM 私钥文件（apiclient_key.pem）</label>
          <input type="file" accept=".pem,.key" onChange={(e) => setPrivateKeyFile(e.target.files?.[0] ?? null)} />
          <label>PEM 证书文件（apiclient_cert.pem）</label>
          <input type="file" accept=".pem,.crt,.cer" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
          <label style={{ marginTop: 16 }}>微信支付公钥文件（pub_key.pem，公钥模式验签用，配合上方公钥ID）</label>
          <input type="file" accept=".pem" onChange={(e) => setPublicKeyFile(e.target.files?.[0] ?? null)} />
          <div style={{ marginTop: 16 }}>
            <button className="btn" disabled={saving} onClick={uploadCerts}>
              上传证书
            </button>
          </div>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 32 }}>
        [+] 支付订单
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>订单号</th>
            <th>用户</th>
            <th>套餐</th>
            <th>金额</th>
            <th>方式</th>
            <th>状态</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.outTradeNo}</td>
              <td>{o.userEmail}</td>
              <td>{o.planName}</td>
              <td>¥{(o.amountFen / 100).toFixed(2)}</td>
              <td>{o.tradeType === 'native' ? '扫码' : '公众号'}</td>
              <td className={`status-${o.status === 'paid' ? 'done' : o.status === 'pending' ? 'pending' : 'failed'}`}>
                {orderStatusLabels[o.status] ?? o.status}
              </td>
              <td>{new Date(o.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p className="mute">暂无订单。</p>}
    </div>
  )
}
