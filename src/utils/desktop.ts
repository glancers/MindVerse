/** 是否运行在 Tauri 桌面端（WKWebView 会注入该内部对象） */
export const isDesktopApp =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
