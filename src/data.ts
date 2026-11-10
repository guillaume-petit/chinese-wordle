import source from './generated/curated.json?raw'
import type { DailySchedule, Word } from './types'

// Spreadsheet content is validated by tools/build-curated.mjs before publication.
const curated: { words: Word[]; answerIds: string[]; schedule?: DailySchedule } = JSON.parse(source)
export const words = curated.words
export const wordById = new Map(words.map((word) => [word.id, word]))
export const answerPool = curated.answerIds.map((id) => {
  const word = wordById.get(id)
  if (!word) throw new Error(`Missing curated answer: ${id}`)
  return word
})
export const schedule: DailySchedule = curated.schedule ?? { start: null, answerIds: [] }
