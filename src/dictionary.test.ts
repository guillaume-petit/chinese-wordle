import { describe, expect, it } from 'vitest'
import { answerPool, words } from './data'
import { dictionary, dictionaryById, wordByForm } from './dictionary'
import { resolveGuess } from './game'
import { normalizePinyin, preparePinyinIndex, suggestions } from './pinyin'

describe('bundled accepted-guess dictionary', () => {
  it('keeps accepted guesses separate from curated learning content', () => {
    expect(dictionary.length).toBeGreaterThan(20_000)
    expect(answerPool.every((word) => words.some((record) => record.id === word.id))).toBe(true)
    expect(dictionary.some((entry) => entry.id.startsWith('w_'))).toBe(false)
    expect(new Set(answerPool.map((word) => word.id)).size).toBe(answerPool.length)
    for (const word of words) {
      const entry = dictionaryById.get(word.id)!
      expect(entry).toBeDefined()
      expect(entry.readings.some((reading) =>
        reading.syllables.join(' ') === word.syllables.join(' ') &&
        reading.tones.join(' ') === word.tones.join(' '),
      )).toBe(true)
      expect(resolveGuess(word.simplified)).toBe(word.id)
      expect(resolveGuess(word.traditional)).toBe(word.id)
    }
    const bank = dictionaryById.get(resolveGuess('银行')!)!
    expect(bank).toBeDefined()
    expect(resolveGuess(' 銀行 ')).toBe(bank.id)
    expect(bank).not.toHaveProperty('topic')
    expect(bank).not.toHaveProperty('hintSimplified')
    expect(suggestions('yin2hang2', dictionary, [], 'traditional').some((item) => item.id === bank.id)).toBe(true)
  })

  it('contains unique IDs/forms and only supported two-character entries', () => {
    expect(dictionaryById.size).toBe(dictionary.length)
    expect(new Set(dictionary.map((entry) => entry.simplified)).size).toBe(dictionary.length)
    for (const entry of dictionary) {
      for (const form of [entry.simplified, entry.traditional, ...entry.variants]) {
        expect(form).toMatch(/^[\u3400-\u9fff]{2}$/)
        expect(wordByForm.get(form)).toBe(entry.id)
      }
      expect(entry.readings.length).toBeGreaterThan(0)
      expect(entry.frequency === null || (Number.isInteger(entry.frequency) && entry.frequency > 0)).toBe(true)
    }
    expect(resolveGuess('A股')).toBeNull()
    expect(resolveGuess('中华人民共和国')).toBeNull()
  })

  it('searches multiple readings and merges script variants into one result', () => {
    const entries = dictionary.filter((entry) => new Set(entry.readings.map((reading) => reading.syllables.join(''))).size > 1).slice(0, 15)
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      for (const reading of entry.readings) {
        const query = reading.syllables.map((syllable, index) => `${syllable}${reading.tones[index]}`).join("'")
        const found = suggestions(query, dictionary, [], 'simplified', dictionary.length)
        expect(found.filter((item) => item.id === entry.id)).toHaveLength(1)
        expect(found.find((item) => item.id === entry.id)?.pinyin).toBe(reading.pinyin)
        expect(suggestions(query, dictionary, [], 'traditional', dictionary.length).map((item) => item.id)).toEqual(found.map((item) => item.id))
      }
    }
  })

  it('constrains initials by tone and keeps ranking independent of puzzle state', () => {
    const friend = dictionaryById.get(resolveGuess('朋友')!)!
    expect(suggestions('p4y3', [friend], [], 'simplified')).toEqual([])
    expect(suggestions('p2y5', [friend], [], 'simplified')).toHaveLength(1)
    expect(suggestions('peng2you5', [friend], [], 'simplified')).toHaveLength(1)
    const baseline = suggestions('shi', dictionary, [], 'simplified')
    for (const answer of dictionary.slice(0, 20)) {
      const tried = suggestions('shi', dictionary, [answer.id], 'simplified')
      expect(tried.map(({ id, pinyin, gloss }) => ({ id, pinyin, gloss }))).toEqual(baseline.map(({ id, pinyin, gloss }) => ({ id, pinyin, gloss })))
    }
  })

  it('handles umlauts, neutral tones, explicit boundaries and conflicting marks', () => {
    expect(normalizePinyin('lǜsè')).toBe('lv4se4')
    expect(normalizePinyin('xiān')).toBe('xian1')
    expect(normalizePinyin('péNG2you3')).toBe('peng2you3')
    expect(normalizePinyin('péng4you3')).toBeNull()
    expect(normalizePinyin('2pengyou')).toBeNull()
    expect(normalizePinyin('peng23you')).toBeNull()
    expect(suggestions("xi'an", dictionary, [], 'simplified').some((item) => item.text === '西安')).toBe(true)
    const green = resolveGuess('绿色')!
    for (const query of ['lvse', 'lu:se', 'lüse', 'lǜsè', 'lv4se4']) {
      expect(suggestions(query, dictionary, [], 'simplified', 100).some((item) => item.id === green)).toBe(true)
    }
  })

  it('reuses its reading index and meets the desktop 100 ms p95 query budget', () => {
    expect(preparePinyinIndex(dictionary)).toBe(preparePinyinIndex(dictionary))
    const queries = ['s', 'sh', 'shi', 'z', 'zh', 'j', 'x', 'py', 'pengy', 'peng2you3', 'lǜsè', "xi'an"]
    for (const query of queries) suggestions(query, dictionary, [], 'simplified')
    const durations: number[] = []
    for (let repeat = 0; repeat < 5; repeat++) {
      for (const query of queries) {
        const start = performance.now()
        const found = suggestions(query, dictionary, [], 'simplified')
        durations.push(performance.now() - start)
        expect(found.length).toBeLessThanOrEqual(8)
      }
    }
    durations.sort((a, b) => a - b)
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(100)
  })
})
