import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  root: '.',
  base: './',
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'lib/phaser.min.js',
          dest: '.'
        },
        {
          src: 'assets/**/*',
          dest: '.'
        }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    target: 'es2020',
    cssMinify: true,
    rollupOptions: {
      input: 'index.html'
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',  // 允许局域网访问，手机端调试用
    open: true,
    proxy: {
      // 联机请求直连 9720（ws:// / http://），此代理为备用
      '/api': 'http://localhost:9720'
    }
  }
})