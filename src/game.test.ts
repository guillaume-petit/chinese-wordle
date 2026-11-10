import { describe, expect, it } from 'vitest'
import { answerPool, words } from './curated-test-fixtures'
import { dictionaryById } from './dictionary'
import { addHint, dailyAnswerId, formatChineseDate, isAssisted, isHintAvailable, makeDailyGame, normalizePinyin, scoreGuess, scorePinyinParts, shanghaiDate, shareText, suggestions, upcomingAnswerIds, vocabularyLevelForDate } from './game'

describe('game helpers', () => {
  it('ignores legacy topic usage but preserves sentence and pronunciation assistance', () => {
    const game = makeDailyGame('2026-10-12', 'cedict_670b_53cb')
    game.hintsUsed = ['topic']
    expect(isAssisted(game)).toBe(false)
    expect(shareText(game, false, 'https://example.com')).not.toContain('💡')
    for (const hint of ['sentence', 'pronunciation'] as const) {
      const assisted = { ...game, hintsUsed: [...game.hintsUsed, hint] }
      expect(isAssisted(assisted)).toBe(true)
      expect(shareText(assisted, false, 'https://example.com')).toContain('💡')
    }
  })
  it('shares green correct squares in high-contrast mode', () => {
    const game = makeDailyGame('2026-10-12', 'cedict_670b_53cb')
    game.guesses = [{ wordId: 'cedict_5929_6c14', tiles: ['correct', 'present'] }]
    expect(shareText(game, true, 'https://example.com')).toContain('🟩🟦')
    expect(shareText(game, false, 'https://example.com')).toContain('🟩🟨')
  })

  it('unlocks sentence hints only after three failed guesses in active puzzles', () => {
    const game = makeDailyGame('2026-10-12', 'cedict_670b_53cb')
    const failed = { wordId: 'cedict_5929_6c14', tiles: ['absent', 'absent'] as const }
    game.guesses = Array.from({ length: 2 }, () => ({ ...failed, tiles: [...failed.tiles] }))
    expect(isHintAvailable(game, 'sentence')).toBe(false)
    expect(addHint(game, 'sentence')).toBe(game)
    game.guesses.push({ ...failed, tiles: [...failed.tiles] })
    expect(isHintAvailable(game, 'sentence')).toBe(true)
    const assisted = addHint(game, 'sentence')
    expect(assisted.hintsUsed).toEqual(['sentence'])
    expect(isHintAvailable(assisted, 'sentence')).toBe(false)
    expect(isHintAvailable({ ...game, status: 'won' }, 'sentence')).toBe(false)
    expect(isHintAvailable({ ...game, status: 'lost' }, 'sentence')).toBe(false)
    expect(isHintAvailable({ ...game, guesses: [...game.guesses.slice(0, 2), { wordId: 'cedict_670b_53cb', tiles: ['correct', 'correct'] }] }, 'sentence')).toBe(false)
  })

  it('bundles English clues for every word and preserves Chinese answer blanks', () => {
    for (const word of words) {
      expect(word.hintEnglish.trim().length).toBeGreaterThan(0)
      if (word.hintSimplified.includes('＿＿')) expect(word.hintEnglish).toContain('____')
    }
  })

  it('scores duplicate characters using occurrence-aware matching', () => {
    expect(scoreGuess('谢谢', '谢意')).toEqual(['correct', 'absent'])
    expect(scoreGuess('朋友', '友朋')).toEqual(['present', 'present'])
  })

  it('compares pinyin initial, final, and tone independently per character', () => {
    const target = words.find((word) => word.id === 'cedict_4f60_597d')!
    const guess = words.find((word) => word.id === 'cedict_559c_6b22')!
    expect(scorePinyinParts(guess, target)).toEqual([
      [
        { kind: 'initial', value: 'x', matches: false },
        { kind: 'final', value: 'i', matches: true },
        { kind: 'tone', value: 'third tone', matches: true, toneMark: 'ˇ' },
      ],
      [
        { kind: 'initial', value: 'h', matches: true },
        { kind: 'final', value: 'uan', matches: false },
        { kind: 'tone', value: 'first tone', matches: false, toneMark: 'ˉ' },
      ],
    ])
  })

  it('uses the conventional pinyin tone marks in order', () => {
    const answer = words.find((word) => word.id === 'cedict_4f60_597d')!
    const tones = [1, 2, 3, 4, 5] as const
    const samples = tones.map((tone) => ({
      ...answer,
      tones: [tone, tone] as [number, number],
      syllables: ['ma', 'ma'] as [string, string],
    }))
    expect(samples.map((word) => scorePinyinParts(word, word)[0][2].toneMark)).toEqual(['ˉ', 'ˊ', 'ˇ', 'ˋ', '·'])
  })

  it('normalizes marked, numbered and full-width pinyin', () => {
    expect(normalizePinyin('ＰéNG yǒu')).toBe('peng2 you3')
    expect(normalizePinyin('péngyǒu')).toBe('peng2you3')
    expect(normalizePinyin('peng0you')).toBe('peng5you')
    expect(normalizePinyin('lu:se')).toBe('lvse')
    expect(normalizePinyin('peng6you')).toBeNull()
  })

  it('matches tone-marked, abbreviated and bounded pinyin without answer data', () => {
    const entries = words.map((word) => dictionaryById.get(word.id)!)
    expect(suggestions('pengyou', entries, [], 'simplified')[0].id).toBe('cedict_670b_53cb')
    expect(suggestions('peng2you5', entries, [], 'simplified')[0].id).toBe('cedict_670b_53cb')
    expect(suggestions('péngyou', entries, [], 'traditional')[0].text).toBe('朋友')
    expect(suggestions('py', entries, [], 'simplified').some((item) => item.id === 'cedict_670b_53cb')).toBe(true)
    expect(suggestions("xi'an", entries, [], 'simplified')).toEqual([])
    expect(suggestions('pengyou', entries, ['cedict_670b_53cb'], 'simplified')[0].disabled).toBe(true)
    expect(answerPool.every((word) => words.some((record) => record.id === word.id))).toBe(true)
  })

  it('uses the Shanghai calendar date', () => {
    expect(shanghaiDate(new Date('2026-10-10T15:59:00.000Z'))).toBe('2026-10-10')
    expect(shanghaiDate(new Date('2026-10-10T16:01:00.000Z'))).toBe('2026-10-11')
  })

  it('formats puzzle dates in Chinese and assigns vocabulary bands by Shanghai weekday', () => {
    expect(formatChineseDate('2026-10-12')).toBe('2026年10月12日')
    expect(vocabularyLevelForDate('2026-10-12')).toBe('Novice')
    expect(vocabularyLevelForDate('2026-10-13')).toBe('Novice')
    expect(vocabularyLevelForDate('2026-10-14')).toBe('Intermediate')
    expect(vocabularyLevelForDate('2026-10-15')).toBe('Intermediate')
    expect(vocabularyLevelForDate('2026-10-16')).toBe('Advanced')
    expect(vocabularyLevelForDate('2026-10-17')).toBe('Advanced')
    expect(vocabularyLevelForDate('2026-10-18')).toBeNull()
  })

  it('reads the daily answer from the schedule, unaffected by later pool growth', () => {
    const [a, b, c] = answerPool
    const schedule = { start: '2026-11-10', answerIds: [b.id, c.id] }
    expect(dailyAnswerId('2026-11-10', schedule, answerPool)).toBe(b.id)
    expect(dailyAnswerId('2026-11-11', schedule, answerPool)).toBe(c.id)
    expect(dailyAnswerId('2026-11-11', schedule, [...answerPool, ...words.slice(0, 1)])).toBe(c.id)
    expect(dailyAnswerId('2026-11-11', schedule, [c, a])).toBe(c.id)
    expect(upcomingAnswerIds('2026-11-10', 2, schedule, answerPool)).toEqual(new Set([b.id, c.id]))
  })

  it('falls back deterministically outside the schedule or for removed words', () => {
    const schedule = { start: '2026-11-10', answerIds: [answerPool[0].id] }
    for (const date of ['2026-11-09', '2026-11-11', '2030-01-01']) {
      const id = dailyAnswerId(date, schedule, answerPool)
      expect(answerPool.map((word) => word.id)).toContain(id)
      expect(dailyAnswerId(date, schedule, answerPool)).toBe(id)
    }
    expect(dailyAnswerId('2026-11-10', schedule, answerPool.slice(1))).not.toBe(answerPool[0].id)
    expect(dailyAnswerId('2026-11-10', { start: null, answerIds: [] }, [])).toBeNull()
  })
})
