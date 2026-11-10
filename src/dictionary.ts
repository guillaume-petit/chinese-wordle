import runtimeUrl from './generated/dictionary.runtime.json?url'
import type { DictionaryEntry, Reading } from './types'

/** Compact rows written by tools/build-runtime-dictionary.mjs. */
type CompactRow = [simplified: string, traditional: string, readings: string, gloss: string, variants?: string, frequency?: number | null]
export interface CompactDictionary { format: number; rows: CompactRow[] }
const RUNTIME_FORMAT = 1

// Populated in place by installDictionary(); empty until the dictionary has loaded.
export const dictionary: DictionaryEntry[] = []
export const dictionaryById = new Map<string, DictionaryEntry>()
export const wordByForm = new Map<string, string>()
/** Every syllable and syllable prefix used by a dictionary reading, for pinyin segmentation. */
export const syllables = new Set<string>()
export const syllablePrefixes = new Set<string>()

const marks: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'], e: ['ē', 'é', 'ě', 'è'], i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'], u: ['ū', 'ú', 'ǔ', 'ù'], ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

/** Same rules as toneMark() in tools/build-dictionary.mjs. */
function toneMark(syllable: string, tone: number): string {
  const text = syllable.replaceAll('v', 'ü')
  if (tone === 5) return text
  let index = text.indexOf('a')
  if (index < 0) index = text.indexOf('e')
  if (index < 0 && text.includes('ou')) index = text.indexOf('o')
  if (index < 0) {
    for (let i = text.length - 1; i >= 0; i--) {
      if (marks[text[i]]) { index = i; break }
    }
  }
  if (index < 0) return `${text}${tone}`
  return text.slice(0, index) + marks[text[index]][tone - 1] + text.slice(index + 1)
}

function decodeReading(text: string): Reading {
  const parts = text.split(' ').map((part) => /^([a-z]+)([1-5])$/.exec(part))
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error(`Invalid dictionary reading "${text}"`)
  const syllablePair = parts.map((part) => part![1]) as [string, string]
  const tones = parts.map((part) => Number(part![2])) as [number, number]
  return { pinyin: syllablePair.map((syllable, index) => toneMark(syllable, tones[index])).join(''), syllables: syllablePair, tones }
}

const idOf = (simplified: string) => `cedict_${[...simplified].map((char) => char.codePointAt(0)!.toString(16)).join('_')}`

export function decodeDictionary(compact: CompactDictionary): DictionaryEntry[] {
  if (compact?.format !== RUNTIME_FORMAT || !Array.isArray(compact.rows)) throw new Error('Unsupported dictionary format')
  return compact.rows.map(([simplified, traditional, readings, gloss, variants = '', frequency = null]) => {
    const decoded = readings.split(';').map(decodeReading)
    const [primary] = decoded
    return {
      id: idOf(simplified),
      simplified,
      traditional: traditional || simplified,
      variants: variants ? variants.split(',') : [],
      pinyin: primary.pinyin,
      syllables: primary.syllables,
      tones: primary.tones,
      readings: decoded,
      frequency,
      gloss,
    }
  })
}

export function installDictionary(entries: DictionaryEntry[]): void {
  dictionary.length = 0
  dictionaryById.clear()
  wordByForm.clear()
  syllables.clear()
  syllablePrefixes.clear()
  for (const entry of entries) {
    dictionary.push(entry)
    dictionaryById.set(entry.id, entry)
    for (const form of [entry.simplified, entry.traditional, ...entry.variants]) {
      const previous = wordByForm.get(form)
      if (previous && previous !== entry.id) throw new Error(`Conflicting dictionary form: ${form}`)
      wordByForm.set(form, entry.id)
    }
    for (const reading of entry.readings) for (const syllable of reading.syllables) syllables.add(syllable)
  }
  for (const syllable of syllables) {
    for (let length = 1; length <= syllable.length; length++) syllablePrefixes.add(syllable.slice(0, length))
  }
}

export const isDictionaryReady = () => dictionary.length > 0

let loading: Promise<void> | null = null

/** Fetches the separately cached dictionary asset once; retries after a failure. */
export function loadDictionary(): Promise<void> {
  if (isDictionaryReady()) return Promise.resolve()
  loading ??= fetch(runtimeUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Dictionary request failed (${response.status})`)
      return response.json() as Promise<CompactDictionary>
    })
    .then((compact) => installDictionary(decodeDictionary(compact)))
    .catch((error: unknown) => {
      loading = null
      throw error
    })
  return loading
}
