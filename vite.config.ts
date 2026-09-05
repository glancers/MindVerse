import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 固定端口：IndexedDB 数据绑定源（含端口），端口漂移会导致数据"消失"
    port: 5175,
    strictPort: true,
    proxy: {
      // Rust 服务端（server/）：认证 + 业务 CRUD + LLM 代理
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      // 方舟接口的 CORS 不放行 Authorization 头，浏览器直连会被拦，走本地代理转发
      '/ark': {
        target: 'https://ark.cn-beijing.volces.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ark/, ''),
      },
    },
  },
})
