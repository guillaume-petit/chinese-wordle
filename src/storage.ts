import type { Game, PersistedData, Settings } from './types'
import { wordById } from './data'
import { dictionaryById } from './dictionary'

const key = 'ciyu-daily-v1'
export const defaultSettings: Settings = {
  script: 'simplified',
  defaultInputMode: 'pinyin',
  showGlosses: true,
  highContrast: false,
  darkMode: 'system',
  reducedMotion: 'system',
}
const emptyData: PersistedData = { games: [], savedWords: [], settings: defaultSettings, onboardingDone: false }

export function loadData(): PersistedData {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return emptyData
    const data = JSON.parse(raw) as Partial<PersistedData>
    return {
      games: Array.isArray(data.games) ? data.games.filter((game) =>
        wordById.has(game.answerId) && Array.isArray(game.guesses) &&
        game.guesses.every((guess) => dictionaryById.has(guess.wordId)),
      ) : [],
      savedWords: Array.isArray(data.savedWords) ? data.savedWords.filter((id) => wordById.has(id)) : [],
      settings: { ...defaultSettings, ...data.settings },
      onboardingDone: Boolean(data.onboardingDone),
    }
  } catch (error) {
    console.error('Unable to load saved game data.', error)
    return emptyData
  }
}

export function saveData(data: PersistedData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    void navigator.storage?.persist?.()
  } catch (error) {
    console.error('Unable to save game data.', error)
  }
}

export function replaceGame(games: Game[], game: Game): Game[] {
  const index = games.findIndex((item) => item.puzzleId === game.puzzleId)
  if (index < 0) return [...games, game]
  return games.map((item) => item.puzzleId === game.puzzleId ? game : item)
}
