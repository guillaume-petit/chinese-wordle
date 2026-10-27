import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCurated, parseCsv, serializeCsv } from './build-curated.mjs'

export const SOURCE_COLUMNS = ['ID', 'Traditional', 'Simplified', 'Pinyin', 'POS', 'Variants']
const supported = (form) => /^[\u3400-\u9fff]{2}$/u.test(form)
const normalizePinyin = (text) => text.normalize('NFC').toLowerCase()
  .replaceAll('u:', 'ü').replaceAll('v', 'ü').replace(/[\s'’]/gu, '')
const pinyinSyllables = (text) => normalizePinyin(text).normalize('NFD')
  .replace(/[\u0300\u0301\u0304\u030c]/gu, '').normalize('NFC')
const numbered = (reading) => reading.syllables.map((syllable, index) => `${syllable}${reading.tones[index]}`).join(' ')
const unique = (values) => [...new Set(values)]

function explicitVariants(row, context) {
  for (const key of ['Traditional', 'Simplified', 'Pinyin']) {
    if (!row[key]) throw new Error(`${context}: ${key} is required`)
  }
  if (row.Variants) {
    let variants
    try { variants = JSON.parse(row.Variants) }
    catch { throw new Error(`${context}: malformed Variants JSON`) }
    if (!Array.isArray(variants) || !variants.length) throw new Error(`${context}: Variants must be a nonempty array`)
    for (const variant of variants) {
      if (!variant || typeof variant !== 'object' || Array.isArray(variant)
        || Object.keys(variant).some((key) => !['Traditional', 'Simplified', 'Pinyin', 'POS'].includes(key))
        || ['Traditional', 'Simplified', 'Pinyin'].some((key) => typeof variant[key] !== 'string' || !variant[key].trim() || variant[key].includes('/'))
        || ('POS' in variant && typeof variant.POS !== 'string')) {
        throw new Error(`${context}: each variant requires explicit Traditional, Simplified and Pinyin strings, with optional POS`)
      }
    }
    return variants.map((variant) => ({
      Traditional: variant.Traditional.trim(), Simplified: variant.Simplified.trim(),
      Pinyin: variant.Pinyin.trim(), POS: variant.POS?.trim() ?? row.POS,
    }))
  }
  const traditional = unique(row.Traditional.split('/').map((form) => form.trim()))
  const simplified = unique(row.Simplified.split('/').map((form) => form.trim()))
  if (traditional.some((form) => !form) || simplified.some((form) => !form)
    || (traditional.length > 1 && simplified.length > 1) || row.Pinyin.includes('/')) {
    throw new Error(`${context}: ambiguous slash alternatives require explicit Variants JSON`)
  }
  return traditional.flatMap((Traditional) => simplified.map((Simplified) => ({
    Traditional, Simplified, Pinyin: row.Pinyin, POS: row.POS,
  })))
}

function skipReason(form) {
  if (!/^[\u3400-\u9fff]+$/u.test(form)) return 'mixedOrUnsupported'
  return String([...form].length)
}

export function importTocfl(csvText, { dictionary, sourceFilename = 'tocfl-202307.csv' }) {
  if (!dictionary || !Array.isArray(dictionary.entries)) throw new Error('Dictionary must contain an entries array')
  const records = parseCsv(csvText, { required: SOURCE_COLUMNS, optional: [] })
  if (!records.length) throw new Error('TOCFL source contains no records')
  const owners = new Map()
  for (const entry of dictionary.entries) {
    for (const form of unique([entry.simplified, entry.traditional, ...(entry.variants ?? [])])) {
      if (owners.has(form) && owners.get(form).id !== entry.id) throw new Error(`Dictionary has ambiguous recognized form ${form}`)
      owners.set(form, entry)
    }
  }
  const seenIds = new Set()
  const groups = new Map()
  const warnings = []
  const skipped = []
  const counts = {
    sourceRows: records.length, explicitForms: 0, qualifyingRecords: 0, qualifyingForms: 0,
    qualifyingJsonVariants: 0, duplicateCollapsed: 0, candidate: 0, excluded: 0,
    mismatchedReadings: 0, levelConflicts: 0, skippedForms: 0, skippedByLength: {},
    perLevel: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, {
      sourceRows: 0, qualifyingForms: 0, skippedForms: 0, candidate: 0, excluded: 0,
    }])),
  }
  for (const { line, value: row } of records) {
    const context = `CSV row ${line} (${row.ID})`
    if (!/^L[0-5]-\d+$/u.test(row.ID)) throw new Error(`${context}: ID must use L0..L5 followed by a numeric reference ID`)
    if (seenIds.has(row.ID)) throw new Error(`${context}: duplicate source ID`)
    seenIds.add(row.ID)
    const level = Number(row.ID[1]) + 1
    counts.perLevel[level].sourceRows++
    const variants = explicitVariants(row, context)
    let qualifying = false
    for (const [index, form] of variants.entries()) {
      counts.explicitForms++
      const provenance = {
        sourceID: row.ID, reference: `${sourceFilename}:${row.ID}`, level,
        variant: row.Variants || variants.length > 1 ? index + 1 : null,
        traditional: form.Traditional, simplified: form.Simplified, pinyin: form.Pinyin, pos: form.POS,
        original: { traditional: row.Traditional, simplified: row.Simplified, pinyin: row.Pinyin, pos: row.POS },
      }
      if (!supported(form.Traditional) || !supported(form.Simplified)) {
        const reasons = unique([form.Traditional, form.Simplified].filter((value) => !supported(value)).map(skipReason))
        for (const reason of reasons) counts.skippedByLength[reason] = (counts.skippedByLength[reason] ?? 0) + 1
        counts.skippedForms++
        counts.perLevel[level].skippedForms++
        skipped.push({ ...provenance, reasons })
        continue
      }
      qualifying = true
      counts.qualifyingForms++
      counts.perLevel[level].qualifyingForms++
      if (row.Variants) counts.qualifyingJsonVariants++
      const simpleOwner = owners.get(form.Simplified)
      const traditionalOwner = owners.get(form.Traditional)
      let reason = ''
      if (!simpleOwner) reason = 'Simplified form is not recognized by the dictionary'
      else if (simpleOwner.simplified !== form.Simplified) reason = 'Source simplified form is not the dictionary canonical simplified form'
      else if (!traditionalOwner) reason = 'Traditional form is not listed among dictionary recognized forms'
      else if (simpleOwner.id !== traditionalOwner.id) reason = 'Explicit script forms have different dictionary canonical owners'
      const entry = reason ? null : simpleOwner
      const key = entry ? entry.id : JSON.stringify([form.Simplified, form.Traditional])
      const reading = entry ? entry.readings.find((item) => normalizePinyin(item.pinyin) === normalizePinyin(form.Pinyin))
        ?? entry.readings.find((item) => pinyinSyllables(item.pinyin) === pinyinSyllables(form.Pinyin))
        ?? entry.readings[0] : null
      if (entry && !reading) throw new Error(`Dictionary entry ${entry.id} has no readings`)
      if (entry && normalizePinyin(reading.pinyin) !== normalizePinyin(form.Pinyin)) {
        counts.mismatchedReadings++
        warnings.push({ ...provenance, id: entry.id, reason: 'Source pinyin does not exactly match a dictionary reading', dictionaryPinyin: reading.pinyin, dictionaryNumbered: numbered(reading) })
      }
      if (groups.has(key)) {
        groups.get(key).provenance.push(provenance)
        counts.duplicateCollapsed++
        continue
      }
      const id = entry?.id ?? `tocfl_${row.ID}${provenance.variant ? `_variant${index + 1}` : ''}`
      groups.set(key, {
        row: {
          id, simplified: form.Simplified, traditional: form.Traditional, tocflLevel: String(level),
          reviewStatus: entry ? 'candidate' : 'excluded', exclusionReason: reason,
          pinyinNumbered: reading ? numbered(reading) : '', pinyinDisplay: reading?.pinyin ?? '',
          gloss: entry?.gloss ?? '', definition: entry?.glosses?.join('; ') ?? '',
        },
        provenance: [provenance],
      })
    }
    if (qualifying) counts.qualifyingRecords++
  }
  const entries = [...groups.values()].map(({ row, provenance }) => {
    const levels = unique(provenance.map((item) => item.level)).sort((a, b) => a - b)
    row.tocflLevel = String(levels[0])
    row.sourceReference = `User-provided ${sourceFilename}, edition 202307; ${unique(provenance.map((item) => item.reference)).join('; ')}`
    counts[row.reviewStatus]++
    counts.perLevel[levels[0]][row.reviewStatus]++
    if (levels.length > 1) counts.levelConflicts++
    return {
      id: row.id, status: row.reviewStatus, simplified: row.simplified, traditional: row.traditional,
      level: levels[0], levels, levelConflict: levels.length > 1, exclusionReason: row.exclusionReason,
      forms: [...new Map(provenance.map((item) => [JSON.stringify([item.simplified, item.traditional]), { simplified: item.simplified, traditional: item.traditional }])).values()],
      provenance, row,
    }
  })
  const csv = serializeCsv(entries.map((entry) => entry.row))
  buildCurated(csv, { dictionary })
  return {
    csv,
    report: {
      source: { filename: sourceFilename, edition: '202307', origin: 'user-provided reference CSV' },
      policy: { level: 'L0..L5 maps to 1..6; lowest source level wins', forms: 'Only explicit exact two supported Han characters in both scripts; no conversion', review: 'Dictionary matches are candidates, unmatched pairs are excluded; no approved entries or authored learning content' },
      counts, warnings, levelConflicts: entries.filter((entry) => entry.levelConflict).map(({ row, ...entry }) => entry),
      entries: entries.map(({ row, ...entry }) => entry), skipped,
    },
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = {}
  const usage = 'Usage: node tools\\import-tocfl.mjs [--source file.csv] [--output file.csv] [--report file.json] [--replace]'
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    if (options[key] || !['--source', '--output', '--report', '--replace'].includes(key)) throw new Error(usage)
    if (key === '--replace') options[key] = true
    else {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(usage)
      options[key] = value
    }
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const source = resolve(options['--source'] ?? resolve(root, 'content', 'tocfl-202307.csv'))
  const output = resolve(options['--output'] ?? resolve(root, 'content', 'curated-words.csv'))
  const reportPath = resolve(options['--report'] ?? resolve(root, 'content', 'tocfl-import-report.json'))
  if (new Set([source, output, reportPath].map((path) => path.toLowerCase())).size !== 3) throw new Error('Source, output and report paths must be distinct')
  let existing
  try { existing = await readFile(output, 'utf8') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!options['--replace'] && existing !== undefined && parseCsv(existing).length) {
    throw new Error('Output CSV contains records; use --replace explicitly to overwrite review edits')
  }
  const [csvText, dictionaryText] = await Promise.all([
    readFile(source, 'utf8'), readFile(resolve(root, 'src', 'generated', 'dictionary.json'), 'utf8'),
  ])
  const result = importTocfl(csvText, { dictionary: JSON.parse(dictionaryText), sourceFilename: basename(source) })
  const staged = []
  try {
    for (const [path, contents] of [[output, result.csv], [reportPath, `${JSON.stringify(result.report, null, 2)}\n`]]) {
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.${randomUUID()}.tmp`
      staged.push([temporary, path])
      await writeFile(temporary, contents, { flag: 'wx' })
    }
    for (const [temporary, path] of staged) await rename(temporary, path)
  } finally {
    await Promise.all(staged.map(([temporary]) => rm(temporary, { force: true })))
  }
  console.log(JSON.stringify({ output, report: reportPath, ...result.report.counts }, null, 2))
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
