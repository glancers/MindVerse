import { useUIStore } from '../stores/uiStore'
import { usePersonaStore } from '../stores/personaStore'
import { isDesktopApp } from '../utils/desktop'

/** 线性图标基座：微信形状 + 细线描边 */
function WeChatLineIcon({
  size = 24,
  children,
}: {
  size?: number
  children: React.ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** 聊天：微信风格气泡（线性） */
function ChatBubbleIcon({ size }: { size?: number }) {
  return (
    <WeChatLineIcon size={size}>
      <path d="M12 3.5c-4.5 0-8.2 3.2-8.2 7.2 0 2.2 1.1 4.2 2.9 5.5l-.8 3.3c-.1.5.4.9.8.6l3.9-2.4c.44.08.9.12 1.4.12 4.5 0 8.2-3.2 8.2-7.2S16.5 3.5 12 3.5z" />
    </WeChatLineIcon>
  )
}

/** 通讯录：微信风格卡片 + 人形（线性） */
function ContactsIcon({ size }: { size?: number }) {
  return (
    <WeChatLineIcon size={size}>
      <rect x="2.5" y="3" width="19" height="18" rx="4" />
      <circle cx="12" cy="9.8" r="2.9" />
      <path d="M6.8 18.4c.6-2.2 2.7-3.6 5.2-3.6s4.6 1.4 5.2 3.6" />
    </WeChatLineIcon>
  )
}

/** 收藏：微信风格五角星（线性） */
function FavoritesIcon({ size }: { size?: number }) {
  return (
    <WeChatLineIcon size={size}>
      <path d="M12 3.1l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3.1z" />
    </WeChatLineIcon>
  )
}

/** 设置：微信风格齿轮（线性） */
function SettingsGearIcon({ size }: { size?: number }) {
  return (
    <WeChatLineIcon size={size}>
      <path d="M10.4 2.6h3.2l.5 2.1c.6.2 1.2.4 1.7.8l1.9-1.1 2.3 2.3-1.1 1.9c.3.5.6 1.1.8 1.7l2.1.5v3.2l-2.1.5c-.2.6-.4 1.2-.8 1.7l1.1 1.9-2.3 2.3-1.9-1.1c-.5.3-1.1.6-1.7.8l-.5 2.1h-3.2l-.5-2.1c-.6-.2-1.2-.4-1.7-.8l-1.9 1.1-2.3-2.3 1.1-1.9c-.3-.5-.6-1.1-.8-1.7l-2-.5v-3.2l2.1-.5c.2-.6.4-1.2.8-1.7L3.4 6.7l2.3-2.3 1.9 1.1c.5-.3 1.1-.6 1.7-.8l.5-2.1z" />
      <circle cx="12" cy="12" r="3.9" />
    </WeChatLineIcon>
  )
}

/** LOGO：星球气泡（气泡 + 带环星球 = 思维宇宙） */
export function LogoIcon({ size }: { size?: number }) {
  return (
    <WeChatLineIcon size={size}>
      <rect x="3.5" y="4" width="17" height="12.5" rx="4" />
      <path d="M7.5 16.5l-1.2 3.8c-.16.5.37.9.8.64l4-4.44" />
      <circle cx="12" cy="10.2" r="2.6" />
      <ellipse cx="12" cy="10.2" rx="4.4" ry="1.6" transform="rotate(-18 12 10.2)" />
    </WeChatLineIcon>
  )
}

export default function NavRail() {
  const mainView = useUIStore((s) => s.mainView)
  const setMainView = useUIStore((s) => s.setMainView)
  const openSettings = useUIStore((s) => s.openSettings)

  const itemCls = (active: boolean) =>
    `w-[40px] h-[40px] flex items-center justify-center relative ${
      active ? 'text-mv-accent' : 'text-mv-ink-3 hover:text-mv-ink'
    }`

  return (
    <div
      className={`w-[56px] bg-mv-rail flex flex-col items-center pb-3 shrink-0 h-full ${
        isDesktopApp ? '' : 'pt-3'
      }`}
    >
      {/* 桌面端顶部：给 macOS 红黄绿按钮留位（trafficLightPosition 定位于此）。
           其余空白区由 App.tsx 的全局拖拽兜底处理 */}
      {isDesktopApp && (
        <div className="h-[38px] w-full shrink-0" data-tauri-drag-region />
      )}
      <button
        onClick={() => setMainView('contacts')}
        aria-label="通讯录"
        title="通讯录"
        className="w-[36px] h-[36px] rounded-[4px] bg-gradient-to-br from-[var(--mv-logo-from)] to-[var(--mv-logo-to)] flex items-center justify-center mb-4 overflow-hidden text-white"
      >
        <LogoIcon size={22} />
      </button>
      <div className="flex-1 flex flex-col items-center gap-1">
        <button
          onClick={() => setMainView('chat')}
          aria-label="聊天"
          title="聊天"
          className={itemCls(mainView === 'chat')}
        >
          <ChatBubbleIcon size={24} />
          {mainView === 'chat' && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-mv-accent rounded-r" />
          )}
        </button>
        <button
          onClick={() => setMainView('contacts')}
          aria-label="通讯录"
          title="通讯录"
          className={itemCls(mainView === 'contacts')}
        >
          <ContactsIcon size={24} />
          {mainView === 'contacts' && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-mv-accent rounded-r" />
          )}
        </button>
        <button
          onClick={() => setMainView('favorites')}
          aria-label="收藏"
          title="收藏"
          className={itemCls(mainView === 'favorites')}
        >
          <FavoritesIcon size={24} />
          {mainView === 'favorites' && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-mv-accent rounded-r" />
          )}
        </button>
      </div>
      <button
        aria-label="设置"
        title="设置"
        onClick={openSettings}
        className="w-[40px] h-[40px] flex items-center justify-center text-mv-ink-3 hover:text-mv-ink shrink-0"
      >
        <SettingsGearIcon size={24} />
      </button>
    </div>
  )
}
