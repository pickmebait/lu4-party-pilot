/**
 * Проверка лендинга без браузера.
 *
 * Лендинг — единственный экран, который видит человек без токена, и ошибки
 * здесь дороже обычных: битый якорь уводит в пустоту, пропавший скриншот
 * оставляет рамку, а карточка входа без поля токена делает приложение
 * недоступным. Поэтому разметка рендерится на сервере и проверяется
 * по структуре, ссылкам, картинкам и состояниям входа.
 *
 * Отдельно проверяется сборка сессии: вход и создание пати идут через один
 * конструктор, и забытое поле ломает запросы уже после того, как экран входа
 * исчез.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ТЕСТ = `
import { renderToStaticMarkup } from 'react-dom/server'
import { Landing } from '@/components/Landing.tsx'
import { NotConfigured, TokenIssued } from '@/components/AuthStates.tsx'
import { partySession } from '@/lib/partyAuth.ts'
import { APP_NAME } from '@/lib/brand.ts'

const issued = { token: 'p2p_тест', name: 'Поросята', partyId: 'p_1' }

export const данные = {
  appName: APP_NAME,
  landing: renderToStaticMarkup(<Landing />),
  notConfigured: renderToStaticMarkup(<NotConfigured />),
  issued: renderToStaticMarkup(
    <TokenIssued party={issued} busy={false} onEnter={() => {}} />,
  ),
  sessionMaster: partySession(
    'p2p_тест',
    { partyId: 'p_1', name: 'Поросята', role: 'master', charId: null },
    '2026-11-14T10:00:00.000Z',
  ),
  sessionChar: partySession(
    'p2p_тест',
    { partyId: 'p_1', name: 'Поросята', role: 'char', charId: 'c_1' },
    '',
  ),
}
`

const папка = mkdtempSync(join(process.cwd(), 'node_modules', '.pp-landing-'))
const вход = join(папка, 'тест.tsx')
const выход = join(папка, 'тест.mjs')
writeFileSync(вход, ТЕСТ, 'utf8')

let данные
try {
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
    loader: { '.png': 'dataurl' },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify('https://api.example.test'),
      'import.meta.env.BASE_URL': JSON.stringify('/'),
    },
  })
  данные = (await import(pathToFileURL(выход).href)).данные
} finally {
  rmSync(папка, { recursive: true, force: true })
}

const { landing, notConfigured, issued, sessionMaster, sessionChar } = данные

let пройдено = 0
const ошибки = []
const равно = (подпись, получили, ждём) => {
  пройдено++
  if (JSON.stringify(получили) !== JSON.stringify(ждём)) {
    ошибки.push(подпись + ': получили ' + JSON.stringify(получили) + ', ждём ' + JSON.stringify(ждём))
  }
}
const есть = (подпись, текст, фрагмент) => {
  пройдено++
  if (!текст.includes(фрагмент)) ошибки.push(подпись + ': нет «' + фрагмент + '»')
}
const нет = (подпись, текст, фрагмент) => {
  пройдено++
  if (текст.includes(фрагмент)) ошибки.push(подпись + ': лишнее «' + фрагмент + '»')
}
const штук = (подпись, текст, образец, ждём) => {
  пройдено++
  const получили = (текст.match(образец) ?? []).length
  if (получили !== ждём) ошибки.push(подпись + ': получили ' + получили + ', ждём ' + ждём)
}

/* ------------------------------------------------------------- каркас страницы */

есть('лендинг в своей области', landing, '<div class="landing">')
есть('шапка на месте', landing, '<header class="site-head">')
есть('основной блок на месте', landing, '<main id="top">')
есть('подвал на месте', landing, '<footer class="footer">')
есть('подпись LU4.org', landing, '<span class="kicker">LU4.org</span>')
есть('главный заголовок', landing, 'Вся пати')
есть('вторая строка заголовка', landing, 'на одном экране')
есть('нет платных тарифов', landing, '<b>Без платных</b> тарифов')

for (const id of ['top', 'login', 'features', 'modules', 'start', 'roadmap']) {
  есть('есть раздел #' + id, landing, `id="${id}"`)
}

/* Идентификаторы не повторяются, иначе якорь ведёт не туда. */
const идентификаторы = [...landing.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
равно('id не повторяются', идентификаторы.length, new Set(идентификаторы).size)

/* Каждая внутренняя ссылка должна вести к существующему id. */
const якоря = [...new Set([...landing.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))]
for (const якорь of якоря) {
  пройдено++
  if (!идентификаторы.includes(якорь)) ошибки.push('якорь #' + якорь + ' ведёт в пустоту')
}

const меню = landing.match(/<nav class="nav"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? ''
есть('в меню есть «Возможности»', меню, '>Возможности<')
есть('в меню есть «Как начать»', меню, '>Как начать<')
есть('в меню есть «Развитие»', меню, '>Развитие<')

/* ------------------------------------------------------------ работающие модули */

есть('раздел называется «Что внутри»', landing, '>Что внутри<')
есть('персонажи подписаны', landing, '>Персонажи<')
есть('расписание подписано', landing, '>Расписание<')
есть('вид «Строка» на подписи', landing, 'вид «Строка»')
есть('режим «Ближайшее» на подписи', landing, '«Ближайшее»')

const картинки = [...landing.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
const РАЗМЕРЫ = [
  { width: 1440, height: 900 },
  { width: 1440, height: 760 },
]
равно('два настоящих скриншота', картинки.length, 2)
for (const [i, картинка] of картинки.entries()) {
  const номер = i + 1
  const размер = РАЗМЕРЫ[i]
  есть('скриншот ' + номер + ' встроен в сборку', картинка, 'src="data:image/png;base64,')
  есть('скриншот ' + номер + ' декодируется асинхронно', картинка, 'decoding="async"')
  есть('скриншот ' + номер + ' с шириной из макета', картинка, `width="${размер.width}"`)
  есть('скриншот ' + номер + ' с высотой из макета', картинка, `height="${размер.height}"`)
  есть('скриншот ' + номер + ' грузится лениво', картинка, 'loading="lazy"')
  есть('скриншот ' + номер + ' подписан', картинка, 'alt="Поросята:')
}
нет('внешних картинок нет', landing, 'src="http')

штук('три будущих модуля', landing, /<article class="module-card">/g, 3)
штук('у каждого модуля пометка «развитие»', landing, /class="status-tag"/g, 3)
есть('сводка в разработке', landing, '>Сводка<')
есть('казна в разработке', landing, '>Общая казна<')
есть('цели в разработке', landing, '>Цели<')

/* ---------------------------------------------------------------- шаги и развитие */

штук('три шага входа', landing, /<article class="step">/g, 3)
есть('шаг про создание', landing, 'Создайте пати')
есть('шаг про мастер-токен', landing, 'Сохраните мастер-токен')
есть('шаг про игроков', landing, 'Выдайте токены игрокам')

штук('три колонки развития', landing, /<article class="road-col">/g, 3)
штук('девять пунктов развития', landing, /class="road-item"/g, 9)
for (const статус of ['done', 'wip', 'next']) {
  штук('состояние ' + статус + ' на месте', landing, new RegExp(`class="status ${статус}"`, 'g'), 3)
}

/* -------------------------------------------------------------------- подвал */

const подвал = landing.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0] ?? ''
есть('в подвале название', подвал, данные.appName + ' · pre-alpha')
есть('в подвале ссылка на возможности', подвал, 'href="#features"')
есть('в подвале ссылка на старт', подвал, 'href="#start"')
есть('в подвале ссылка на развитие', подвал, 'href="#roadmap"')

/* ---------------------------------------------------------------------- вход */

штук('на первом экране одна карточка входа', landing, /<div class="auth-card">/g, 1)
есть('карточка входа стоит у якоря #login', landing, '<div class="auth-slot" id="login">')
есть('заголовок карточки', landing, '<h2>Вход в пати</h2>')
есть('поле токена подписано', landing, '<label for="party-token">Токен пати</label>')
есть('поле токена имеет id', landing, 'id="party-token"')
есть('подсказка формата токена', landing, 'placeholder="p2p_…"')
есть('вкладка входа выбрана', landing, 'aria-pressed="true"')
есть('вкладка создания на месте', landing, '>Создать пати</button>')
есть('есть отдельная кнопка входа', landing, 'class="btn primary wide"')
есть('токен хранится в браузере', landing, 'хранится только в этом браузере')
есть('пометка pre-alpha', landing, 'class="auth-badge">pre-alpha')
нет('настроенная сборка не показывает ошибку', landing, 'Приложение не настроено')

есть('состояние без адреса базы', notConfigured, 'Const Party Pilot не настроен')
есть('в состоянии без базы объяснение', notConfigured, 'VITE_API_URL')

есть('токен созданной пати показан', issued, 'Пати «Поросята» создана')
есть('токен целиком на экране', issued, '<code>p2p_тест</code>')
есть('токен копируется', issued, 'Скопировать')
есть('предупреждение о показе один раз', issued, 'показывается один раз')
есть('вход в созданную пати', issued, 'Войти в пати')

/* ------------------------------------------------------------------ сессия */

равно('токен попал в сессию', sessionMaster.token, 'p2p_тест')
равно('пати попала в сессию', sessionMaster.partyId, 'p_1')
равно('название пати попало в сессию', sessionMaster.name, 'Поросята')
равно('право мастера сохранено', sessionMaster.role, 'master')
равно('у мастера нет персонажа', sessionMaster.charId, null)
равно('адрес базы взят из сборки', sessionMaster.apiUrl, 'https://api.example.test')
равно('метка сервера сохранена', sessionMaster.lastSyncedAt, '2026-11-14T10:00:00.000Z')
равно('токен персонажа сохраняет charId', sessionChar.charId, 'c_1')
равно('пустая метка сервера допустима', sessionChar.lastSyncedAt, '')

if (ошибки.length) {
  console.error(`ПРОВАЛЕНО ${ошибки.length} из ${пройдено}:`)
  for (const ошибка of ошибки) console.error('  ✗ ' + ошибка)
  process.exit(1)
}
console.log(`ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${пройдено})`)
