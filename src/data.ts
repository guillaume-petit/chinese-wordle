import source from './generated/curated.json?raw'
import type { Word } from './types'

// Spreadsheet content is validated by tools/build-curated.mjs before publication.
const curated: { words: Word[]; answerIds: string[] } = JSON.parse(source)
export const words = curated.words
export const wordById = new Map(words.map((word) => [word.id, word]))
export const answerPool = curated.answerIds.map((id) => {
  const word = wordById.get(id)
  if (!word) throw new Error(`Missing curated answer: ${id}`)
  return word
})
