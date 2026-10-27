import type { Game, HintType, PinyinPartFeedback, Reading, Script, TileState } from './types'
import { wordByForm } from './dictionary'
export { normalizePinyin, suggestions } from './pinyin'

export function resolveGuess(value: string): string | null {
  return wordByForm.get(value.trim()) ?? null
}

export function displayForm(word: { simplified: string; traditional: string }, script: Script): string {
  return script === 'simplified' ? word.simplified : word.traditional
}

export function scoreGuess(guess: string, answer: string): TileState[] {
  const guessed = [...guess]
  const answerChars = [...answer]
  const result: TileState[] = guessed.map(() => 'absent')
  const remaining = new Map<string, number>()
  guessed.forEach((character, index) => {
    if (character === answerChars[index]) result[index] = 'correct'
    else remaining.set(answerChars[index], (remaining.get(answerChars[index]) ?? 0) + 1)
  })
  guessed.forEach((character, index) => {
    if (result[index] === 'correct') return
    const count = remaining.get(character) ?? 0
    if (count > 0) {
      result[index] = 'present'
      remaining.set(character, count - 1)
    }
  })
  return result
}

const pinyinInitials = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']

function splitPinyinSyllable(syllable: string): { initial: string; final: string } {
  const initial = pinyinInitials.find((candidate) => syllable.startsWith(candidate)) ?? ''
  return { initial, final: syllable.slice(initial.length) }
}

function toneName(tone: number): string {
  const ordinal = ['first', 'second', 'third', 'fourth', 'neutral'][tone - 1]
  return `${ordinal} tone`
}

function toneGlyph(tone: number): string {
  return ['ˉ', 'ˊ', 'ˇ', 'ˋ', '·'][tone - 1] ?? ''
}

export function scorePinyinParts(guess: Reading, answer: Reading & { toneAlternatives?: Array<[number, number]> }): PinyinPartFeedback[][] {
  return guess.syllables.map((syllable, index) => {
    const guessParts = splitPinyinSyllable(syllable)
    const answerParts = splitPinyinSyllable(answer.syllables[index])
    const answerTones = [answer.tones[index], ...(answer.toneAlternatives ?? []).map((tones) => tones[index])]
    return [
      { kind: 'initial', value: guessParts.initial || '∅', matches: guessParts.initial === answerParts.initial },
      { kind: 'final', value: guessParts.final, matches: guessParts.final === answerParts.final },
      { kind: 'tone', value: toneName(guess.tones[index]), matches: answerTones.includes(guess.tones[index]), toneMark: toneGlyph(guess.tones[index]) },
    ]
  })
}

export function isHintAvailable(game: Game, hint: HintType): boolean {
  if (game.status !== 'active' || game.hintsUsed.includes(hint)) return false
  const failed = game.guesses.filter((guess) => !guess.tiles.every((tile) => tile === 'correct')).length
  return hint === 'sentence' && failed >= 3
}

export function isAssisted(game: Game): boolean {
  return game.hintsUsed.some((hint) => hint === 'sentence' || hint === 'pronunciation')
}

export function addHint(game: Game, hint: HintType): Game {
  return isHintAvailable(game, hint) ? { ...game, hintsUsed: [...game.hintsUsed, hint] } : game
}

export function shanghaiDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function formatChineseDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

export type VocabularyLevel = 'Novice' | 'Intermediate' | 'Advanced'

export function vocabularyLevelForDate(date: string): VocabularyLevel | null {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  if (weekday === 1 || weekday === 2) return 'Novice'
  if (weekday === 3 || weekday === 4) return 'Intermediate'
  if (weekday === 5 || weekday === 6) return 'Advanced'
  return null
}

export function nextShanghaiMidnight(date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date)
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value)
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day') + 1) - 8 * 60 * 60 * 1000)
}

export function makeDailyGame(date: string, answerId: string): Game {
  return { puzzleId: `d_${date}`, date, mode: 'daily', answerId, guesses: [], hintsUsed: [], status: 'active', startedAt: new Date().toISOString() }
}

export function makePracticeGame(answerId: string): Game {
  return { ...makeDailyGame(`practice-${Date.now()}`, answerId), puzzleId: `p_${crypto.randomUUID()}`, mode: 'practice' }
}

export function shareText(game: Game, highContrast: boolean, url = window.location.origin): string {
  const squares: Record<TileState, string> = highContrast
    ? { correct: '🟩', present: '🟦', absent: '⬜' }
    : { correct: '🟩', present: '🟨', absent: '⬜' }
  const result = game.status === 'won' ? `${game.guesses.length}/6` : 'X/6'
  const rows = game.guesses.map((guess) => guess.tiles.map((tile) => squares[tile]).join(''))
  const label = game.mode === 'daily' ? `词语 Daily ${formatChineseDate(game.date)}` : '词语 Daily Practice'
  return [`${label} ${result}${isAssisted(game) ? ' 💡' : ''}`, ...rows, url].join('\n')
}
