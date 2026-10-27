import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { buildCurated, CURATED_COLUMNS, main, parseCsv, serializeCsv } from './build-curated.mjs'
import { buildDictionary, parseReading } from './build-dictionary.mjs'

const dictionary = buildDictionary([
  '朋友 朋友 [peng2 you3] /friend/',
  '朋友 朋友 [peng2 you5] /friend/',
  '天氣 天气 [tian1 qi4] /weather/',
  '快樂 快乐 [kuai4 le4] /happy/',
].join('\n'))
const friendId = 'cedict_670b_53cb'
const weatherId = 'cedict_5929_6c14'
const happyId = 'cedict_5feb_4e50'
const approvedRow = (overrides = {}) => ({
  id: friendId, simplified: '朋友', traditional: '朋友', tocflLevel: '1',
  sourceReference: 'Synthetic source p. 1', reviewStatus: 'approved', exclusionReason: '',
  pinyinNumbered: 'peng2 you5', toneAlternatives: 'peng2 you3',
  gloss: 'friend', definition: 'friend', topic: 'Relationships',
  exampleSimplified: '他是我的朋友。', exampleTraditional: '他是我的朋友。',
  exampleEnglish: 'He is my friend.', hintSimplified: '我和＿＿聊天。',
  hintTraditional: '我和＿＿聊天。', hintEnglish: 'I chat with my ____.',
  pinyinDisplay: 'péngyou', ...overrides,
})
const weatherRow = (overrides = {}) => approvedRow({
  id: weatherId, simplified: '天气', traditional: '天氣',
  pinyinNumbered: 'tian1 qi4', toneAlternatives: '', pinyinDisplay: 'tiānqì', ...overrides,
})
const happyRow = (overrides = {}) => approvedRow({
  id: happyId, simplified: '快乐', traditional: '快樂',
  pinyinNumbered: 'kuai4 le4', toneAlternatives: '', pinyinDisplay: 'kuàilè', ...overrides,
})
const columns = [...CURATED_COLUMNS, 'pinyinDisplay']
const csv = (rows, headers = columns) => serializeCsv(rows, headers)
const build = (rows) => buildCurated(csv(rows), { dictionary })
const emptyWarning = 'No approved words; daily and practice puzzles are unavailable.'

test('parses BOM, RFC4180 quoting, commas, escaped quotes and multiline fields', () => {
  const result = parseCsv(`\uFEFF${csv([approvedRow({ gloss: 'friend, "pal"\r\nsecond line' })])}`)
  assert.equal(result[0].value.gloss, 'friend, "pal"\r\nsecond line')
  assert.equal(result[0].line, 2)
})

test('rejects malformed quotes, widths and headers with row context', () => {
  for (const [text, error] of [
    [`${columns.join(',')}\r\n"unterminated`, /CSV row 2: unterminated quoted field/],
    [`${columns.join(',')}\r\nx`, /CSV row 2: expected \d+ fields, found 1/],
    [`${columns.join(',')}\r\nx"bad`, /quote inside an unquoted field/],
    [`${columns.join(',')}\r\n"bad"x`, /unexpected character after closing quote/],
    [`id,id,${columns.slice(2).join(',')}`, /duplicate column id/],
    ['id,simplified', /missing required columns/],
    [`${columns.join(',')},unknown`, /unknown column unknown/],
  ]) assert.throws(() => parseCsv(text), error)
})

test('only approved CSV rows generate words and answers in CSV order', () => {
  const result = build([
    weatherRow(), happyRow({ reviewStatus: 'candidate' }),
    approvedRow({ reviewStatus: 'excluded', exclusionReason: 'Not selected' }),
  ])
  assert.deepEqual(result.artifact.answerIds, [weatherId])
  assert.deepEqual(result.artifact.words.map((word) => word.id), [weatherId])
  assert.deepEqual(result.counts, { approved: 1, candidate: 1, excluded: 1, wordCount: 1, answerCount: 1 })
  const approved = build([weatherRow(), approvedRow()]).artifact
  assert.deepEqual(approved.answerIds, [weatherId, friendId])
  assert.deepEqual(approved.words[1].tones, [2, 5])
  assert.deepEqual(approved.words[1].toneAlternatives, [[2, 3]])
  assert.equal(approved.words[1].tocflLevel, 1)
  assert.equal(approved.words[1].sourceReference, 'Synthetic source p. 1')
  assert.equal(approved.words[1].pinyin, 'péngyou')
  assert.equal('retained' in approved.metadata, false)
})

test('empty, blank, header-only, candidate-only and excluded-only CSVs succeed with empty pools', () => {
  for (const source of ['', '\uFEFF\r\n ', csv([]), csv([approvedRow({ reviewStatus: 'candidate' })]),
    csv([approvedRow({ reviewStatus: 'excluded', exclusionReason: 'Not selected' })])]) {
    const result = buildCurated(source, { dictionary })
    assert.deepEqual(result.artifact.words, [])
    assert.deepEqual(result.artifact.answerIds, [])
    assert.deepEqual(result.warnings, [emptyWarning])
  }
})

test('all approved and candidate rows require level and provenance without exemptions', () => {
  for (const reviewStatus of ['approved', 'candidate']) {
    for (const override of [{ tocflLevel: '' }, { sourceReference: '' }, { tocflLevel: '0' },
      { tocflLevel: '7' }, { tocflLevel: '1.5' }]) {
      assert.throws(() => build([approvedRow({ reviewStatus, ...override })]), /tocflLevel|sourceReference/)
    }
  }
  for (let level = 1; level <= 6; level++) {
    assert.equal(build([approvedRow({ tocflLevel: String(level) })]).artifact.words[0].tocflLevel, level)
  }
  assert.throws(() => build([approvedRow({ reviewStatus: 'excluded' })]), /exclusionReason is required/)
})

test('rejects missing content, bad status, forms, IDs, duplicate IDs and duplicate forms', () => {
  for (const field of ['id', 'simplified', 'traditional', 'reviewStatus', 'pinyinNumbered',
    'gloss', 'definition', 'topic', 'exampleSimplified', 'exampleTraditional',
    'exampleEnglish', 'hintSimplified', 'hintTraditional', 'hintEnglish']) {
    assert.throws(() => build([approvedRow({ [field]: '' })]), /CSV row 2/)
  }
  for (const override of [{ id: 'bad id' }, { simplified: '中' }, { traditional: 'abc' },
    { reviewStatus: 'pending' }]) assert.throws(() => build([approvedRow(override)]), /CSV row 2/)
  assert.throws(() => build([approvedRow(), approvedRow()]), /duplicate id/)
  assert.throws(() => build([approvedRow(), weatherRow({ traditional: '朋友' })]), /duplicate form/)
})

test('approved identity must match the dictionary; candidates warn without remapping', () => {
  assert.throws(() => build([approvedRow({ simplified: '天气', traditional: '天氣' })]), /forms do not match dictionary/)
  assert.throws(() => build([approvedRow({ id: 'cedict_7532_4e59' })]), /has no dictionary entry/)
  const result = build([approvedRow({ id: 'candidate_test', reviewStatus: 'candidate' })])
  assert.match(result.warnings[0], /no dictionary entry yet/)
  assert.deepEqual(result.artifact.words, [])
  const mismatch = build([weatherRow({ simplified: '甲乙', traditional: '甲乙', reviewStatus: 'candidate' })])
  assert.match(mismatch.warnings[0], /ID was not remapped/)
})

test('excluded reference pairs may overlap playable forms without reserving them', () => {
  const excluded = (id, traditional = '天汽') => weatherRow({
    id, traditional, reviewStatus: 'excluded', exclusionReason: 'Unrecognized reference form',
  })
  for (const rows of [
    [excluded('tocfl_L0-1001'), weatherRow(), excluded('tocfl_L0-1002')],
    [weatherRow(), excluded('tocfl_L0-1001'), excluded('tocfl_L0-1002', '天氣')],
    [excluded('tocfl_L0-1001'), weatherRow({ reviewStatus: 'candidate' })],
  ]) {
    const result = build(rows)
    assert.equal(result.counts.excluded, rows.length - 1)
    assert.equal(result.counts.approved + result.counts.candidate, 1)
  }
  assert.throws(() => build([excluded('tocfl_duplicate'), excluded('tocfl_duplicate')]), /duplicate id/)
  assert.throws(() => build([weatherRow(), weatherRow({ id: 'other_candidate', reviewStatus: 'candidate' })]), /duplicate form/)
})

test('validates numbered reading, alternatives, dictionary membership and exact displayed tones', () => {
  for (const override of [
    { pinyinNumbered: 'peng1 you5', pinyinDisplay: '' }, { pinyinNumbered: 'peng2 you6' },
    { pinyinNumbered: 'peng2 notpinyin5' }, { toneAlternatives: 'peng2 you4' },
    { toneAlternatives: 'peng2 yu3' }, { toneAlternatives: 'peng2 you5' },
    { toneAlternatives: 'peng2 you3;PENG2 YOU3' }, { toneAlternatives: 'peng2 you3;' },
  ]) assert.throws(() => build([approvedRow(override)]), /reading|syllables/)
  for (const pinyinDisplay of ['péngyou', 'PÉNG YOU', "pe\u0301ng'you", 'péng’you5', 'péngyou0']) {
    assert.equal(build([approvedRow({ pinyinDisplay })]).artifact.words[0].pinyin, pinyinDisplay)
  }
  for (const pinyinDisplay of ['pèngyou', 'pengyou', 'péngyǒu', 'garbage', 'péngyou1', 'péngyou!', 'péngyou55']) {
    assert.throws(() => build([approvedRow({ pinyinDisplay })]), /pinyinDisplay/)
  }
  const umlautDictionary = buildDictionary('綠女 绿女 [lv4 nv5] /synthetic example/')
  for (const pinyinDisplay of ['lǜnü', 'LÜ\u0300 NV', 'lǜ nu:']) {
    const row = approvedRow({
      id: 'cedict_7eff_5973', simplified: '绿女', traditional: '綠女',
      pinyinNumbered: 'lv4 nv5', toneAlternatives: '', pinyinDisplay,
    })
    assert.equal(buildCurated(csv([row]), { dictionary: umlautDictionary }).artifact.words[0].pinyin, pinyinDisplay)
  }
  assert.deepEqual(buildCurated(csv([approvedRow()], CURATED_COLUMNS), { dictionary }).artifact.words[0].tones, parseReading('peng2 you5').tones)
})

test('rejects leaking hints and missing English blank markers', () => {
  for (const override of [{ hintSimplified: '朋友。' }, { hintTraditional: '朋友。' },
    { hintEnglish: 'No blank.' }]) {
    assert.throws(() => build([approvedRow(override)]), /leaks the full answer|must include/)
  }
})

test('fresh generations are deterministic and removed, candidate or excluded rows are never retained', () => {
  const first = build([weatherRow(), approvedRow()]).artifact
  assert.deepEqual(build([weatherRow(), approvedRow()]).artifact, first)
  for (const rows of [[approvedRow()], [weatherRow({ reviewStatus: 'candidate' }), approvedRow()],
    [weatherRow({ reviewStatus: 'excluded', exclusionReason: 'Removed' }), approvedRow()]]) {
    const next = build(rows).artifact
    assert.deepEqual(next.words.map((word) => word.id), [friendId])
    assert.deepEqual(next.answerIds, [friendId])
  }
  const updated = build([approvedRow({ definition: 'a person you know well' })]).artifact
  assert.equal(updated.words[0].definition, 'a person you know well')
})

test('CLI ignores old output, regenerates deterministically and leaves output untouched on invalid input', async () => {
  const directory = resolve('tools', `.curated-test-${randomUUID()}`)
  const source = resolve(directory, 'input.csv')
  const output = resolve(directory, 'output.json')
  await mkdir(directory)
  try {
    await writeFile(source, csv([]))
    await writeFile(output, 'obsolete non-JSON output')
    await main(['--source', source, '--output', output])
    const generated = await readFile(output, 'utf8')
    assert.deepEqual(JSON.parse(generated).words, [])
    await rm(output)
    await main(['--source', source, '--output', output])
    assert.equal(await readFile(output, 'utf8'), generated)
    for (const invalid of [`${columns.join(',')}\n"bad`, csv([approvedRow({ tocflLevel: '' })]),
      csv([approvedRow({ reviewStatus: 'excluded', exclusionReason: '' })])]) {
      await writeFile(source, invalid)
      await assert.rejects(main(['--source', source, '--output', output]), /CSV row 2/)
      assert.equal(await readFile(output, 'utf8'), generated)
    }
    assert.deepEqual((await readdir(directory)).sort(), ['input.csv', 'output.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('production reference CSV has nineteen columns and no approved answer content', async () => {
  const [source, productionDictionary] = await Promise.all([
    readFile(new URL('../content/curated-words.csv', import.meta.url), 'utf8'),
    readFile(new URL('../src/generated/dictionary.json', import.meta.url), 'utf8').then(JSON.parse),
  ])
  assert.equal(source.split(/\r?\n/u)[0], columns.join(','))
  const result = buildCurated(source, { dictionary: productionDictionary })
  assert.deepEqual(result.counts, { approved: 0, candidate: 5731, excluded: 55, wordCount: 0, answerCount: 0 })
  assert.deepEqual(result.artifact.words, [])
  assert.deepEqual(result.artifact.answerIds, [])
})
