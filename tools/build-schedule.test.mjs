import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extendSchedule, parseSchedule, serializeSchedule } from './build-schedule.mjs'
import { buildCurated } from './build-curated.mjs'

const ids = (count) => Array.from({ length: count }, (_, index) => `word_${index}`)
const extend = (entries, approved, options) => extendSchedule(entries, approved, { today: '2026-11-10', ...options })

test('parses consecutive dates and rejects gaps, duplicates, bad dates and bad IDs', () => {
  const entries = parseSchedule('date,id\r\n2026-11-10,a\r\n2026-11-11,b\r\n')
  assert.deepEqual(entries.map(({ date, id }) => [date, id]), [['2026-11-10', 'a'], ['2026-11-11', 'b']])
  assert.deepEqual(parseSchedule(''), [])
  for (const [text, error] of [
    ['date,id\n2026-11-10,a\n2026-11-12,b', /must directly follow 2026-11-10/],
    ['date,id\n2026-11-10,a\n2026-11-10,b', /must directly follow/],
    ['date,id\n2026-11-11,a\n2026-11-10,b', /must directly follow/],
    ['date,id\n2026-02-30,a', /Schedule row 2: invalid date/],
    ['date,id\n10/11/2026,a', /invalid date/],
    ['date,id\n2026-11-10,a b', /id must contain only/],
    ['day,id\n2026-11-10,a', /missing required columns: date/],
  ]) assert.throws(() => parseSchedule(text), error)
})

test('starts today, uses every word once before repeating, and is deterministic', () => {
  const { entries, added } = extend([], ids(5), { days: 9 })
  assert.equal(added, 10)
  assert.equal(entries[0].date, '2026-11-10')
  assert.equal(entries.at(-1).date, '2026-11-19')
  assert.equal(new Set(entries.slice(0, 5).map((entry) => entry.id)).size, 5)
  assert.deepEqual(entries.slice(5).map((entry) => entry.id), entries.slice(0, 5).map((entry) => entry.id))
  assert.deepEqual(extend([], ids(5), { days: 9 }).entries, entries)
  assert.deepEqual(extend([], [...ids(5)].reverse(), { days: 9 }).entries, entries, 'pool order must not matter')
  assert.notDeepEqual(extend([], ids(5), { days: 9, seed: 'other' }).entries.map((entry) => entry.id), entries.map((entry) => entry.id))
})

test('approving new words never changes already scheduled dates', () => {
  const first = extend([], ids(10), { days: 9 }).entries
  const next = extend(parseSchedule(serializeSchedule(first)), ids(40), { today: '2026-11-15', days: 30 })
  assert.deepEqual(next.entries.slice(0, first.length).map(({ date, id }) => ({ date, id })), first.map(({ date, id }) => ({ date, id })))
  assert.equal(next.replaced, 0)
  const newWords = new Set(ids(40).slice(10))
  assert.ok(next.entries.slice(first.length, first.length + 30).every((entry) => newWords.has(entry.id)), 'unscheduled words come first')
  assert.equal(extend(next.entries, ids(40), { today: '2026-11-15', days: 30 }).added, 0, 'already covered schedules are unchanged')
})

test('replaces only future unapproved entries and refuses to rewrite published dates', () => {
  const entries = extend([], ids(5), { days: 4 }).entries
  const removed = entries[3].id
  const approved = ids(5).filter((id) => id !== removed)
  const result = extend(entries, approved, { today: '2026-11-11', days: 4 })
  assert.equal(result.replaced, 1)
  assert.deepEqual(result.entries.slice(0, 3), entries.slice(0, 3))
  assert.ok(result.entries.every((entry) => approved.includes(entry.id)))
  assert.throws(() => extend(entries, approved, { today: '2026-11-13', days: 4 }), /2026-11-13: .* already published/)
  assert.throws(() => extend([], [], { days: 1 }), /No approved words/)
})

test('production schedule only uses approved words and never repeats a word within the pool size', async () => {
  const [schedule, curated, dictionary] = await Promise.all([
    readFile(new URL('../content/daily-schedule.csv', import.meta.url), 'utf8'),
    readFile(new URL('../content/curated-words.csv', import.meta.url), 'utf8'),
    readFile(new URL('../src/generated/dictionary.json', import.meta.url), 'utf8').then(JSON.parse),
  ])
  const { artifact } = buildCurated(curated, { dictionary, schedule })
  const scheduled = artifact.schedule.answerIds
  assert.ok(scheduled.length > 0)
  const window = artifact.answerIds.length
  for (let index = 0; index < scheduled.length; index++) {
    assert.ok(!scheduled.slice(Math.max(0, index - window + 1), index).includes(scheduled[index]), `${scheduled[index]} repeats too soon`)
  }
})
