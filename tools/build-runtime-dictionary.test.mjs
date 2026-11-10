import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDictionary } from './build-dictionary.mjs'
import { compactDictionary } from './build-runtime-dictionary.mjs'

const dictionary = buildDictionary([
  '朋友 朋友 [peng2 you3] /friend/',
  '朋友 朋友 [peng2 you5] /friend/',
  '天氣 天气 [tian1 qi4] /weather/climate/',
].join('\n'))

test('drops derivable fields and trailing defaults', () => {
  const { format, rows } = compactDictionary(dictionary)
  assert.equal(format, 1)
  const weather = rows.find((row) => row[0] === '天气')
  assert.deepEqual(weather, ['天气', '天氣', 'tian1 qi4', dictionary.entries.find((entry) => entry.simplified === '天气').gloss])
  const friend = rows.find((row) => row[0] === '朋友')
  assert.equal(friend[1], '')
  assert.deepEqual(friend[2].split(';').sort(), ['peng2 you3', 'peng2 you5'])
})

test('refuses entries the client could not reconstruct exactly', () => {
  const entry = dictionary.entries[0]
  for (const [change, error] of [
    [{ id: 'cedict_bad' }, /ID is not derived/],
    [{ pinyin: 'wrong' }, /primary fields must equal the first reading/],
    [{ tones: [1, 1] }, /primary fields must equal the first reading/],
    [{ variants: ['甲,乙'] }, /variant contains a separator/],
    [{ extra: true }, /unsupported fields extra/],
  ]) assert.throws(() => compactDictionary({ entries: [{ ...entry, ...change }] }), error)
})
