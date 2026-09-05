import { create } from 'zustand'

const TOKEN_KEY = 'mindverse_token'
const SERVER_KEY = 'mindverse_server'

interface AuthState {
  /** 服务器地址（dev 走 vite 代理留空即可，生产同源） */
  serverBase: string
  token: string
  username: string
  loggedIn: boolean
  setServerBase: (url: string) => void
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
}

function readStored(): { serverBase: string; token: string; username: string } {
  return {
    serverBase: localStorage.getItem(SERVER_KEY) ?? '',
    token: localStorage.getItem(TOKEN_KEY) ?? '',
    username: localStorage.getItem(SERVER_KEY + '_username') ?? '',
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  const stored = readStored()

  async function authRequest(path: string, body: unknown): Promise<{ token: string; user: { username: string } }> {
    const res = await fetch(get().serverBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(json?.error?.message || `请求失败(${res.status})`)
    }
    return json
  }

  function persist(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(SERVER_KEY + '_username', username)
    set({ token, username, loggedIn: true })
  }

  return {
    serverBase: stored.serverBase,
    token: stored.token,
    username: stored.username,
    loggedIn: !!stored.token,

    setServerBase(url) {
      const normalized = url.replace(/\/+$/, '')
      localStorage.setItem(SERVER_KEY, normalized)
      set({ serverBase: normalized })
    },

    async login(username, password) {
      const out = await authRequest('/api/auth/login', { username, password })
      persist(out.token, out.user.username)
    },

    async register(username, password) {
      const out = await authRequest('/api/auth/register', { username, password })
      persist(out.token, out.user.username)
    },

    logout() {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(SERVER_KEY + '_username')
      set({ token: '', username: '', loggedIn: false })
      // 切回本地模式：重载页面让各 store 回本地数据源
      window.location.reload()
    },
  }
})
