import { create } from 'zustand'
import {
  BACKGROUNDS,
  DEFAULT_THEME,
  THEMES,
  THEME_DEFAULT_BG,
  type BackgroundId,
  type ThemeId,
} from '../themes/themes'

const KEY = 'mv-theme'
const BG_KEY = 'mv-theme-bg' // {themeId: backgroundId}，按主题记忆背景选择

/** favicon 跟随主题：读当前生效的 --mv-logo-from/to 重新生成星球气泡 SVG（rAF 等 CSS 变量就绪） */
function updateFavicon() {
  requestAnimationFrame(() => {
    const cs = getComputedStyle(document.documentElement)
    const from = cs.getPropertyValue('--mv-logo-from').trim() || '#4f6ef7'
    const to = cs.getPropertyValue('--mv-logo-to').trim() || '#7c3aed'
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) return
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'><defs>` +
      `<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
      `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>` +
      `</linearGradient></defs><rect width='36' height='36' rx='6' fill='url(#g)'/>` +
      `<g transform='translate(6 5)' fill='none' stroke='#fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>` +
      `<rect x='3.5' y='4' width='17' height='12.5' rx='4'/>` +
      `<path d='M7.5 16.5l-1.2 3.8c-.16.5.37.9.8.64l4-4.44'/>` +
      `<circle cx='12' cy='10.2' r='2.6'/>` +
      `<ellipse cx='12' cy='10.2' rx='4.4' ry='1.6' transform='rotate(-18 12 10.2)'/>` +
      `</g></svg>`
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg)
  })
}

function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id
  updateFavicon()
}

function readBgMap(): Partial<Record<ThemeId, BackgroundId>> {
  try {
    const raw = localStorage.getItem(BG_KEY)
    return raw ? (JSON.parse(raw) as Partial<Record<ThemeId, BackgroundId>>) : {}
  } catch {
    return {}
  }
}

function applyBackground(id: BackgroundId) {
  const bg = BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0]
  const root = document.documentElement
  if (bg.url) {
    root.style.setProperty('--mv-bg-image', `url(${bg.url})`)
    root.style.setProperty('--mv-bg-mask', bg.mask)
    root.classList.add('has-bg')
  } else {
    root.style.removeProperty('--mv-bg-image')
    root.style.removeProperty('--mv-bg-mask')
    root.classList.remove('has-bg')
  }
}

function isValid(id: string | null): id is ThemeId {
  return THEMES.some((t) => t.id === id)
}

/** 首帧渲染前调用：读 localStorage 并挂 data-theme + 背景，避免主题闪烁 */
export function initTheme() {
  const saved = localStorage.getItem(KEY)
  const id = isValid(saved) ? saved : DEFAULT_THEME
  applyTheme(id)
  const map = readBgMap()
  const bg = map[id] ?? THEME_DEFAULT_BG[id] ?? 'none'
  applyBackground(bg)
  useThemeStore.setState({ theme: id, backgrounds: map })
}

interface ThemeState {
  theme: ThemeId
  /** 各主题当前选的背景 */
  backgrounds: Partial<Record<ThemeId, BackgroundId>>
  /** 当前主题生效中的背景（含默认值兜底） */
  currentBackground: () => BackgroundId
  setTheme: (id: ThemeId) => void
  setBackground: (bg: BackgroundId) => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,
  backgrounds: {},

  currentBackground() {
    const { theme, backgrounds } = get()
    return backgrounds[theme] ?? THEME_DEFAULT_BG[theme] ?? 'none'
  },

  setTheme(id) {
    localStorage.setItem(KEY, id)
    // 切换期间挂上过渡类，颜色平滑渐变到新皮肤
    const root = document.documentElement
    root.classList.add('theme-anim')
    applyTheme(id)
    // 切主题时应用该主题记忆的背景
    const bg = get().backgrounds[id] ?? THEME_DEFAULT_BG[id] ?? 'none'
    applyBackground(bg)
    set({ theme: id })
    window.setTimeout(() => root.classList.remove('theme-anim'), 350)
  },

  setBackground(bg) {
    const { theme } = get()
    const backgrounds = { ...get().backgrounds, [theme]: bg }
    localStorage.setItem(BG_KEY, JSON.stringify(backgrounds))
    applyBackground(bg)
    set({ backgrounds })
  },
}))
