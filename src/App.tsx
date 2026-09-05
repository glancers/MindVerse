import { useEffect } from 'react'
import NavRail from './components/NavRail'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import ContactsView from './components/ContactsView'
import FavoritesView from './components/FavoritesView'
import PersonaManager from './components/PersonaManager'
import SettingsDialog from './components/SettingsDialog'
import ConversationSetup from './components/ConversationSetup'
import Toaster from './components/common/Toaster'
import ConfirmHost from './components/common/ConfirmHost'
import { usePersonaStore } from './stores/personaStore'
import { useSettingsStore } from './stores/settingsStore'
import { useChatStore } from './stores/chatStore'
import { useUIStore } from './stores/uiStore'
import { isDesktopApp } from './utils/desktop'

/** 交互元素选择器：命中这些元素时不触发窗口拖拽（点击/输入优先） */
const INTERACTIVE =
  'button,input,textarea,select,a,option,label,[role="button"],[contenteditable="true"],[data-tauri-drag-region],[data-no-drag]'

/** 目标或其祖先是否可交互（自定义可点击元素用计算样式 cursor:pointer 识别） */
function isInteractive(t: HTMLElement): boolean {
  if (t.closest(INTERACTIVE)) return true
  // 沿祖先链找 cursor:pointer（Tailwind cursor-pointer 是本项目可点击元素的通用标记）
  let el: HTMLElement | null = t
  while (el) {
    if (getComputedStyle(el).cursor === 'pointer') return true
    el = el.parentElement
  }
  return false
}

/**
 * 桌面端全局拖拽：窗口内任意非交互区域 mousedown → startDragging。
 * 微信桌面端同款策略——空白处即可拖动，无需局限顶部。
 * 可点击的自定义元素约定加 cursor-pointer（或 data-no-drag）即自动豁免。
 */
function useGlobalDragBand() {
  useEffect(() => {
    if (!isDesktopApp) return
    const onMouseDown = async (e: MouseEvent) => {
      if (e.button !== 0) return
      const t = e.target as HTMLElement | null
      if (!t || isInteractive(t)) return
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().startDragging()
      } catch {
        // 拖拽失败静默（不影响点击语义）
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])
}

export default function App() {
  const mainView = useUIStore((s) => s.mainView)

  useGlobalDragBand()

  useEffect(() => {
    void usePersonaStore.getState().load()
    void useSettingsStore.getState().load()
    void useChatStore.getState().load()
  }, [])

  return (
    <div className="flex h-full overflow-hidden">
      <NavRail />
      {mainView === 'chat' ? (
        <>
          <Sidebar />
          <ChatWindow />
        </>
      ) : mainView === 'contacts' ? (
        <ContactsView />
      ) : (
        <FavoritesView />
      )}
      <PersonaManager />
      <SettingsDialog />
      <ConversationSetup />
      <Toaster />
      <ConfirmHost />
    </div>
  )
}
