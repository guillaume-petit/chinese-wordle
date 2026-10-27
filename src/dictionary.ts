import source from './generated/dictionary.json?raw'
import type { DictionaryEntry } from './types'

// The importer validates this schema before writing the bundled artifact.
const bundled: { entries: DictionaryEntry[]; metadata: Record<string, unknown> } = JSON.parse(source)
export const dictionary: DictionaryEntry[] = bundled.entries
export const dictionaryMetadata = bundled.metadata
export const dictionaryById = new Map(dictionary.map((entry) => [entry.id, entry]))
export const wordByForm = new Map<string, string>()

for (const entry of dictionary) {
  for (const form of [entry.simplified, entry.traditional, ...entry.variants]) {
    const previous = wordByForm.get(form)
    if (previous && previous !== entry.id) throw new Error(`Conflicting dictionary form: ${form}`)
    wordByForm.set(form, entry.id)
  }
}
