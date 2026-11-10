import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCurated, parseCsv, serializeCsv } from './build-curated.mjs'

export const SCHEDULE_COLUMNS = ['date', 'id']
export const DEFAULT_SEED = 'ciyu-daily'
export const DEFAULT_DAYS = 365
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u
const DAY_MS = 86_400_000

export function dayNumber(date) {
  if (!ISO_DATE.test(date)) throw new Error(`invalid date "${date}"; use YYYY-MM-DD`)
  const time = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) throw new Error(`invalid date "${date}"; use YYYY-MM-DD`)
  return time / DAY_MS
}

export const dateFromDay = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10)

export function shanghaiToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Parses `date,id` rows; dates must be consecutive days with no gaps or duplicates. */
export function parseSchedule(text) {
  const rows = parseCsv(text, { required: SCHEDULE_COLUMNS, optional: [] })
  const entries = []
  for (const { line, value } of rows) {
    const context = `Schedule row ${line}`
    let day
    try { day = dayNumber(value.date) }
    catch (error) { throw new Error(`${context}: ${error.message}`) }
    if (!/^[A-Za-z0-9_-]+$/u.test(value.id)) throw new Error(`${context}: id must contain only letters, digits, underscores, or hyphens`)
    const previous = entries.at(-1)
    if (previous && day !== previous.day + 1) {
      throw new Error(`${context}: date ${value.date} must directly follow ${previous.date}; the schedule cannot have gaps, duplicates, or reordering`)
    }
    entries.push({ line, date: value.date, day, id: value.id })
  }
  return entries
}

export const serializeSchedule = (entries) => serializeCsv(entries.map(({ date, id }) => ({ date, id })), SCHEDULE_COLUMNS)

/** Pool-order-independent pseudo-random rank, so adding words never reshuffles the others. */
const rank = (seed, id) => createHash('sha256').update(`${seed}:${id}`).digest('hex')

/**
 * Appends answers until the schedule covers `today + days`, and replaces future (after `today`)
 * entries whose word is no longer approved. Entries dated today or earlier are never changed.
 * Words never scheduled come first; otherwise the least recently scheduled word is chosen.
 */
export function extendSchedule(entries, approvedIds, { today, days = DEFAULT_DAYS, seed = DEFAULT_SEED }) {
  const todayNumber = dayNumber(today)
  if (!Number.isInteger(days) || days < 0) throw new Error('days must be a non-negative integer')
  const approved = new Set(approvedIds)
  const result = entries.map(({ date, day, id }) => ({ date, day, id }))
  const lockedInvalid = result.filter((entry) => entry.day <= todayNumber && !approved.has(entry.id))
  if (lockedInvalid.length) {
    throw new Error(lockedInvalid.map((entry) => `Schedule ${entry.date}: ${entry.id} is not approved and the date is already published; restore the word's approval or edit content\\daily-schedule.csv by hand`).join('\n'))
  }
  if (!approved.size) {
    if (result.some((entry) => entry.day > todayNumber) || days > 0) throw new Error('No approved words; cannot schedule future puzzles.')
    return { entries: result, added: 0, replaced: 0 }
  }

  const ordered = [...approved].sort((a, b) => rank(seed, a).localeCompare(rank(seed, b)) || a.localeCompare(b))
  const lastUsed = new Map()
  const pick = (day) => {
    let best = null
    for (const id of ordered) {
      const used = lastUsed.get(id) ?? -Infinity
      if (best === null || used < best.used) best = { id, used }
      if (used === -Infinity) break
    }
    lastUsed.set(best.id, day)
    return best.id
  }

  let replaced = 0
  for (const entry of result) {
    if (entry.day > todayNumber && !approved.has(entry.id)) {
      entry.id = pick(entry.day)
      replaced++
    } else lastUsed.set(entry.id, entry.day)
  }
  const end = todayNumber + days
  let added = 0
  for (let day = result.length ? result.at(-1).day + 1 : todayNumber; day <= end; day++) {
    result.push({ date: dateFromDay(day), day, id: pick(day) })
    added++
  }
  return { entries: result, added, replaced }
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, contents, { flag: 'wx' })
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

const readOptional = (path) => readFile(path, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return ''
  throw error
})

export async function main(args = process.argv.slice(2)) {
  const usage = 'Usage: node tools/build-schedule.mjs [--days 365] [--today YYYY-MM-DD] [--seed text] [--source content/curated-words.csv] [--output content/daily-schedule.csv]'
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    if (!['--days', '--today', '--seed', '--source', '--output'].includes(key) || !args[index + 1] || args[index + 1].startsWith('--') || options[key]) throw new Error(usage)
    options[key] = args[index + 1]
  }
  const days = options['--days'] === undefined ? DEFAULT_DAYS : Number(options['--days'])
  if (!Number.isInteger(days) || days < 0) throw new Error(`--days must be a non-negative integer\n${usage}`)
  const today = options['--today'] ?? shanghaiToday()
  dayNumber(today)

  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const source = resolve(options['--source'] ?? resolve(root, 'content', 'curated-words.csv'))
  const output = resolve(options['--output'] ?? resolve(root, 'content', 'daily-schedule.csv'))
  const [csv, dictionaryText, scheduleText] = await Promise.all([
    readFile(source, 'utf8'),
    readFile(resolve(root, 'src', 'generated', 'dictionary.json'), 'utf8'),
    readOptional(output),
  ])
  const { artifact } = buildCurated(csv, { dictionary: JSON.parse(dictionaryText) })
  const result = extendSchedule(parseSchedule(scheduleText), artifact.answerIds, { today, days, seed: options['--seed'] ?? DEFAULT_SEED })
  await atomicWrite(output, serializeSchedule(result.entries))
  console.log(JSON.stringify({
    output, today, firstDate: result.entries[0]?.date ?? null, lastDate: result.entries.at(-1)?.date ?? null,
    entries: result.entries.length, added: result.added, replaced: result.replaced, approvedWords: artifact.answerIds.length,
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
