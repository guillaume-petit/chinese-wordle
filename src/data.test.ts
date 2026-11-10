import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerPool, installCurated, isCuratedReady, loadCurated, resetCurated, schedule, wordById, words, type CuratedContent } from './data'
import curated from './generated/curated.json?raw'
import { words as fixtureWords } from './curated-test-fixtures'

const production = () => JSON.parse(curated) as CuratedContent

describe('curated content asset', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    installCurated(production())
  })

  it('installs the generated content, resolving answers and the schedule', () => {
    const content = production()
    expect(words).toHaveLength(content.words.length)
    expect(answerPool.map((word) => word.id)).toEqual(content.answerIds)
    expect(answerPool.every((word) => wordById.get(word.id) === word)).toBe(true)
    expect(schedule).toEqual(content.schedule)
  })

  it('loads once, reports failures, and retries after an error', async () => {
    resetCurated()
    expect(isCuratedReady()).toBe(false)
    const [first, second] = fixtureWords
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(Response.json({ words: [first, second], answerIds: [second.id] }))
    vi.stubGlobal('fetch', fetch)
    await expect(loadCurated()).rejects.toThrow('Curated content request failed (404)')
    expect(isCuratedReady()).toBe(false)
    await Promise.all([loadCurated(), loadCurated()])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(words.map((word) => word.id)).toEqual([first.id, second.id])
    expect(answerPool.map((word) => word.id)).toEqual([second.id])
    expect(schedule).toEqual({ start: null, answerIds: [] })
    await loadCurated()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('counts an empty approved pool as loaded and rejects unknown answers', () => {
    installCurated({ words: [], answerIds: [] })
    expect(isCuratedReady()).toBe(true)
    expect(answerPool).toEqual([])
    expect(() => installCurated({ words: [], answerIds: ['missing'] })).toThrow('Missing curated answer: missing')
  })
})
