import type { MessageAttachment } from '../types'

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 图片 ≤ 10MB
export const MAX_TEXT_SIZE = 200 * 1024 // 文本文件 ≤ 200KB
export const MAX_ATTACHMENTS = 6 // 每条消息最多 6 个附件

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'yml', 'yaml', 'html', 'htm',
  'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'kt', 'c', 'h',
  'cpp', 'hpp', 'sh', 'sql', 'toml', 'ini', 'conf', 'log', 'env',
])

function extOf(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** 是否按文本处理：明确 text/* mime 或常见代码/文档扩展名 */
export function isTextFile(file: File) {
  if (file.type.startsWith('text/')) return true
  if (/^(application\/(json|xml|yaml|toml|javascript))$/.test(file.type)) return true
  return TEXT_EXTS.has(extOf(file.name))
}

export function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('文件读取失败'))
    r.readAsDataURL(file)
  })
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('文件读取失败'))
    r.readAsText(file)
  })
}

/** 把用户文件读成消息附件；超限抛错（调用方 toast） */
export async function readAttachment(file: File): Promise<MessageAttachment> {
  const base = { name: file.name, mime: file.type || 'application/octet-stream', size: file.size }
  if (isImageFile(file)) {
    if (file.size > MAX_IMAGE_SIZE) throw new Error(`图片「${file.name}」超过 10MB 限制`)
    return { ...base, kind: 'image', dataUrl: await readAsDataURL(file) }
  }
  if (isTextFile(file)) {
    if (file.size > MAX_TEXT_SIZE) throw new Error(`文本文件「${file.name}」超过 200KB 限制`)
    return { ...base, kind: 'text', text: await readAsText(file) }
  }
  return { ...base, kind: 'file' }
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
