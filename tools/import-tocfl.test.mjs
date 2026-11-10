import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildDictionary } from './build-dictionary.mjs'
import { buildCurated, parseCsv, serializeCsv } from './build-curated.mjs'
import { importTocfl, main, SOURCE_COLUMNS } from './import-tocfl.mjs'

const dictionary = buildDictionary([
  '天氣 天气 [tian1 qi4] /weather/',
  '朋友 朋友 [peng2 you3] /friend/',
  '朋友 朋友 [peng2 you5] /friend/',
  '我們 我们 [wo3 men5] /we/us/',
  '妳們 你们 [ni3 men5] /you (female)/',
  '你們 你们 [ni3 men5] /you/',
  '他們 他们 [ta1 men5] /they/',
  '她們 她们 [ta1 men5] /they (female)/',
  '便宜 便宜 [bian4 yi2] /convenient/',
  '便宜 便宜 [pian2 yi5] /cheap/',
].join('\n'))
const reference = (overrides = {}) => ({
  ID: 'L0-1001', Traditional: '天氣', Simplified: '天气', Pinyin: 'tiānqì', POS: 'N', Variants: '', ...overrides,
})
const source = (rows) => serializeCsv(rows, SOURCE_COLUMNS)
const build = (rows) => importTocfl(source(rows), { dictionary })
const parsed = (result) => parseCsv(result.csv).map(({ value }) => value)
const variant = (Traditional, Simplified, Pinyin = 'nǐmen') => ({ Traditional, Simplified, Pinyin })

test('generic CSV schema and shared serializer round-trip escaped multiline JSON', () => {
  const row = reference({ POS: 'N, "special"\r\nnext', Variants: JSON.stringify([variant('天氣', '天气', 'tiānqì')]) })
  assert.deepEqual(parseCsv(`\uFEFF${source([row])}`, { required: SOURCE_COLUMNS, optional: [] })[0].value, row)
  assert.throws(() => parseCsv(source([row])), /missing required columns/)
  assert.deepEqual(parseCsv('a,b,c\nx,y,z\n', { required: ['a'], optional: ['b', 'c'] })[0].value, { a: 'x', b: 'y', c: 'z' })
  assert.throws(() => parseCsv('a,c\nx,y\n', { required: ['a'], optional: [] }), /unknown column/)
})

test('literal exact two-character filtering never truncates, converts or strips mixed content', () => {
  const forms = ['天', '天氣', '天氣好', '天氣很好', '天A', '天气 ', '𠮷天']
  const result = build(forms.map((form, index) => reference({ ID: `L0-${index}`, Traditional: form, Simplified: form })))
  assert.deepEqual(parsed(result).map((row) => row.simplified), ['天氣', '天气'])
  assert.equal(parsed(result)[0].reviewStatus, 'excluded')
  assert.match(parsed(result)[0].exclusionReason, /not the dictionary canonical/)
  assert.equal(result.report.counts.skippedForms, 5)
  assert.deepEqual(result.report.counts.skippedByLength, { 1: 1, 3: 1, 4: 1, mixedOrUnsupported: 2 })
  const unequal = build([reference({ Simplified: '天气很好' })])
  assert.equal(parsed(unequal).length, 0)
})

test('explicit JSON variants keep distinct scripts and collapse recognized aliases by canonical owner', () => {
  const result = build([
    reference({ Traditional: '你們/妳們', Simplified: '你们', Pinyin: 'nǐmen', Variants: JSON.stringify([variant('妳們', '你们'), variant('你們', '你们')]) }),
    reference({ ID: 'L0-1002', Traditional: '他們/她們', Simplified: '他们/她们', Pinyin: 'tāmen', Variants: JSON.stringify([variant('他們', '他们', 'tāmen'), variant('她們', '她们', 'tāmen')]) }),
  ])
  const rows = parsed(result)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].traditional, '妳們')
  assert.equal(rows[0].id, 'cedict_4f60_4eec')
  assert.equal(result.report.counts.duplicateCollapsed, 1)
  assert.deepEqual(result.report.entries[0].forms, [
    { simplified: '你们', traditional: '妳們' }, { simplified: '你们', traditional: '你們' },
  ])
  assert.equal(result.report.entries[0].provenance.length, 2)
  assert.equal(result.report.counts.qualifyingJsonVariants, 4)
})

test('JSON variant lengths are evaluated individually rather than row slash expressions', () => {
  const result = build([reference({
    Traditional: '天/天氣/天氣很好', Simplified: '天/天气/天气很好',
    Variants: JSON.stringify([variant('天', '天'), variant('天氣', '天气', 'tiānqì'), variant('天氣很好', '天气很好')]),
  })])
  assert.equal(parsed(result).length, 1)
  assert.equal(result.report.counts.skippedForms, 2)
  assert.equal(result.report.counts.qualifyingRecords, 1)
})

test('unambiguous one-to-many explicit slash forms work without zipping lists', () => {
  const result = build([reference({ Traditional: '你們/妳們', Simplified: '你们', Pinyin: 'nǐmen' })])
  assert.equal(parsed(result).length, 1)
  assert.equal(result.report.counts.duplicateCollapsed, 1)
  assert.throws(() => build([reference({ Traditional: '他們/她們', Simplified: '他们/她们' })]), /ambiguous slash alternatives/)
  assert.throws(() => build([reference({ Pinyin: 'tiānqì/tiānqi' })]), /ambiguous slash alternatives/)
})

test('both explicit forms must be recognized by the same canonical dictionary owner', () => {
  const result = build([
    reference({ Traditional: '天汽' }),
    reference({ ID: 'L0-1002', Traditional: '朋友' }),
    reference({ ID: 'L0-1003', Traditional: '陌詞', Simplified: '陌词' }),
    reference({ ID: 'L0-1004' }),
  ])
  const rows = parsed(result)
  assert.deepEqual(rows.map((row) => row.reviewStatus), ['excluded', 'excluded', 'excluded', 'candidate'])
  assert.match(rows[0].exclusionReason, /Traditional form is not listed/)
  assert.match(rows[1].exclusionReason, /different dictionary canonical owners/)
  assert.match(rows[2].exclusionReason, /Simplified form is not recognized/)
  assert.equal(rows[0].id, 'tocfl_L0-1001')
  assert.equal(rows[0].traditional, '天汽')
  assert.equal(rows[0].pinyinNumbered, '')
  assert.equal(rows[0].pinyinDisplay, '')
  assert.equal(rows[0].gloss, '')
  assert.equal(buildCurated(result.csv, { dictionary }).counts.excluded, 3)
})

test('unmatched variants receive stable IDs and exact-pair dedup retains all provenance', () => {
  const row = reference({ Traditional: '陌詞/陌辭', Simplified: '陌词', Variants: JSON.stringify([variant('陌詞', '陌词'), variant('陌辭', '陌词')]) })
  const result = build([row, { ...row, ID: 'L1-1002' }])
  assert.deepEqual(parsed(result).map((item) => item.id), ['tocfl_L0-1001_variant1', 'tocfl_L0-1001_variant2'])
  assert.equal(result.report.entries[0].provenance.length, 2)
  assert.match(parsed(result)[0].sourceReference, /tocfl-202307.csv:L1-1002/)
  assert.equal(result.report.counts.levelConflicts, 2)
})

test('lowest introduction level wins explicitly and every source reference survives', () => {
  const rows = Array.from({ length: 6 }, (_, index) => reference({ ID: `L${5 - index}-${index}` }))
  const result = build(rows)
  assert.equal(parsed(result)[0].tocflLevel, '1')
  assert.deepEqual(result.report.entries[0].levels, [1, 2, 3, 4, 5, 6])
  assert.equal(result.report.levelConflicts.length, 1)
  for (const row of rows) assert.ok(parsed(result)[0].sourceReference.includes(`tocfl-202307.csv:${row.ID}`))
  assert.equal(result.report.counts.duplicateCollapsed, 5)
  assert.equal(result.report.counts.perLevel[1].candidate, 1)
  for (let level = 1; level <= 6; level++) {
    const single = build([reference({ ID: `L${level - 1}-1000` })])
    assert.equal(parsed(single)[0].tocflLevel, String(level))
    assert.equal(single.report.entries[0].provenance[0].pos, 'N')
  }
})

test('exact marked dictionary reading is preferred; mismatches warn without invented readings or authored content', () => {
  const exact = build([reference({ Traditional: '朋友', Simplified: '朋友', Pinyin: 'PÉNG YǑU' })])
  assert.equal(parsed(exact)[0].pinyinNumbered, 'peng2 you3')
  assert.equal(exact.report.counts.mismatchedReadings, 0)
  const result = build([reference({ Traditional: '朋友', Simplified: '朋友', Pinyin: 'péngyòu' })])
  const row = parsed(result)[0]
  assert.equal(row.reviewStatus, 'candidate')
  assert.equal(row.pinyinNumbered, 'peng2 you3')
  assert.equal(row.pinyinDisplay, 'péngyǒu')
  assert.equal(row.gloss, 'friend')
  assert.equal(result.report.warnings[0].pinyin, 'péngyòu')
  assert.equal(result.report.entries[0].provenance[0].original.pinyin, 'péngyòu')
  for (const field of ['topic', 'exampleSimplified', 'exampleTraditional', 'exampleEnglish', 'hintSimplified', 'hintTraditional', 'hintEnglish', 'toneAlternatives']) {
    assert.equal(row[field], '')
  }
  assert.equal(result.csv.split('\r\n')[0].split(',').length, 19)
  const neutralMismatch = build([reference({ Traditional: '便宜', Simplified: '便宜', Pinyin: 'piányí' })])
  assert.equal(parsed(neutralMismatch)[0].pinyinNumbered, 'pian2 yi5')
  assert.equal(parsed(neutralMismatch)[0].pinyinDisplay, 'piányi')
  assert.equal(neutralMismatch.report.counts.mismatchedReadings, 1)
  assert.equal(build([reference()]).csv, build([reference()]).csv)
})

test('source IDs and JSON variant schema fail loudly rather than skipping errors', () => {
  for (const ID of ['L6-1001', 'L0-abc', '', 'wrong']) assert.throws(() => build([reference({ ID })]), /ID must use/)
  assert.throws(() => build([reference(), reference()]), /duplicate source ID/)
  for (const Variants of ['invalid', '{}', '[]', '[null]', '["word"]',
    '[{"Traditional":"天氣","Simplified":"天气"}]',
    '[{"Traditional":"天氣/天汽","Simplified":"天气","Pinyin":"tiānqì"}]',
    '[{"Traditional":"天氣","Simplified":"天气","Pinyin":"tiānqì","POS":3}]',
    '[{"Traditional":"天氣","Simplified":"天气","Pinyin":"tiānqì","extra":true}]']) {
    assert.throws(() => build([reference({ Variants })]), /Variants|variant/)
  }
  assert.throws(() => build([reference({ Traditional: '' })]), /Traditional is required/)
  assert.throws(() => importTocfl(source([]), { dictionary }), /contains no records/)
})

test('CLI permits header-only first import, protects reviews and leaves both outputs untouched on malformed source', async () => {
  const directory = resolve('tools', `.tocfl-test-${randomUUID()}`)
  const input = resolve(directory, 'input.csv')
  const output = resolve(directory, 'curated.csv')
  const report = resolve(directory, 'report.json')
  const args = ['--source', input, '--output', output, '--report', report]
  await mkdir(directory)
  try {
    await writeFile(input, source([reference()]))
    await writeFile(output, serializeCsv([]))
    await main(args)
    const generated = await readFile(output, 'utf8')
    const generatedReport = await readFile(report, 'utf8')
    await assert.rejects(main(args), /--replace/)
    assert.equal(await readFile(output, 'utf8'), generated)
    await rm(output)
    await main(args)
    assert.equal(await readFile(output, 'utf8'), generated)
    for (const invalid of [
      source([reference({ ID: 'L7-1001' })]), source([reference(), reference()]),
      source([reference({ Variants: '[null]' })]), `${SOURCE_COLUMNS.join(',')}\n"unterminated`,
    ]) {
      await writeFile(input, invalid)
      await assert.rejects(main([...args, '--replace']), /CSV row/)
      assert.equal(await readFile(output, 'utf8'), generated)
      assert.equal(await readFile(report, 'utf8'), generatedReport)
    }
    await writeFile(input, source([reference()]))
    await main([...args, '--replace'])
    assert.equal(await readFile(output, 'utf8'), generated)
    assert.deepEqual((await readdir(directory)).sort(), ['curated.csv', 'input.csv', 'report.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// Columns the importer owns; review status, exclusions and learning content are edited afterwards.
const IMPORTED_COLUMNS = ['id', 'simplified', 'traditional', 'tocflLevel', 'sourceReference']

test('complete offline source snapshot regenerates the exact report, counts and imported CSV identity', async () => {
  const [input, dictionaryText, currentCsv, currentReport] = await Promise.all([
    readFile(new URL('../content/tocfl-202307.csv', import.meta.url), 'utf8'),
    readFile(new URL('../src/generated/dictionary.json', import.meta.url), 'utf8'),
    readFile(new URL('../content/curated-words.csv', import.meta.url), 'utf8'),
    readFile(new URL('../content/tocfl-import-report.json', import.meta.url), 'utf8'),
  ])
  const result = importTocfl(input, { dictionary: JSON.parse(dictionaryText) })
  const imported = parseCsv(result.csv).map(({ value }) => value)
  const current = parseCsv(currentCsv).map(({ value }) => value)
  assert.equal(current.length, imported.length, 'rows must not be added or removed after import')
  imported.forEach((row, index) => {
    const pick = (value) => Object.fromEntries(IMPORTED_COLUMNS.map((column) => [column, value[column]]))
    assert.deepEqual(pick(current[index]), pick(row), `CSV row ${index + 2}`)
    if (row.reviewStatus === 'excluded') assert.equal(current[index].reviewStatus, 'excluded', `CSV row ${index + 2} was excluded on import`)
  })
  assert.deepEqual(result.report, JSON.parse(currentReport))
  const { perLevel, ...counts } = result.report.counts
  assert.deepEqual(counts, {
    sourceRows: 7517, explicitForms: 7848, qualifyingRecords: 5850, qualifyingForms: 5942,
    qualifyingJsonVariants: 376, duplicateCollapsed: 156, candidate: 5731, excluded: 55,
    mismatchedReadings: 361, levelConflicts: 128, skippedForms: 1906,
    skippedByLength: { 1: 1620, 3: 250, 4: 36 },
  })
  assert.deepEqual(Object.values(perLevel).map((level) => [level.candidate, level.excluded]), [
    [186, 8], [231, 2], [347, 4], [857, 9], [1737, 15], [2373, 17],
  ])
})
