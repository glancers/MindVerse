/** 皮肤主题元数据（配色本体在 index.css 的 [data-theme] 块里） */

export type ThemeId = 'classic' | 'midnight' | 'bluefantasy' | 'sakura' | 'gothic' | 'paper'

export interface ThemeMeta {
  id: ThemeId
  name: string
  desc: string
  dark: boolean
  /** 选择面板里的迷你预览色板 */
  swatch: { rail: string; bg: string; panel: string; accent: string; bubbleMe: string }
}

export const DEFAULT_THEME: ThemeId = 'classic'

export const THEMES: ThemeMeta[] = [
  {
    id: 'classic',
    name: '微信绿',
    desc: '经典绿白，熟悉的手感',
    dark: false,
    swatch: { rail: '#EDEDED', bg: '#F5F5F5', panel: '#FFFFFF', accent: '#07C160', bubbleMe: '#95EC69' },
  },
  {
    id: 'midnight',
    name: '墨夜',
    desc: '深色夜间，护眼低调',
    dark: true,
    swatch: { rail: '#15171B', bg: '#1C1F24', panel: '#22252B', accent: '#31C07A', bubbleMe: '#95EC69' },
  },
  {
    id: 'bluefantasy',
    name: '蓝色幻想',
    desc: '深海蓝调，沉浸幻想',
    dark: true,
    swatch: { rail: '#0A1226', bg: '#0E1830', panel: '#141F3A', accent: '#4C8DFF', bubbleMe: '#3B6FD4' },
  },
  {
    id: 'sakura',
    name: '樱粉',
    desc: '柔和粉调，轻盈日常',
    dark: false,
    swatch: { rail: '#F5E6EB', bg: '#FAF2F4', panel: '#FFFFFF', accent: '#E46A8C', bubbleMe: '#F6C1D2' },
  },
  {
    id: 'gothic',
    name: '哥特虚空',
    desc: '暗紫虚空，神秘氛围',
    dark: true,
    swatch: { rail: '#0E0B14', bg: '#14101B', panel: '#1A1524', accent: '#A78BFA', bubbleMe: '#4E3B85' },
  },
  {
    id: 'paper',
    name: '宣纸',
    desc: '米白纸感，朱砂点墨',
    dark: false,
    swatch: { rail: '#E9E2D2', bg: '#F2EDE2', panel: '#FBF8F0', accent: '#B04A3A', bubbleMe: '#DFD3B4' },
  },
]

/* ===== 背景壁纸库（与主题解耦：任意主题可配任意壁纸，按主题记忆） ===== */

export type BackgroundId = 'none' | 'forest' | 'aurora' | 'sakura' | 'inkwash' | 'starry' | 'gothicvoid'

export interface BackgroundMeta {
  id: BackgroundId
  name: string
  /** public/ 下的壁纸路径 */
  url: string
  /** 压在壁纸上的可读性蒙层（前景文字对比度保障） */
  mask: string
}

export const BACKGROUNDS: BackgroundMeta[] = [
  { id: 'none', name: '无背景', url: '', mask: 'none' },
  {
    id: 'forest',
    name: '雾林晨绿',
    url: '/backgrounds/misty-green-forest.jpg',
    mask: 'rgba(245, 247, 244, 0.55)',
  },
  {
    id: 'aurora',
    name: '深蓝极光',
    url: '/backgrounds/deep-blue-aurora.jpg',
    mask: 'rgba(6, 12, 30, 0.45)',
  },
  {
    id: 'sakura',
    name: '樱色柔光',
    url: '/backgrounds/sakura-blossom.jpg',
    mask: 'rgba(250, 240, 243, 0.55)',
  },
  {
    id: 'inkwash',
    name: '水墨远山',
    url: '/backgrounds/ink-wash-mountains.jpg',
    mask: 'rgba(242, 237, 226, 0.45)',
  },
  {
    id: 'starry',
    name: '星夜群山',
    url: '/backgrounds/dark-starry-mountains.jpg',
    mask: 'rgba(8, 12, 24, 0.5)',
  },
  {
    id: 'gothicvoid',
    name: '哥特虚空',
    url: '/backgrounds/gothic-void-crusade.jpg',
    mask: 'rgba(10, 8, 16, 0.5)',
  },
]

/** 各主题的默认壁纸（用户未选过时的初始值） */
export const THEME_DEFAULT_BG: Partial<Record<ThemeId, BackgroundId>> = {
  gothic: 'gothicvoid',
}
