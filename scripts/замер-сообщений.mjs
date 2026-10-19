/**
 * Замер ширины надписей синхронизации.
 *
 * Сообщение стоит в одной строке с кнопкой доступа, и места ему остаётся
 * ровно столько, сколько не заняла кнопка. Пока надпись короче этого места —
 * всё в порядке; пока длиннее — она переносится, полоса растёт, и шапка
 * прыгает вниз в тот самый момент, когда человек читает, что произошло с его
 * правкой.
 *
 * Проверка идёт по настоящим шрифтам и настоящему CSS: ширина строки в
 * символах ничего не значит — кириллица, цифры и знаки препинания весят
 * по-разному, а длинная надпись из «ёлочек» может оказаться короче короткой
 * из цифр.
 */
import { build } from 'esbuild'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ТЕСТ = `
import { СЛОВА } from '@/lib/syncMessages.ts'

const все = Object.entries(СЛОВА)
  .filter(([, значение]) => typeof значение === 'string')
  .map(([имя, текст]) => ({ имя, текст: String(текст) }))

export default все
`

const папка = join(new URL('../.git', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1'), 'замер')
rmSync(папка, { recursive: true, force: true })
mkdirSync(папка, { recursive: true })

const вход = join(папка, 'замер.mts')
const выход = join(папка, 'замер.mjs')
writeFileSync(вход, ТЕСТ, 'utf8')

await build({
  entryPoints: [вход],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: выход,
  logLevel: 'silent',
  alias: { '@': new URL('../src', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1') },
})

const надписи = (await import(pathToFileURL(выход).href)).default

const стили = (await import('node:fs')).readFileSync(
  join(new URL('../src', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1'), 'styles.css'),
  'utf8',
)

writeFileSync(
  join(папка, 'замер.html'),
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${стили}
body { padding: 16px; }
.строка { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.полоса { width: 460px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.плашка { display: flex; align-items: center; gap: 7px; flex: 0 1 auto; min-width: 0;
  font-size: 12px; padding: 6px 10px; border-radius: 8px;
  background: var(--bg-3); border: 1px solid var(--line); white-space: nowrap; }
.кнопка { flex: none; width: 150px; height: 37px; box-sizing: border-box;
  border: 1px solid var(--line); border-radius: 8px; }
.значок { width: 12px; height: 12px; border-radius: 50%; background: currentColor;
  opacity: .5; flex: none; }
</style></head><body>
<div id="стенд"></div>
<script>
const надписи = ${JSON.stringify(надписи)};
const стенд = document.getElementById('стенд');
// Полоса 460, кнопка 150, зазор 8 — столько плашке и остаётся.
const доступно = 460 - 150 - 8;
const результат = [];
for (const { имя, текст } of надписи) {
  const строка = document.createElement('div');
  строка.className = 'строка';
  строка.innerHTML =
    '<div class="полоса"><span class="плашка"><span class="текст"></span>' +
    '<span class="значок"></span></span><span class="кнопка"></span></div>';
  стенд.appendChild(строка);
  const узел = строка.querySelector('.текст');
  узел.textContent = текст;
  const ширина = узел.getBoundingClientRect().width;
  результат.push({ имя, текст, символов: текст.length, ширина: Math.round(ширина),
    влезает: ширина <= доступно - 12 });
}
window.__замер = { доступно: Math.round(доступно), результат };
</script></body></html>`,
  'utf8',
)

console.log(join(папка, 'замер.html'))
