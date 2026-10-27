import { dictionary } from './dictionary'
import type { DictionaryEntry, Reading, Script } from './types'

const toneMarks: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'], e: ['ē', 'é', 'ě', 'è'], i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'], u: ['ū', 'ú', 'ǔ', 'ù'], v: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
}
const markedVowels = new Map<string, { base: string; tone: number }>()
for (const [base, marks] of Object.entries(toneMarks)) {
  marks.forEach((mark, index) => markedVowels.set(mark, { base, tone: index + 1 }))
}
const syllables = new Set(dictionary.flatMap((entry) => entry.readings.flatMap((reading) => reading.syllables)))
const syllablePrefixes = new Set<string>()
for (const syllable of syllables) {
  for (let length = 1; length <= syllable.length; length++) syllablePrefixes.add(syllable.slice(0, length))
}

export function normalizePinyin(input: string): string | null {
  let value = input.normalize('NFC').trim().toLowerCase().replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
  value = value.replace(/u:/g, 'v').replace(/ü/g, 'v').replace(/0/g, '5')
  value = value.split(/([ ']+)/).map((part) => {
    if (!part || /^[ ']+$/.test(part)) return part
    let letters = ''
    const marks: Array<{ position: number; tone: number }> = []
    for (const char of part) {
      const marked = markedVowels.get(char)
      if (marked) {
        marks.push({ position: letters.length, tone: marked.tone })
        letters += marked.base
      } else letters += char
    }
    if (!marks.length) return letters
    // An explicit digit already terminates a syllable; don't add its mark twice.
    if (/[1-5]/.test(letters)) {
      const parts = letters.match(/[a-z]+[1-5]?/g)
      if (!parts || parts.join('') !== letters) return '!'
      let offset = 0
      return parts.map((segment) => {
        const segmentMarks = marks.filter((mark) => mark.position >= offset && mark.position < offset + segment.length)
        offset += segment.length
        if (segmentMarks.length > 1) return '!'
        const tone = segmentMarks[0]?.tone
        const digit = segment.match(/[1-5]$/)?.[0]
        if (tone && digit && tone !== Number(digit)) return '!'
        return digit ? segment : `${segment}${tone ?? ''}`
      }).join('')
    }
    const boundaries = [letters.length]
    if (!(syllables.has(letters) && marks.length === 1)) {
      for (let split = 1; split < letters.length; split++) {
        if (syllables.has(letters.slice(0, split)) && syllablePrefixes.has(letters.slice(split))) boundaries.unshift(split)
      }
    }
    const split = boundaries.find((boundary) =>
      syllables.has(letters.slice(0, boundary)) &&
      (boundary === letters.length || syllablePrefixes.has(letters.slice(boundary))) &&
      marks.filter((mark) => mark.position < boundary).length <= 1 &&
      marks.filter((mark) => mark.position >= boundary).length <= 1,
    )
    if (split === undefined) return '!'
    const firstTone = marks.find((mark) => mark.position < split)?.tone
    const secondTone = marks.find((mark) => mark.position >= split)?.tone
    return `${letters.slice(0, split)}${firstTone ?? ''}${letters.slice(split)}${secondTone ?? ''}`
  }).join('')
  return /^[a-z1-5' ]*$/.test(value) && !/(^|[^a-z])[1-5]/.test(value) && !/[1-5]{2}/.test(value) ? value : null
}

interface Segment { letters: string; tone?: number }
function segmentsOf(value: string): Segment[] | null {
  const parts = value.split(/[ ']+/).filter(Boolean).map((part) => {
    const match = part.match(/^([a-z]+)([1-5]?)$/)
    return match ? { letters: match[1], tone: match[2] ? Number(match[2]) : undefined } : null
  })
  return parts.length > 0 && parts.length <= 2 && parts.every((part) => part !== null) ? parts : null
}

interface IndexedReading { word: DictionaryEntry; reading: Reading; pinyin: string }
const indexes = new WeakMap<DictionaryEntry[], Map<string, IndexedReading[]>>()

export function preparePinyinIndex(entries: DictionaryEntry[]): Map<string, IndexedReading[]> {
  const existing = indexes.get(entries)
  if (existing) return existing
  const index = new Map<string, IndexedReading[]>()
  for (const word of entries) {
    for (const reading of word.readings) {
      const first = reading.syllables[0][0]
      const bucket = index.get(first) ?? []
      bucket.push({ word, reading, pinyin: reading.syllables.join('') })
      index.set(first, bucket)
    }
  }
  indexes.set(entries, index)
  return index
}

interface Match { quality: number; tones: number; pinyin: string; reading: Reading; word: DictionaryEntry }
function compare(a: Match, b: Match): number {
  return b.quality - a.quality || b.tones - a.tones ||
    (a.word.frequency ?? Number.MAX_SAFE_INTEGER) - (b.word.frequency ?? Number.MAX_SAFE_INTEGER) ||
    a.pinyin.localeCompare(b.pinyin) || a.word.simplified.localeCompare(b.word.simplified) ||
    a.reading.pinyin.localeCompare(b.reading.pinyin)
}

export function suggestions(query: string, entries: DictionaryEntry[], submitted: string[], script: Script, limit = 8) {
  const normalized = normalizePinyin(query)
  if (!normalized) return []
  const variants: Segment[][] = []
  const explicit = /[ ']/.test(normalized)
  if (!explicit) {
    for (let split = 1; split < normalized.length; split++) {
      const first = segmentsOf(normalized.slice(0, split))
      const second = segmentsOf(normalized.slice(split))
      if (first?.length === 1 && second?.length === 1) variants.push([first[0], second[0]])
    }
  }
  const direct = segmentsOf(normalized)
  if (direct) variants.push(direct)
  const results = new Map<string, Match>()
  const bucket = preparePinyinIndex(entries).get(normalized[0]) ?? []
  for (const { word, reading, pinyin } of bucket) {
    for (const variant of variants) {
      if (!variant.every((part, index) => reading.syllables[index].startsWith(part.letters) &&
        (part.tone === undefined || part.tone === reading.tones[index]))) continue
      const full = variant.filter((part, index) => part.letters === reading.syllables[index]).length
      const candidate: Match = {
        quality: variant.length === 1 ? 1 : full === 2 ? 4 : full === 1 ? 3 : 2,
        tones: variant.filter((part) => part.tone !== undefined).length,
        pinyin, reading, word,
      }
      const previous = results.get(word.id)
      if (!previous || compare(candidate, previous) < 0) results.set(word.id, candidate)
    }
  }
  return [...results.values()].sort(compare).slice(0, limit).map(({ word, reading }) => ({
    id: word.id,
    text: script === 'simplified' ? word.simplified : word.traditional,
    pinyin: reading.pinyin,
    gloss: word.gloss,
    disabled: submitted.includes(word.id),
  }))
}
