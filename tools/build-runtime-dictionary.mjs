import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Compact runtime format, decoded by src/dictionary.ts. Each row is
 * [simplified, traditional, readings, gloss, variants?, frequency?] where:
 * - traditional is '' when equal to simplified;
 * - readings are numbered syllables, e.g. "peng2 you5;peng2 you3" (primary first);
 * - variants are comma-separated, omitted when empty, frequency omitted when null.
 * IDs, tone-marked pinyin and primary reading fields are derived on the client,
 * and the unused `glosses` list is dropped.
 */
export const RUNTIME_FORMAT = 1

const SUPPORTED_ENTRY_KEYS = ['frequency', 'gloss', 'glosses', 'id', 'pinyin', 'readings', 'simplified', 'syllables', 'tones', 'traditional', 'variants']
const expectedId = (simplified) => `cedict_${[...simplified].map((char) => char.codePointAt(0).toString(16)).join('_')}`
const readingText = (reading) => reading.syllables.map((syllable, index) => `${syllable}${reading.tones[index]}`).join(' ')

export function compactDictionary(dictionary) {
  if (!dictionary || !Array.isArray(dictionary.entries)) throw new Error('Dictionary must contain an entries array')
  const rows = dictionary.entries.map((entry) => {
    const unknown = Object.keys(entry).filter((key) => !SUPPORTED_ENTRY_KEYS.includes(key))
    if (unknown.length) throw new Error(`${entry.id}: unsupported fields ${unknown.join(', ')}; update the runtime format`)
    if (entry.id !== expectedId(entry.simplified)) throw new Error(`${entry.id}: ID is not derived from ${entry.simplified}`)
    const [primary] = entry.readings
    if (!primary || primary.pinyin !== entry.pinyin || readingText(primary) !== readingText(entry)) {
      throw new Error(`${entry.id}: primary fields must equal the first reading`)
    }
    if (entry.variants.some((variant) => variant.includes(','))) throw new Error(`${entry.id}: variant contains a separator`)
    const row = [
      entry.simplified,
      entry.traditional === entry.simplified ? '' : entry.traditional,
      entry.readings.map(readingText).join(';'),
      entry.gloss,
      entry.variants.join(','),
      entry.frequency,
    ]
    while (row.length > 4 && (row.at(-1) === null || row.at(-1) === '')) row.pop()
    return row
  })
  return { format: RUNTIME_FORMAT, rows }
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
  if (args.length) throw new Error('Usage: node tools/build-runtime-dictionary.mjs')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const source = resolve(root, 'src', 'generated', 'dictionary.json')
  const output = resolve(root, 'src', 'generated', 'dictionary.runtime.json')
  const compact = compactDictionary(JSON.parse(await readFile(source, 'utf8')))
  const text = `${JSON.stringify(compact)}\n`
  await atomicWrite(output, text)
  console.log(JSON.stringify({ output, entries: compact.rows.length, bytes: Buffer.byteLength(text) }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
