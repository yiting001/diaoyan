import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers['x-access-token'] = token
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && location.pathname !== '/login') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (location.pathname.startsWith('/admin') || location.pathname === '/account') {
        location.href = '/login'
      } else {
        // 游客 token 失效：刷新后自动重新创建游客会话
        location.reload()
      }
    }
    return Promise.reject(err)
  },
)

export interface AuthUser {
  id: number
  email: string
  role: 'user' | 'admin'
  isGuest?: boolean
}

export function currentUser(): AuthUser | null {
  const raw = localStorage.getItem('user')
  return raw ? JSON.parse(raw) : null
}

export function setAuth(token: string, user: AuthUser) {
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
}

export function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  location.href = '/'
}

// 未登录时自动创建游客会话，打开即可使用
export async function ensureAuth(): Promise<AuthUser> {
  const existing = currentUser()
  if (existing && localStorage.getItem('token')) return existing
  const res = await api.post('/auth/guest')
  setAuth(res.data.token, res.data.user)
  return res.data.user
}

export const billingTypeLabels: Record<string, string> = {
  per_use: '按次收费',
  yearly: '按年付费',
  yearly_plus_token: '按年 + Token 计价',
  per_use_plus_token: '按次 + Token 计价',
}
