/**
 * Пропала ли база.
 *
 * База пати лежит в том же файле, что и отпечаток её мастер-токена, поэтому
 * удаление файла отнимает у человека доступ к его же пати — навсегда и без
 * предупреждения. Случалось: уборка сносила всё кроме README под предлогом
 * «проверочные», и под ним оказалась чужая база.
 *
 * Проверка ловит новое исчезновение, а не перебирает историю: базы, стёртые
 * по делу — по слову хозяина или её собственным токеном, — уходят молча, и
 * переспрашивать их каждый раз незачем.
 */
import { execFileSync } from 'node:child_process'

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

/** Базы, удалённые сервером по токену: их исчезновение законно. */
const удаленыПоТокену = new Set()
{
  const вывод = git('log', '--format=%x40%s', '--name-status', '-50', '--', 'data/parties')
  let тема = ''
  for (const строка of вывод.split('\n')) {
    if (строка.startsWith('@')) {
      тема = строка.slice(1)
      continue
    }
    const m = строка.match(/^D\s+data\/parties\/([a-z0-9]+)\.json$/)
    if (m && тема.includes('пати удалена')) удаленыПоТокену.add(m[1])
  }
}

const базыНа = (ревизия) =>
  new Set(
    git('ls-tree', '-r', '--name-only', ревизия, '--', 'data/parties')
      .split('\n')
      .filter((s) => s.endsWith('.json') && !s.endsWith('README.md'))
      .map((s) => s.split('/').pop().replace('.json', '')),
  )

const было = базыНа('HEAD~1')
const стало = базыНа('HEAD')

const пропало = [...было].filter((id) => !стало.has(id))
const чужие = пропало.filter((id) => !удаленыПоТокену.has(id))

if (!чужие.length) {
  console.log(`Пропавших баз без токена: 0 (баз: было ${было.size}, стало ${стало.size})`)
  process.exit(0)
}

console.log(`ПРОПАЛИ БЕЗ ТОКЕНА: ${чужие.length}`)
for (const id of чужие) {
  console.log(`  ${id} — последний коммит с этой базой: ${git('log', '-1', '--format=%h %s', '--', `data/parties/${id}.json`)}`)
  console.log(`    Вернуть: git checkout HEAD~1 -- data/parties/${id}.json`)
}
console.log('\nЕсли это была чужая база — верни её сразу и скажи, какие ещё нужны.')
process.exit(1)