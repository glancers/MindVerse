import { useAuthStore } from '../stores/authStore'
import { logger } from '../utils/logger'

/** 统一 API 错误（映射现有 LLMError 语义：message + status） */
export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

/** 统一 fetch 封装：JWT 注入、错误归一、5 分钟超时 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { serverBase, token } = useAuthStore.getState()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000)
  try {
    const res = await fetch(serverBase + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const message = json?.error?.message || `请求失败(${res.status})`
      if (res.status === 401) {
        // 登录态失效：清除并提示（不强制跳转，用户可继续游客模式）
        logger.error('API 401:', message)
      }
      throw new ApiError(message, res.status)
    }
    return json as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (controller.signal.aborted) throw new ApiError('请求超时')
    throw new ApiError(err instanceof Error ? err.message : '网络错误')
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
