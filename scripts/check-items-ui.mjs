/**
 * Проверка выбора предметов и ячеек снаряжения на настоящем справочнике.
 *
 * Пикер и ячейки правятся руками, и компилятор пропускает то, что видно
 * только глазом: фильтр с типом, которого нет в данных, разворот эффектов,
 * у которого не осталось кнопки, или вторая половина парного предмета,
 * у которой почему-то снова появились свои кнопки заточки.
 *
 * Компоненты вызываются с настоящими данными из public/items.json, разметка
 * проверяется по кускам. Клики не нажимаются — проверяем, что кнопки есть,
 * подписаны и стоят не там, где им быть нельзя.
 *
 * Запуск: node scripts/check-items-ui.mjs
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const путьКаталога = new URL('../public/items.json', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1')

const ТЕСТ = `
import { renderToStaticMarkup } from 'react-dom/server'
import { ItemPicker } from '@/components/ItemPicker.tsx'
import { GearStack } from '@/components/GearStack.tsx'
import { SLOTS } from '@/types.ts'
import { предметы } from './данные.mjs'

const каталог = {
  loading: false, catalog: { items: предметы }, error: null, count: предметы.length,
  source: 'проверка', byId: (id) => предметы.find((i) => i.id === id) ?? null,
  nameOf: (id) => предметы.find((i) => i.id === id)?.name ?? ('Предмет #' + id),
  search: () => [], countMatching: () => 0, all: () => предметы, knownIds: new Set(),
}

let пройдено = 0
const ошибки = []
const есть = (подпись, разметка, кусок) => {
  пройдено++
  if (!разметка.includes(кусок)) ошибки.push(подпись + '\\n      нет в разметке: ' + кусок + '\\n      разметка: ' + разметка.slice(0, 800))
}
const нет = (подпись, разметка, кусок) => {
  пройдено++
  if (разметка.includes(кусок)) ошибки.push(подпись + '\\n      лишнее в разметке: ' + кусок)
}

const пусто = (n) => Array.from({ length: n }, () => null)
const пустыеСлоты = () => ({
  rhand: пусто(1), lhand: пусто(1), head: пусто(1), chest: пусто(1), legs: пусто(1),
  gloves: пусто(1), feet: пусто(1), neck: пусто(1), ear: пусто(2), ring: пусто(2),
})

/** Разметка ячейки-призрака: у неё класс заканчивается на « ghost». */
const призрак = (разметка) => {
  const i = разметка.indexOf(' ghost"')
  if (i === -1) return ''
  const start = разметка.lastIndexOf('<div', i)
  const next = разметка.indexOf('class="gear-cell', i + 1)
  return next === -1 ? разметка.slice(start) : разметка.slice(start, next)
}

const ветка = { charId: 'c1', subId: 's1' }

/* --- Пикер оружия: фильтр по типу и разворот эффектов. --- */

const сSA = предметы.find((i) => i.slot === 'r_hand' && i.saEffects?.length)
const пикерОружия = renderToStaticMarkup(
  <ItemPicker catalog={каталог} slot={SLOTS.rhand} accepts={(i) => i.id === сSA.id} onPick={() => {}} onClose={() => {}} />,
)
есть('у оружия с SA есть разворот эффектов', пикерОружия, 'Эффекты')
есть('у оружия показан фильтр по типу', пикерОружия, 'Тип оружия')
есть('название оружия в списке', пикерОружия, сSA.name)
// Грейда S в базе нет: если он всплывёт в фильтре, это старая привычка.
нет('грейда S в фильтре нет', пикерОружия, '>S<span class="chip-count"')

/* --- Пикер бижутерии: свой фильтр типа. --- */

const серьга = предметы.find((i) => i.slot === 'l_ear')
const пикерСерьги = renderToStaticMarkup(
  <ItemPicker catalog={каталог} slot={SLOTS.ear} accepts={(i) => i.id === серьга.id} onPick={() => {}} onClose={() => {}} />,
)
есть('у бижутерии показан её тип', пикерСерьги, 'Тип бижутерии')
// React экранирует апостроф в «Apprentice's Earring», поэтому ищем уже
// готовый вид — иначе проверка ругается на правильную разметку.
есть('название серьги в списке', пикерСерьги, серьга.name.replace(/'/g, '&#x27;'))

/* --- Парное оружие: вторая половина без кнопок. --- */

const парное = предметы.find((i) => i.dual)
const слотыПарное = пустыеСлоты()
слотыПарное.rhand[0] = { itemId: парное.id, mod: 3 }
слотыПарное.lhand[0] = { itemId: парное.id, mod: 3, spans: true }
const стекПарное = renderToStaticMarkup(
  <GearStack ветка={ветка} слоты={слотыПарное} catalog={каталог} правый={true} onPick={() => {}} />,
)
есть('парное оружие занимает два слота', стекПарное, 'занимает два слота')
есть('у второй половины метка «оба»', стекПарное, 'cell-ghost-mark')
есть('у первой половины есть заточка', стекПарное, 'mod-btn')
const призракПарное = призрак(стекПарное)
есть('призрак второй половины виден', призракПарное, 'cell-ghost-mark')
нет('у призрака нет кнопок заточки', призракПарное, 'mod-btn')
нет('у призрака нет кнопки снятия', призракПарное, 'Снять')
нет('у призрака нет счётчика заточки', призракПарное, 'cell-mod')

/* --- Двуручное оружие: та же вторая половина. --- */

const двуручное = предметы.find((i) => i.twoHanded && !i.dual)
const слотыДвуручное = пустыеСлоты()
слотыДвуручное.rhand[0] = { itemId: двуручное.id }
слотыДвуручное.lhand[0] = { itemId: двуручное.id, spans: true }
const стекДвуручное = renderToStaticMarkup(
  <GearStack ветка={ветка} слоты={слотыДвуручное} catalog={каталог} правый={true} onPick={() => {}} />,
)
нет('у призрака двуручного нет кнопок заточки', призрак(стекДвуручное), 'mod-btn')

/* --- Цельная броня: верх занимает и низ. В этой вики цельной брони нет,
      поэтому проверка срабатывает только когда такая вещь появится. --- */

const цельное = предметы.find((i) => i.fullbody)
if (цельное) {
  const слотыЦельное = пустыеСлоты()
  слотыЦельное.chest[0] = { itemId: цельное.id }
  слотыЦельное.legs[0] = { itemId: цельное.id, spans: true }
  const стекЦельное = renderToStaticMarkup(
    <GearStack ветка={ветка} слоты={слотыЦельное} catalog={каталог} правый={true} onPick={() => {}} />,
  )
  нет('у призрака низа нет кнопок заточки', призрак(стекЦельное), 'mod-btn')
}

/* --- Обычный предмет: кнопки на месте. --- */

const обычное = предметы.find((i) => i.slot === 'r_hand' && !i.twoHanded && !i.dual)
const слотыОбычное = пустыеСлоты()
слотыОбычное.rhand[0] = { itemId: обычное.id }
const стекОбычное = renderToStaticMarkup(
  <GearStack ветка={ветка} слоты={слотыОбычное} catalog={каталог} правый={true} onPick={() => {}} />,
)
есть('у обычного предмета есть кнопки заточки', стекОбычное, 'mod-btn')
есть('у обычного предмета есть кнопка снятия', стекОбычное, 'Снять')

/* --- Чужой персонаж: кнопок нет, предмет виден. --- */

const стекЧужой = renderToStaticMarkup(
  <GearStack ветка={ветка} слоты={слотыОбычное} catalog={каталог} правый={false} onPick={() => {}} />,
)
есть('чужому предмет виден', стекЧужой, обычное.name)
нет('чужому кнопок заточки нет', стекЧужой, 'mod-btn')

/* --- Принадлежность к комплекту видна в подсказке. --- */

const вКомплекте = предметы.find((i) => i.set)
if (вКомплекте) {
  const слотыКомплект = пустыеСлоты()
  слотыКомплект.chest[0] = { itemId: вКомплекте.id }
  const стекКомплект = renderToStaticMarkup(
    <GearStack ветка={ветка} слоты={слотыКомплект} catalog={каталог} правый={true} onPick={() => {}} />,
  )
  есть('комплект сказан в подсказке предмета', стекКомплект, вКомплекте.set)
}

export default { пройдено, ошибки }
`

const ДАННЫЕ = `
import { readFileSync } from 'node:fs'
export const предметы = JSON.parse(readFileSync(${JSON.stringify(путьКаталога)}, 'utf8')).items
`

/*
 * Временная папка — внутри проекта, а не в системной: собранный файл лежит
 * рядом с node_modules, иначе Node не найдёт react-dom от корня сам.
 * Каталог .git не попадает в репозиторий и не мешает сборке.
 */
const папка = mkdtempSync(join(new URL('../.git', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1'), 'предметы-ui-'))
const вход = join(папка, 'тест.tsx')
const выход = join(папка, 'тест.mjs')
writeFileSync(вход, ТЕСТ, 'utf8')
writeFileSync(join(папка, 'данные.mjs'), ДАННЫЕ, 'utf8')

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
    /*
     * Библиотеки оставляем внешними: react-dom/server в node-варианте тянет
     * stream и прочее через require, а собранный esm-файл такого не умеет.
     */
    packages: 'external',
    alias: { '@': new URL('../src', import.meta.url).pathname.replace(/^[/\\]([A-Za-z]:)/, '$1') },
    /*
     * BASE_URL — глобал Vite: в Node его нет, а путь иконки берётся из него.
     * Подставляем корень, чтобы разметка собралась так же, как в браузере.
     */
    define: { 'import.meta.env.BASE_URL': '"/"' },
  })
  const модуль = await import(pathToFileURL(выход).href)
  const { пройдено, ошибки } = модуль.default
  if (ошибки.length) {
    console.error(`ПРОВАЛЕНО ${ошибки.length} из ${пройдено}:`)
    for (const о of ошибки) console.error('  ✗ ' + о)
    process.exit(1)
  }
  console.log(`ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${пройдено})`)
} finally {
  rmSync(папка, { recursive: true, force: true })
}
