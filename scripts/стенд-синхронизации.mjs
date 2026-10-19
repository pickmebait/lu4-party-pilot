/**
 * Стенд для плашки синхронизации.
 *
 * Кладёт настоящий styles.css и статическую разметку настоящего компонента в
 * один файл, чтобы посмотреть глазами: сообщение должно стоять слева от
 * кнопки доступа в одной строке, и шапка не должна прыгать вниз, когда
 * надпись появляется.
 *
 * Разметка отрисована тем же react-dom/server, что и в приложении, поэтому
 * расхождение возможно только в стилях — а их как раз и смотрем.
 */
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ТЕСТ = `
import { renderToStaticMarkup } from 'react-dom/server'
import { SyncMessage } from '@/components/SyncMessage.tsx'
import { СЛОВА } from '@/lib/syncMessages.ts'

const плашка = (текст, детали) =>
  renderToStaticMarkup(
    <SyncMessage вид="сделано" сообщение={{ текст, детали, убратьЧерезМс: 4000 }} />,
  )

const под = (открыто, текст, детали) =>
  '<div class="sync-note">' +
  '<div class="sync-msg ok"><span class="sync-text">' + текст + '</span>' +
  '<button class="sync-info' + (открыто ? ' on' : '') + '">i</button></div>' +
  (открыто ? '<pre class="sync-details">' + детали + '</pre>' : '') +
  '</div>'

/* Меню доступа рисуем картинкой: нам важна его ширина, а не содержимое. */
const меню =
  '<div class="sync-main">' +
  '<button class="party-btn">Моя пати · мастер</button>' +
  '</div>'

export default [
  '<div class="top"><div class="top-l"><h1>Const Party Pilot</h1></div><div class="sync">' +
    плашка(СЛОВА.сохранено, 'Адрес: https://пример\\nКод ответа: 200') +
    меню +
  '</div></div>',
  '<div class="top"><div class="top-l"><h1>Const Party Pilot</h1></div><div class="sync">' +
    плашка(СЛОВА.нетСвязи, 'Адрес: https://пример\\nКод ответа: нет ответа — обрыв связи') +
    меню +
  '</div></div>',
  '<div class="top"><div class="top-l"><h1>Const Party Pilot</h1></div><div class="sync">' +
    под(true, СЛОВА.сохранено, 'Адрес: https://пример\\nКод ответа: 200\\nПопыток: 1') +
    меню +
  '</div></div>',
  '<div class="top"><div class="top-l"><h1>Const Party Pilot</h1></div><div class="sync">' +
    меню +
  '</div></div>',
].join('\\n<hr>\\n')
`

const папка = join(new URL('../.git', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1'), 'стенд')
const вход = join(папка, 'стенд.tsx')
const выход = join(папка, 'стенд.mjs')

rmSync(папка, { recursive: true, force: true })
mkdirSync(папка, { recursive: true })
writeFileSync(вход, ТЕСТ, 'utf8')

await build({
  entryPoints: [вход],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: выход,
  jsx: 'automatic',
  logLevel: 'silent',
  packages: 'external',
  alias: { '@': new URL('../src', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1') },
})

const модуль = await import(pathToFileURL(выход).href)
const куски = модуль.default

const стили = readFileSync(
  join(new URL('../src', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1'), 'styles.css'),
)

writeFileSync(
  join(папка, 'стенд.html'),
  `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>Стенд плашки синхронизации</title>
<style>${стили}
body { padding: 24px; }
.top { margin-bottom: 24px; }
hr { border: 0; border-top: 1px solid #333; margin: 24px 0; }
.party-btn { font: inherit; padding: 6px 12px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--bg-3); color: var(--text); }
</style></head>
<body>${куски}</body></html>`,
  'utf8',
)

console.log(join(папка, 'стенд.html'))
