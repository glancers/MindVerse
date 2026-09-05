import type { Provider, ProviderType } from '../../types'
import { logger } from '../../utils/logger'
import { useAuthStore } from '../../stores/authStore'

/** OpenAI 风格多模态内容 part（Anthropic 转换在发送前做） */
export type LLMContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface LLMChatMessage {
  role: 'user' | 'assistant'
  content: string | LLMContentPart[]
  name?: string
}

/** Anthropic 图片格式：dataURL → base64 source（解析失败降级为占位文本） */
function toAnthropicContent(content: string | LLMContentPart[]) {
  if (typeof content === 'string') return content
  return content.map((p) => {
    if (p.type === 'text') return { type: 'text', text: p.text }
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(p.image_url.url)
    if (!m) return { type: 'text', text: '[不支持的图片格式]' }
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }
  })
}

export class LLMError extends Error {
  providerName: string
  status?: number
  constructor(message: string, providerName: string, status?: number) {
    super(message)
    this.providerName = providerName
    this.status = status
  }
}

export class LLMAbortedError extends Error {
  constructor() {
    super('aborted')
  }
}

/** 上游请求统一 5 分钟超时（收到 chunk 即重置计时） */
const TIMEOUT_MS = 5 * 60 * 1000

function joinURL(base: string, path: string) {
  return base.replace(/\/+$/, '') + path
}

/** 相对路径的 baseURL（方舟 /ark/...，浏览器端靠 vite 代理）：
 *  桌面端没有代理，补全为内嵌服务地址，由服务端 /ark 透传出网 */
function resolveBase(provider: { baseURL: string }): string {
  const { serverBase } = useAuthStore.getState()
  return provider.baseURL.startsWith('/') ? serverBase + provider.baseURL : provider.baseURL
}

function buildHeaders(provider: Provider): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider.type === 'anthropic') {
    headers['x-api-key'] = provider.apiKey
    headers['anthropic-version'] = '2023-06-01'
    // Anthropic 官方接口需要此头才允许浏览器直连
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  } else {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  }
  return headers
}

/** 手写 SSE 解析：按空行切事件、取 data 行 JSON，容错 [DONE] 与坏行（回调抛错正常上抛） */
async function readSSE(res: Response, onData: (json: any) => void, resetTimeout: () => void) {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let json: any
        try {
          json = JSON.parse(payload)
        } catch {
          logger.debug('SSE parse skip:', payload.slice(0, 50))
          continue
        }
        onData(json)
      }
    }
    resetTimeout()
  }
}

/**
 * 服务器模式流式对话：POST /api/chat（服务端持 Key 调上游，SSE 透传 delta/done/error）。
 * 复用本地模式的超时与中止语义。
 */
async function streamChatViaServer(opts: {
  provider: Provider
  model: string
  system: string
  messages: LLMChatMessage[]
  signal: AbortSignal
  onDelta: (text: string) => void
}): Promise<string> {
  const { provider, model, system, messages, signal, onDelta } = opts
  const { serverBase, token } = useAuthStore.getState()

  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const resetTimeout = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, TIMEOUT_MS)
  }
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort)
  resetTimeout()

  logger.info(`LLM(server) start provider=${provider.name} model=${model}`)
  let full = ''
  try {
    const res = await fetch(serverBase + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ providerId: provider.id, model, system, messages }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new LLMError(`请求失败(${res.status}): ${text.slice(0, 200)}`, provider.name, res.status)
    }
    await readSSE(
      res,
      (json) => {
        if (typeof json.delta === 'string' && json.delta) {
          full += json.delta
          onDelta(json.delta)
        } else if (typeof json.error === 'string' && json.error) {
          throw new LLMError(json.error, provider.name)
        }
      },
      resetTimeout,
    )
    logger.info('LLM(server) done length=' + full.length)
    return full
  } catch (err) {
    if (timedOut) throw new LLMError('请求超时（5 分钟无响应）', provider.name)
    if (signal.aborted) throw new LLMAbortedError()
    if (err instanceof LLMError) throw err
    throw new LLMError(err instanceof Error ? err.message : '网络错误', provider.name)
  } finally {
    if (timer) clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

export async function streamChat(opts: {
  provider: Provider
  model: string
  system: string
  messages: LLMChatMessage[]
  signal: AbortSignal
  onDelta: (text: string) => void
  onReasoning?: (text: string) => void
}): Promise<string> {
  // 服务器模式：不直连上游，走后端 /api/chat（服务端持 Key）
  if (useAuthStore.getState().loggedIn) {
    return streamChatViaServer(opts)
  }
  const { provider, model, system, messages, signal, onDelta } = opts
  const isAnthropic = provider.type === 'anthropic'
  const url = isAnthropic
    ? joinURL(provider.baseURL, '/v1/messages')
    : joinURL(provider.baseURL, '/chat/completions')

  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const resetTimeout = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, TIMEOUT_MS)
  }
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort)
  resetTimeout()

  let body: string
  if (isAnthropic) {
    body = JSON.stringify({
      model,
      stream: true,
      max_tokens: 4096,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })
  } else {
    body = JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content, ...(m.name ? { name: m.name } : {}) })),
      ],
    })
  }

  logger.info(`LLM start provider=${provider.name} model=${model} keyLen=${provider.apiKey.length}`)
  let full = ''
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(provider),
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new LLMError(`请求失败(${res.status}): ${text.slice(0, 200)}`, provider.name, res.status)
    }
    await readSSE(
      res,
      (json) => {
        if (isAnthropic) {
          if (json.type === 'content_block_delta' && json.delta?.text) {
            full += json.delta.text
            onDelta(json.delta.text)
          }
        } else {
          const delta = json.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) {
            full += delta
            onDelta(delta)
          }
        }
      },
      resetTimeout,
    )
    logger.info('LLM done length=' + full.length)
    return full
  } catch (err) {
    if (timedOut) throw new LLMError('请求超时（5 分钟无响应）', provider.name)
    if (signal.aborted) throw new LLMAbortedError()
    if (err instanceof LLMError) throw err
    throw new LLMError(err instanceof Error ? err.message : '网络错误', provider.name)
  } finally {
    if (timer) clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

/** 连通性测试：非流式极短消息（测试用短超时即可，30s）；服务器模式走后端代理 */
export async function testProvider(provider: Provider, model: string): Promise<number> {
  if (useAuthStore.getState().loggedIn) {
    const start = Date.now()
    const { serverBase, token } = useAuthStore.getState()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch(serverBase + '/api/chat/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ providerId: provider.id, model }),
        signal: controller.signal,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new LLMError(
          json?.error?.message || `HTTP ${res.status}`,
          provider.name,
          res.status,
        )
      }
      return json?.latencyMs ?? Date.now() - start
    } finally {
      clearTimeout(timer)
    }
  }
  const start = Date.now()
  const isAnthropic = provider.type === 'anthropic'
  const url = isAnthropic
    ? joinURL(resolveBase(provider), '/v1/messages')
    : joinURL(resolveBase(provider), '/chat/completions')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const body = isAnthropic
      ? JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] })
      : JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }] })
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(provider),
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new LLMError(`HTTP ${res.status}: ${text.slice(0, 120)}`, provider.name, res.status)
    }
    return Date.now() - start
  } finally {
    clearTimeout(timer)
  }
}

/** 方舟 AgentPlan 端点不提供 /models，接口失败时用官方模型清单兜底 */
export const ARK_PLAN_MODELS: string[] = [
  'doubao-seed-evolving',
  'doubao-seed-2.0-lite',
  'doubao-seed-2.0-mini',
  'glm-5.3',
  'glm-latest',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'minimax-m3',
  'kimi-k3',
  'kimi-k2.7-code',
  'ark-code-latest',
]

/** 从服务商拉取模型列表（OpenAI 兼容 GET /models；Anthropic GET /v1/models）；
 *  服务器模式走后端代理（要求 provider 已保存，服务端才有 Key） */
export async function fetchModels(provider: {
  id?: string
  type: ProviderType
  baseURL: string
  apiKey: string
}): Promise<string[]> {
  if (useAuthStore.getState().loggedIn) {
    if (!provider.id) {
      throw new LLMError('服务器模式下请先保存服务商，再获取模型列表', provider.type)
    }
    const { serverBase, token } = useAuthStore.getState()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch(`${serverBase}/api/providers/${provider.id}/models`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new LLMError(json?.error?.message || `HTTP ${res.status}`, provider.type, res.status)
      }
      return json as string[]
    } finally {
      clearTimeout(timer)
    }
  }
  const url =
    provider.type === 'anthropic'
      ? joinURL(resolveBase(provider), '/v1/models')
      : joinURL(resolveBase(provider), '/models')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(url, { headers: buildHeaders(provider as Provider), signal: controller.signal })
    if (!res.ok) {
      throw new LLMError(`HTTP ${res.status}`, provider.type, res.status)
    }
    const json = await res.json()
    const list: unknown[] = json?.data ?? json?.models ?? []
    const ids = list
      .map((m) => (typeof m === 'object' && m !== null ? ((m as any).id ?? (m as any).name) : null))
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
    return [...new Set(ids)].sort()
  } finally {
    clearTimeout(timer)
  }
}
