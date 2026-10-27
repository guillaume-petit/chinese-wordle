import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildDictionary, parseReading, validateFrequency, attributionNotice } from './build-dictionary.mjs'

const sample = '# CC-CEDICT\n#! date=2026-10-11T08:29:27Z\n'
const keys = ['id', 'simplified', 'traditional', 'variants', 'pinyin', 'syllables', 'tones', 'readings', 'frequency', 'gloss', 'glosses'].sort()
const validFrequency = () => ({
  metadata: { source: 'Example corpus', url: 'https://example.com/corpus', attribution: 'Example contributors', license: 'CC0-1.0' },
  ranks: { 朋友: 12 },
})

test('filters unsupported forms and readings but retains supported Extension A Han', () => {
  const result = buildDictionary(sample + [
    '朋友 朋友 [peng2 you5] /friend/',
    '㐀中 㐀中 [qiu1 zhong1] /sample/',
    '中 中 [zhong1] /middle/',
    'abc abc [a1 b1] /letters/',
    '𠀀中 𠀀中 [he1 zhong1] /outside range/',
    '你好 你好 [ni3 hao3 ma5] /too many syllables/',
    '你好 你好 [notpinyin1 hao3] /invalid syllable/',
    '你好 你好 [ni3 hao6] /invalid tone/',
    '花兒 花儿 [hua1r er2] /unsupported erhua notation/',
    '甲乙 甲乙 [jia3 yi3] /a/b/',
  ].join('\n'))
  assert.equal(result.entries.length, 3)
  assert.equal(result.metadata.stats.skippedForms, 3)
  assert.equal(result.metadata.stats.skippedReadings, 4)
  assert.equal(result.metadata.entryCount, 3)
  assert.deepEqual(result.entries.find((entry) => entry.simplified === '甲乙').glosses, ['a', 'b'])
})

test('merges duplicate readings, traditional variants and definitions deterministically', () => {
  const lines = [
    '臺灣 台湾 [Tai2 wan1] /Taiwan/',
    '台灣 台湾 [tai2 wan1] /island/',
    '臺灣 台湾 [tai1 wan1] /alternate/',
    '臺灣 台湾 [tai2 wan1] /Taiwan/',
  ]
  const first = buildDictionary(sample + lines.join('\n'))
  const second = buildDictionary(sample + [...lines].reverse().join('\n'))
  assert.deepEqual(first.entries, second.entries)
  assert.equal(first.entries[0].readings.length, 2)
  assert.equal(first.entries[0].traditional, '台灣')
  assert.deepEqual(first.entries[0].variants, ['臺灣'])
  assert.deepEqual(first.entries[0].glosses, ['Taiwan', 'alternate', 'island'])
  assert.equal(first.entries[0].id, 'cedict_53f0_6e7e')
  assert.equal(first.entries[0].frequency, null)
  assert.equal(first.metadata.stats.mergedLines, 3)
  assert.deepEqual(Object.keys(first.entries[0]).sort(), keys)
})

test('normalizes uppercase, u:, ü, v, tone zero and neutral display without digits', () => {
  assert.deepEqual(parseReading('LÜ4 nu:0'), { pinyin: 'lǜnü', syllables: ['lv', 'nv'], tones: [4, 5] })
  assert.deepEqual(parseReading('LV4 nv5'), parseReading('LÜ4 nu:0'))
  assert.equal(parseReading('liu2 shui3').pinyin, 'liúshuǐ')
  assert.equal(parseReading('gui4 hua1').pinyin, 'guìhuā')
  assert.equal(parseReading('ou3 e4').pinyin, 'ǒuè')
  assert.equal(parseReading('n2 m3').pinyin, 'n2m3')
  assert.equal(parseReading('ng2 m5').pinyin, 'ng2m')
  assert.equal(parseReading('ê2 hao3'), null)
  assert.equal(parseReading('ni hao'), null)
})

test('all primary fields, canonical IDs, readings and glosses come only from source', () => {
  const result = buildDictionary('朋友 朋友 [peng2 you3] /companion/')
  assert.deepEqual(result.entries.map((entry) => entry.id), ['cedict_670b_53cb'])
  const entry = result.entries[0]
  assert.equal(entry.pinyin, 'péngyǒu')
  assert.deepEqual(entry.tones, [2, 3])
  assert.deepEqual(entry.readings, [parseReading('peng2 you3')])
  assert.equal(entry.gloss, 'companion')
  assert.deepEqual(entry.glosses, ['companion'])
  assert.equal('localOverrides' in result.metadata, false)
  assert.equal('curatedCollisionMerges' in result.metadata.stats, false)
})

test('canonical simplified forms win colliding aliases without merging separate source entries', () => {
  const text = [
    '朋友 朋友 [peng2 you3] /friend/',
    '朋友 朋有 [peng2 you3] /alternate spelling/',
    '朋有 朋又 [peng2 you4] /another word/',
    '朋友 朋朋 [peng2 peng2] /sample/',
  ].join('\n')
  const result = buildDictionary(text)
  const owners = new Map()
  for (const entry of result.entries) {
    assert.equal(entry.id, `cedict_${[...entry.simplified].map((char) => char.codePointAt(0).toString(16)).join('_')}`)
    for (const form of new Set([entry.simplified, entry.traditional, ...entry.variants])) {
      assert.ok(!owners.has(form), `Duplicate form: ${form}`)
      owners.set(form, entry.id)
    }
  }
  assert.equal(result.entries.length, 4)
  assert.equal(owners.get('朋友'), 'cedict_670b_53cb')
  assert.equal(owners.get('朋有'), 'cedict_670b_6709')
  assert.ok(result.metadata.stats.formCollisions > 0)
  assert.deepEqual(result.entries, buildDictionary(text.split('\n').reverse().join('\n')).entries)
})

test('rejects malformed entries with line numbers, empty and unsupported-only sources', () => {
  assert.throws(() => buildDictionary('# comment\n\nbroken'), /line 3/)
  for (const text of ['朋友 朋友 [peng2 you3] friend', '朋友 朋友 [peng2 you3] //',
    '朋友 朋友 [peng2 you3] / /']) assert.throws(() => buildDictionary(text), /line 1/)
  for (const text of ['', '# header\n', '中 中 [zhong1] /middle/']) {
    assert.throws(() => buildDictionary(text), /no supported/)
  }
})

test('frequency overlay validates attribution and ranks; unknown ranks remain null', () => {
  const frequency = validFrequency()
  const result = buildDictionary('朋友 朋友 [peng2 you3] /friend/\n你好 你好 [ni3 hao3] /hello/', { frequency })
  assert.equal(result.entries.find((entry) => entry.simplified === '朋友').frequency, 12)
  assert.equal(result.entries.find((entry) => entry.simplified === '你好').frequency, null)
  assert.deepEqual(result.metadata.frequencySource, frequency.metadata)
  for (const invalid of [null, [], {}, { metadata: {}, ranks: {} }]) assert.throws(() => validateFrequency(invalid), /Frequency/)
  for (const field of ['source', 'url', 'attribution', 'license']) {
    const invalid = validFrequency()
    invalid.metadata[field] = ' '
    assert.throws(() => validateFrequency(invalid), new RegExp(field))
  }
  for (const rank of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateFrequency({ ...frequency, ranks: { 朋友: rank } }), /Invalid frequency rank/)
  }
  assert.throws(() => validateFrequency({ ...frequency, ranks: { abc: 1 } }), /Invalid frequency rank/)
})

test('metadata preserves deterministic headers, release date, hashes and offline attribution', () => {
  const text = sample + '朋友 朋友 [peng2 you3] /friend/'
  const result = buildDictionary(text, { sourceSha256: 'abc', frequency: validFrequency() })
  assert.deepEqual(result, buildDictionary(text, { sourceSha256: 'abc', frequency: validFrequency() }))
  assert.equal(result.metadata.sourceDate, '2026-10-11T08:29:27Z')
  assert.deepEqual(result.metadata.sourceHeader, sample.trim().split('\n'))
  assert.equal(result.metadata.sourceSha256, 'abc')
  assert.match(result.metadata.sourceTextSha256, /^[a-f0-9]{64}$/)
  const notice = attributionNotice(result.metadata)
  assert.match(notice, /Example contributors/)
  assert.match(notice, /CC-BY-SA-4.0.txt/)
  assert.match(notice, /separate from the application source code/)
  assert.match(notice, /No local dictionary overrides are included/)
  assert.match(notice, /Source entries: 1/)
})

test('checked-in dictionary has only canonical IDs and its notice matches metadata', async () => {
  const [result, notice] = await Promise.all([
    readFile(new URL('../src/generated/dictionary.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../public/licenses/CC-CEDICT-NOTICE.txt', import.meta.url), 'utf8'),
  ])
  assert.equal(notice, attributionNotice(result.metadata))
  for (const entry of result.entries) {
    assert.equal(entry.id, `cedict_${[...entry.simplified].map((char) => char.codePointAt(0).toString(16)).join('_')}`)
    assert.equal(entry.gloss, entry.glosses[0])
    assert.equal(entry.pinyin, entry.readings[0].pinyin)
  }
  assert.equal('localOverrides' in result.metadata, false)
  assert.equal(result.metadata.stats.supportedLines - result.metadata.stats.mergedLines, result.entries.length)
  assert.equal(result.entries.some((entry) => entry.simplified === '累了'), false)
  const friend = result.entries.find((entry) => entry.simplified === '朋友')
  assert.equal(friend.id, 'cedict_670b_53cb')
  assert.deepEqual(friend.readings, [parseReading('peng2 you5')])
})
