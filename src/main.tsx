import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initTheme } from './stores/themeStore'
import { useAuthStore } from './stores/authStore'
import { isDesktopApp } from './utils/desktop'
import { logger } from './utils/logger'
import './index.css'

/** 桌面端：等内嵌服务就绪，拿到随机端口后注入 serverBase（只进内存，不落 localStorage） */
async function waitForServerBase() {
  if (!isDesktopApp) return
  document.body.classList.add('mv-desktop')
  const { invoke } = await import('@tauri-apps/api/core')
  // 服务在 Tauri setup 里异步拉起，前端可能先到：轮询等端口（上限 10s）
  for (let i = 0; i < 100; i++) {
    try {
      const port = await invoke<number>('get_server_port')
      useAuthStore.setState({ serverBase: `http://127.0.0.1:${port}` })
      logger.info(`desktop server ready: 127.0.0.1:${port}`)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  logger.error('桌面端内嵌服务启动超时，降级为纯本地模式')
}

waitForServerBase().finally(() => {
  // 首帧前应用皮肤，避免闪烁
  initTheme()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
