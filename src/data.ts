import curatedUrl from './generated/curated.json?url'
import type { DailySchedule, Word } from './types'

// Spreadsheet content is validated by tools/build-curated.mjs before publication.
export interface CuratedContent { words: Word[]; answerIds: string[]; schedule?: DailySchedule }

// Populated in place by installCurated(); empty until the curated asset has loaded.
export const words: Word[] = []
export const wordById = new Map<string, Word>()
export const answerPool: Word[] = []
export const schedule: DailySchedule = { start: null, answerIds: [] }

let installed = false

export function installCurated(curated: CuratedContent): void {
  const byId = new Map(curated.words.map((word) => [word.id, word]))
  const pool = curated.answerIds.map((id) => {
    const word = byId.get(id)
    if (!word) throw new Error(`Missing curated answer: ${id}`)
    return word
  })
  words.splice(0, words.length, ...curated.words)
  wordById.clear()
  for (const [id, word] of byId) wordById.set(id, word)
  answerPool.splice(0, answerPool.length, ...pool)
  schedule.start = curated.schedule?.start ?? null
  schedule.answerIds = curated.schedule?.answerIds ?? []
  installed = true
}

/** Loaded, even if no word is approved yet (the app then explains the empty state). */
export const isCuratedReady = () => installed

let loading: Promise<void> | null = null

/** Fetches the separately cached curated asset once; retries after a failure. */
export function loadCurated(): Promise<void> {
  if (installed) return Promise.resolve()
  loading ??= fetch(curatedUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Curated content request failed (${response.status})`)
      return response.json() as Promise<CuratedContent>
    })
    .then(installCurated)
    .catch((error: unknown) => {
      loading = null
      throw error
    })
  return loading
}

/** Test hook: forget loaded content so loading can be exercised again. */
export function resetCurated(): void {
  installed = false
  loading = null
}
