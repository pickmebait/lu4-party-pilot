import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/*
 * Номер сборки.
 *
 * По нему открытая вкладка узнаёт, что на сайте уже лежит новая версия.
 * В GitHub Actions есть SHA коммита — он и становится номером. Локально
 * хватает времени сборки: сравнивать его не с чем, кроме самого себя.
 */
const buildId = process.env.GITHUB_SHA?.slice(0, 12) || String(Date.now())

// base: './' — собранная статика должна работать и по пути https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    {
      /*
       * version.json рядом с index.html.
       *
       * Отдельный маленький файл, а не поле в index.html: index.html
       * кешируется агрессивнее, и старая вкладка могла бы не заметить
       * обновление. Этот файл запрашивается с no-store и меткой времени.
       */
      name: 'version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: `${JSON.stringify({ build: buildId })}\n`,
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
