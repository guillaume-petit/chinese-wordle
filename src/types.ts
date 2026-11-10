export type Script = 'simplified' | 'traditional'
export type TileState = 'correct' | 'present' | 'absent'
export type HintType = 'sentence'
export type GameStatus = 'active' | 'won' | 'lost' | 'expired'

export interface Reading {
  pinyin: string
  syllables: [string, string]
  tones: [number, number]
}

export interface DictionaryEntry extends Reading {
  id: string
  simplified: string
  traditional: string
  variants: string[]
  readings: Reading[]
  frequency: number | null
  gloss: string
}

export interface Word extends Reading {
  id: string
  simplified: string
  traditional: string
  toneAlternatives?: Array<[number, number]>
  gloss: string
  definition: string
  topic: string
  exampleSimplified: string
  exampleTraditional: string
  exampleEnglish: string
  hintSimplified: string
  hintTraditional: string
  hintEnglish: string
  tocflLevel?: 1 | 2 | 3 | 4 | 5 | 6 | null
  sourceReference?: string | null
}

export interface Guess {
  wordId: string
  tiles: TileState[]
  reading?: Reading
}

export type PinyinPartKind = 'initial' | 'final' | 'tone'

export interface PinyinPartFeedback {
  kind: PinyinPartKind
  value: string
  matches: boolean
  toneMark?: string
}

export interface Game {
  puzzleId: string
  date: string
  mode: 'daily' | 'practice'
  answerId: string
  guesses: Guess[]
  hintsUsed: Array<HintType | 'topic' | 'pronunciation'>
  status: GameStatus
  startedAt: string
  completedAt?: string
}

export interface Settings {
  script: Script
  defaultInputMode: 'pinyin' | 'native'
  showGlosses: boolean
  highContrast: boolean
  darkMode: 'system' | 'light' | 'dark'
  reducedMotion: 'system' | 'on' | 'off'
}

export interface PersistedData {
  games: Game[]
  savedWords: string[]
  settings: Settings
  onboardingDone: boolean
}

/** Fixed date-to-answer schedule; `answerIds[i]` is the answer for `start + i` days. */
export interface DailySchedule {
  start: string | null
  answerIds: string[]
}
