import { randomUUID } from 'node:crypto'
import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseReading, toneMark } from './build-dictionary.mjs'

export const CURATED_COLUMNS = [
  'id', 'simplified', 'traditional', 'tocflLevel', 'sourceReference', 'reviewStatus',
  'exclusionReason', 'pinyinNumbered', 'toneAlternatives', 'gloss', 'definition',
  'topic', 'exampleSimplified', 'exampleTraditional', 'exampleEnglish',
  'hintSimplified', 'hintTraditional', 'hintEnglish',
]
const OPTIONAL_COLUMNS = ['pinyinDisplay']
const HAN_FORM = /^[\u3400-\u9fff]{2}$/u
const MARKER = /＿＿|__/u
const blankRecord = (fields) => fields.every((field) => field === '')

function csvError(line, message) {
  throw new Error(`CSV row ${line}: ${message}`)
}

export function serializeCsv(rows, columns = [...CURATED_COLUMNS, ...OPTIONAL_COLUMNS]) {
  const quote = (value) => {
    const text = String(value ?? '')
    return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return `${[columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((fields) => fields.map(quote).join(',')).join('\r\n')}\r\n`
}

export function parseCsv(text, { required = CURATED_COLUMNS, optional = OPTIONAL_COLUMNS } = {}) {
  const input = text.replace(/^\uFEFF/u, '')
  if (!input.trim()) return []
  const records = []
  let fields = []
  let field = ''
  let line = 1
  let recordLine = 1
  let quoted = false
  let closedQuote = false
  let fieldStarted = false
  let recordStarted = false

  const endField = () => {
    fields.push(field)
    field = ''
    fieldStarted = false
    closedQuote = false
  }
  const endRecord = () => {
    endField()
    if (!blankRecord(fields)) records.push({ line: recordLine, fields })
    fields = []
    recordStarted = false
    recordLine = line + 1
  }

  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') { field += '"'; index++ }
        else { quoted = false; closedQuote = true }
      } else if (char === '\r' && input[index + 1] === '\n') {
        field += '\r\n'
        index++
        line++
      } else {
        field += char
        if (char === '\n' || char === '\r') line++
      }
      continue
    }

    if (closedQuote && char !== ',' && char !== '\r' && char !== '\n') {
      csvError(recordLine, `unexpected character after closing quote at line ${line}`)
    }
    if (char === '"' && !fieldStarted && !closedQuote) {
      quoted = true
      fieldStarted = true
      recordStarted = true
    } else if (char === '"') {
      csvError(recordLine, `quote inside an unquoted field at line ${line}`)
    } else if (char === ',') {
      endField()
      recordStarted = true
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[index + 1] === '\n') index++
      endRecord()
      line++
      recordLine = line
    } else {
      field += char
      fieldStarted = true
      recordStarted = true
    }
  }
  if (quoted) csvError(recordLine, `unterminated quoted field beginning on row ${recordLine}`)
  if (recordStarted || fields.length || field !== '' || closedQuote) endRecord()
  if (!records.length) return []

  const [headerRecord, ...dataRecords] = records
  const headers = headerRecord.fields.map((value) => value.trim())
  const allowed = new Set([...required, ...optional])
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index)
  if (duplicates.length) csvError(headerRecord.line, `duplicate column ${duplicates[0]}`)
  const missing = required.filter((column) => !headers.includes(column))
  if (missing.length) csvError(headerRecord.line, `missing required columns: ${missing.join(', ')}`)
  const unknown = headers.find((header) => !allowed.has(header))
  if (unknown) csvError(headerRecord.line, `unknown column ${unknown}`)

  return dataRecords.map(({ line: rowLine, fields: values }) => {
    if (values.length !== headers.length) {
      csvError(rowLine, `expected ${headers.length} fields, found ${values.length}`)
    }
    return {
      line: rowLine,
      value: Object.fromEntries(headers.map((header, index) => [header, values[index].trim()])),
    }
  })
}

function readNumberedReading(value, context) {
  if (!/^[a-züv:]+[1-5]\s+[a-züv:]+[1-5]$/iu.test(value)) {
    throw new Error(`${context}: reading must contain two numbered syllables with tones 1-5`)
  }
  const reading = parseReading(value)
  if (!reading) throw new Error(`${context}: invalid pinyin reading "${value}"`)
  return reading
}

const readingKey = (reading) => reading.syllables.map((syllable, index) => `${syllable}${reading.tones[index]}`).join(' ')
const normalizeDisplay = (value) => value.normalize('NFC').toLowerCase()
  .replaceAll('u:', 'ü').replaceAll('v', 'ü').replace(/[\s'’]/gu, '')

function displayMatchesReading(display, reading) {
  const parts = reading.syllables.map((syllable, index) => {
    const marked = toneMark(syllable, reading.tones[index])
    return reading.tones[index] === 5 ? [marked, `${marked}5`, `${marked}0`] : [marked]
  })
  return parts[0].some((first) => parts[1].some((second) => normalizeDisplay(display) === normalizeDisplay(first + second)))
}

function dictionaryOwner(entry, simplified, traditional) {
  return simplified === entry.simplified
    && (traditional === entry.simplified || traditional === entry.traditional || entry.variants?.includes(traditional))
}

function requireFields(row, names, errors) {
  for (const name of names) if (!row[name]) errors.push(`${name} is required`)
}

function buildWord(row, primary, alternatives) {
  const word = {
    id: row.id,
    simplified: row.simplified,
    traditional: row.traditional,
    pinyin: row.pinyinDisplay || primary.pinyin,
    syllables: primary.syllables,
    tones: primary.tones,
  }
  if (alternatives.length) word.toneAlternatives = alternatives.map((reading) => reading.tones)
  Object.assign(word, {
    gloss: row.gloss,
    definition: row.definition,
    topic: row.topic,
    exampleSimplified: row.exampleSimplified,
    exampleTraditional: row.exampleTraditional,
    exampleEnglish: row.exampleEnglish,
    hintSimplified: row.hintSimplified,
    hintTraditional: row.hintTraditional,
    hintEnglish: row.hintEnglish,
    tocflLevel: row.tocflLevel ? Number(row.tocflLevel) : null,
    sourceReference: row.sourceReference || null,
  })
  return word
}

export function buildCurated(csvText, { dictionary }) {
  if (!dictionary || !Array.isArray(dictionary.entries)) throw new Error('Dictionary must contain an entries array')
  const records = parseCsv(csvText)
  const errors = []
  const warnings = []
  const dictionaryById = new Map(dictionary.entries.map((entry) => [entry.id, entry]))
  const seenIds = new Set()
  const seenForms = new Map()
  const approved = new Map()
  const statuses = { approved: 0, candidate: 0, excluded: 0 }

  for (const { line, value: row } of records) {
    const context = `CSV row ${line}${row.id ? ` (${row.id})` : ''}`
    const rowErrors = []
    requireFields(row, ['id', 'simplified', 'traditional', 'reviewStatus'], rowErrors)
    if (row.id && !/^[A-Za-z0-9_-]+$/u.test(row.id)) rowErrors.push('id must contain only letters, digits, underscores, or hyphens')
    if (row.simplified && !HAN_FORM.test(row.simplified)) rowErrors.push('simplified must be exactly two supported Han characters')
    if (row.traditional && !HAN_FORM.test(row.traditional)) rowErrors.push('traditional must be exactly two supported Han characters')
    if (!['approved', 'candidate', 'excluded'].includes(row.reviewStatus)) rowErrors.push('reviewStatus must be approved, candidate, or excluded')

    if (seenIds.has(row.id)) rowErrors.push(`duplicate id ${row.id}`)
    if (row.id) seenIds.add(row.id)
    for (const form of row.reviewStatus === 'excluded' ? [] : [row.simplified, row.traditional].filter(Boolean)) {
      if (seenForms.has(form) && seenForms.get(form) !== row.id) rowErrors.push(`duplicate form ${form} (also used by ${seenForms.get(form)})`)
      else seenForms.set(form, row.id)
    }

    const entry = dictionaryById.get(row.id)
    if (entry && row.simplified && row.traditional && !dictionaryOwner(entry, row.simplified, row.traditional)) {
      if (row.reviewStatus === 'approved') rowErrors.push(`forms do not match dictionary entry ${row.id}`)
      else warnings.push(`${context}: dictionary forms do not match ${row.id}; ID was not remapped`)
    } else if (!entry && row.reviewStatus === 'approved') {
      rowErrors.push(`approved ID ${row.id} has no dictionary entry; use its canonical dictionary ID`)
    } else if (!entry && row.reviewStatus === 'candidate') {
      warnings.push(`${context}: no dictionary entry yet; candidate is not generated and ID was not remapped`)
    }

    if (row.reviewStatus === 'excluded' && !row.exclusionReason) rowErrors.push('exclusionReason is required for excluded rows')
    if (row.reviewStatus === 'candidate' || row.reviewStatus === 'approved') {
      requireFields(row, ['tocflLevel', 'sourceReference'], rowErrors)
    }
    if (row.tocflLevel && !/^[1-6]$/u.test(row.tocflLevel)) rowErrors.push('tocflLevel must be an integer from 1 to 6')

    let primary = null
    let alternatives = []
    if (row.pinyinNumbered) {
      try { primary = readNumberedReading(row.pinyinNumbered, context) }
      catch (error) { rowErrors.push(error.message.slice(context.length + 2)) }
    } else if (row.reviewStatus === 'approved') rowErrors.push('pinyinNumbered is required for approved rows')
    if (row.toneAlternatives) {
      for (const alternate of row.toneAlternatives.split(';').map((part) => part.trim())) {
        try { alternatives.push(readNumberedReading(alternate, context)) }
        catch (error) { rowErrors.push(error.message.slice(context.length + 2)) }
      }
    }
    if (alternatives.length && !primary) rowErrors.push('toneAlternatives requires pinyinNumbered')
    const readingKeys = new Set(primary ? [readingKey(primary)] : [])
    for (const alternative of alternatives) {
      if (primary && alternative.syllables.some((syllable, index) => syllable !== primary.syllables[index])) {
        rowErrors.push('toneAlternatives must use the same syllables as pinyinNumbered')
      }
      const key = readingKey(alternative)
      if (readingKeys.has(key)) rowErrors.push(`duplicate reading ${key}`)
      readingKeys.add(key)
    }
    if (row.pinyinDisplay && (!primary || !displayMatchesReading(row.pinyinDisplay, primary))) {
      rowErrors.push('pinyinDisplay must match the exact pinyinNumbered syllables and tones')
    }

    if (row.reviewStatus === 'approved') {
      if (entry) {
        const dictionaryReadings = new Set((entry.readings ?? []).map(readingKey))
        for (const reading of [primary, ...alternatives].filter(Boolean)) {
          const key = readingKey(reading)
          if (!dictionaryReadings.has(key)) rowErrors.push(`reading ${key} is not in dictionary entry ${row.id}`)
        }
      }
      requireFields(row, [
        'gloss', 'definition', 'topic', 'exampleSimplified', 'exampleTraditional',
        'exampleEnglish', 'hintSimplified', 'hintTraditional', 'hintEnglish',
      ], rowErrors)
      if (row.simplified && row.traditional) {
        for (const [field, hint] of [['hintSimplified', row.hintSimplified], ['hintTraditional', row.hintTraditional]]) {
          if (hint.includes(row.simplified) || hint.includes(row.traditional)) rowErrors.push(`${field} leaks the full answer`)
        }
        if ((MARKER.test(row.hintSimplified) || MARKER.test(row.hintTraditional)) && !/_{2,}/u.test(row.hintEnglish)) {
          rowErrors.push('hintEnglish must include ____ when a Chinese hint contains a blank')
        }
      }
    }

    if (rowErrors.length) {
      errors.push(`${context}: ${rowErrors.join('; ')}`)
      continue
    }
    statuses[row.reviewStatus]++
    if (row.reviewStatus === 'approved') approved.set(row.id, buildWord(row, primary, alternatives))
  }
  if (errors.length) throw new Error(errors.join('\n'))
  if (!statuses.approved) warnings.push('No approved words; daily and practice puzzles are unavailable.')

  const words = [...approved.values()]
  const answerIds = [...approved.keys()]
  return {
    artifact: {
      words,
      answerIds,
      metadata: {
        approved: statuses.approved,
        candidate: statuses.candidate,
        excluded: statuses.excluded,
        wordCount: words.length,
        answerCount: answerIds.length,
        warnings,
      },
    },
    counts: { ...statuses, wordCount: words.length, answerCount: answerIds.length },
    warnings,
  }
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

export async function main(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    if (!['--source', '--output'].includes(key) || !args[index + 1] || args[index + 1].startsWith('--') || options[key]) {
      throw new Error('Usage: node tools\\build-curated.mjs [--source content\\curated-words.csv] [--output src\\generated\\curated.json]')
    }
    options[key] = args[index + 1]
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const source = resolve(options['--source'] ?? resolve(root, 'content', 'curated-words.csv'))
  const output = resolve(options['--output'] ?? resolve(root, 'src', 'generated', 'curated.json'))
  const [csv, dictionaryText] = await Promise.all([
    readFile(source, 'utf8'),
    readFile(resolve(root, 'src', 'generated', 'dictionary.json'), 'utf8'),
  ])
  const result = buildCurated(csv, {
    dictionary: JSON.parse(dictionaryText),
  })
  await atomicWrite(output, `${JSON.stringify(result.artifact)}\n`)
  console.log(JSON.stringify({ output, ...result.counts, answerIds: result.artifact.answerIds.length, warnings: result.warnings }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
