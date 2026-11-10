import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { formatChineseDate, makeDailyGame, shanghaiDate, vocabularyLevelForDate } from './game'
import { defaultSettings } from './storage'
import { answerPool, wordById } from './data'
import { resolveGuess } from './game'
import { dictionary, installDictionary } from './dictionary'
import runtime from './generated/dictionary.runtime.json?raw'

vi.mock('./data', async () => import('./curated-test-fixtures'))

describe('daily puzzle flow', () => {
  beforeEach(() => localStorage.clear())

  it('shows the daily date in Chinese format and the weekday vocabulary band', () => {
    render(<App />)
    const date = shanghaiDate()
    expect(screen.getByRole('heading', { name: formatChineseDate(date) })).toBeInTheDocument()
    const level = vocabularyLevelForDate(date)
    if (level) expect(screen.getByText(`Vocabulary level: ${level}`)).toBeInTheDocument()
    else expect(screen.queryByText(/Vocabulary level:/)).not.toBeInTheDocument()
  })

  it('waits for the dictionary asset and offers a retry when it fails to load', async () => {
    const saved = [...dictionary]
    installDictionary([])
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(runtime, { headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    try {
      render(<App />)
      expect(screen.getByRole('status')).toHaveTextContent('Loading words')
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the game data")
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByRole('button', { name: 'Start playing' })).toBeInTheDocument()
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
      installDictionary(saved)
    }
  })

  it('shows an explicit empty-content state without using stale MVP saves', () => {
    const original = [...answerPool]
    answerPool.splice(0)
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [makeDailyGame(shanghaiDate(), 'cedict_670b_53cb')],
      savedWords: ['cedict_670b_53cb'], settings: defaultSettings, onboardingDone: true,
    }))
    try {
      const { unmount } = render(<App />)
      expect(screen.getByRole('status')).toHaveTextContent('No approved words yet')
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      unmount()
    } finally {
      answerPool.push(...original)
    }
  })

  it('explains when the edited answer pool has no alternative for practice', () => {
    const original = [...answerPool]
    answerPool.splice(0, answerPool.length, wordById.get('cedict_670b_53cb')!)
    const game = { ...makeDailyGame(shanghaiDate(), 'cedict_670b_53cb'), status: 'won' }
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    try {
      const { unmount } = render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'Practice more' }))
      expect(screen.getByRole('status')).toHaveTextContent('No other approved word is available for practice.')
      unmount()
    } finally {
      answerPool.splice(0, answerPool.length, ...original)
    }
  })

  it('keeps the selected alternate reading in pronunciation feedback after reload', () => {
    const game = makeDailyGame(shanghaiDate(), 'cedict_4f60_597d')
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    const { unmount } = render(<App />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dong1xi5' } })
    fireEvent.click(screen.getByRole('option', { name: /东西/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit guess' }))
    const saved = JSON.parse(localStorage.getItem('ciyu-daily-v1')!)
    expect(saved.games[0].guesses[0].reading.tones).toEqual([1, 5])
    expect(screen.getByLabelText('Tone neutral tone, incorrect')).toBeInTheDocument()
    unmount()
    render(<App />)
    expect(screen.getByLabelText('Tone neutral tone, incorrect')).toBeInTheDocument()
  })

  it('accepts a dictionary-only guess, rejects its alternate-script repeat, and restores feedback', () => {
    const game = makeDailyGame(shanghaiDate(), 'cedict_670b_53cb')
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    const { unmount } = render(<App />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '銀行' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit guess' }))
    expect(screen.getByLabelText('1 of 6 guesses used')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/pronunciation feedback/)).toHaveLength(2)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '银行' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit guess' }))
    expect(screen.getByRole('alert')).toHaveTextContent('You already tried this word.')
    expect(screen.getByLabelText('1 of 6 guesses used')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ciyu-daily-v1')!).games[0].guesses[0].wordId).toBe(resolveGuess('银行'))
    unmount()
    render(<App />)
    expect(screen.getByLabelText('1 of 6 guesses used')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/pronunciation feedback/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '繁體' }))
    expect(screen.getByLabelText(/銀, /)).toBeInTheDocument()
  })

  it('sparkles on a correct submission but not when the win is restored', () => {
    const game = makeDailyGame(shanghaiDate(), 'cedict_670b_53cb')
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    const { container, unmount } = render(<App />)
    expect(container.querySelector('.win-sparkles')).toBeNull()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '朋友' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit guess' }))
    expect(container.querySelector('.win-sparkles')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('.win-sparkles span')).toHaveLength(16)
    expect(container.querySelectorAll('.board .tile-wrap.correct .win-sparkles')).toHaveLength(2)
    expect(container.querySelector('.result-section .win-sparkles')).toBeNull()
    unmount()
    const restored = render(<App />)
    expect(restored.container.querySelector('.win-sparkles')).toBeNull()
  })

  it('explains the current feedback and hint rules in help', () => {
    render(<App />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Choose a word')
    expect(dialog).toHaveTextContent('Not in word')
    expect(dialog).toHaveTextContent('Tone above')
    expect(dialog).toHaveTextContent('always visible, not a hint')
    expect(dialog).toHaveTextContent('3 failed tries')
    expect(dialog).toHaveTextContent('translation optional')
    expect(dialog).toHaveTextContent('No full-pinyin hint')
    expect(dialog.querySelector('.script-switch')).toBeNull()
    expect(dialog.querySelector('.pinyin-part.correct')).toHaveTextContent('zh')
    expect(dialog.querySelector('.pinyin-part.incorrect')).toHaveTextContent('ong')
    expect(screen.getByRole('button', { name: 'Start playing' })).toBeInTheDocument()
  })

  it('enables the sentence control after the third failed guess without a reminder', () => {
    const game = makeDailyGame(shanghaiDate(), 'cedict_670b_53cb')
    game.guesses = ['cedict_5b66_6821', 'cedict_5929_6c14'].map((wordId) => ({ wordId, tiles: ['absent', 'absent'] }))
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    render(<App />)
    expect(screen.getByRole('button', { name: /Sentence$/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Sentence hint available/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '今天' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit guess' }))
    expect(screen.getByRole('button', { name: /Sentence$/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Sentence hint available/ })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ciyu-daily-v1')!).games[0].hintsUsed).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /Sentence$/ }))
    expect(screen.getByText(wordById.get('cedict_670b_53cb')!.hintSimplified)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sentence hint available/ })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ciyu-daily-v1')!).games[0].hintsUsed).toEqual(['sentence'])
  })

  it('shows sentence clues in Chinese with optional masked English translation', () => {
    const game = makeDailyGame(shanghaiDate(), 'cedict_670b_53cb')
    game.hintsUsed = ['sentence']
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    render(<App />)
    const answer = wordById.get('cedict_670b_53cb')!
    expect(screen.getByText(answer.hintSimplified)).toBeInTheDocument()
    expect(screen.queryByText(answer.hintEnglish)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show translation' }))
    expect(screen.getByText(answer.hintEnglish)).toBeInTheDocument()
    expect(screen.queryByText(answer.exampleEnglish)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide translation' })).toHaveAttribute('aria-expanded', 'true')
    expect(JSON.parse(localStorage.getItem('ciyu-daily-v1')!).games[0].hintsUsed).toEqual(['sentence'])
    fireEvent.click(screen.getByRole('button', { name: 'Hide translation' }))
    expect(screen.queryByText(answer.hintEnglish)).not.toBeInTheDocument()
  })

  it('shows the topic immediately without recording a hint, including after reload', () => {
    const game = makeDailyGame(shanghaiDate(), 'cedict_670b_53cb')
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    const { unmount } = render(<App />)
    expect(screen.getByText(wordById.get('cedict_670b_53cb')!.topic)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reveal topic' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ciyu-daily-v1')!).games[0].hintsUsed).toEqual([])
    unmount()
    render(<App />)
    expect(screen.getByText(wordById.get('cedict_670b_53cb')!.topic)).toBeInTheDocument()
    expect(screen.queryByText('Topic not revealed')).not.toBeInTheDocument()
  })

  it('does not count legacy topic-only wins as assisted in history or statistics', () => {
    const game = { ...makeDailyGame(shanghaiDate(), 'cedict_670b_53cb'), status: 'won' as const }
    game.hintsUsed = ['topic']
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.queryByText('Assisted')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }))
    expect(screen.getByText('Assisted completions: 0')).toBeInTheDocument()
  })

  it('does not offer or display a full-pinyin hint from saved progress', () => {
    const game = makeDailyGame(shanghaiDate(), 'cedict_670b_53cb')
    game.hintsUsed = ['pronunciation', 'topic']
    localStorage.setItem('ciyu-daily-v1', JSON.stringify({
      games: [game], savedWords: [], settings: defaultSettings, onboardingDone: true,
    }))
    render(<App />)
    expect(screen.queryByRole('button', { name: /Pinyin/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Pronunciation')).not.toBeInTheDocument()
    expect(screen.queryByText('péngyǒu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sentence/ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ciyu-daily-v1')!).games[0].hintsUsed).toContain('pronunciation')
  })

  it('accepts a selected pinyin suggestion and persists the guess', async () => {
    const { unmount } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start playing' }))
    const input = screen.getByRole('combobox', { name: 'Enter pinyin or a Chinese word' })
    fireEvent.change(input, { target: { value: 'pengyou' } })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true })
    expect(screen.getByLabelText('0 of 6 guesses used')).toBeInTheDocument()
    const suggestion = await screen.findByRole('option', { name: /朋友/ })
    fireEvent.click(suggestion)
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(input).toHaveValue('pengyou')
    fireEvent.click(await screen.findByRole('option', { name: /朋友/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit guess' }))

    expect(screen.getAllByLabelText(/pronunciation feedback/)).toHaveLength(2)
    for (const tone of screen.getAllByLabelText(/^Tone .*, (correct|incorrect)$/)) {
      const wrapper = tone.parentElement!
      const tile = wrapper.querySelector('.tile')!
      const state = ['correct', 'present', 'absent'].find((value) => tile.classList.contains(value))
      expect(state).toBeDefined()
      expect(wrapper).toHaveClass(state!)
      if (tone.classList.contains('accent')) {
        expect(tone.querySelector('svg')).toHaveAttribute('viewBox', '0 0 32 16')
        expect(tone.querySelector('path')).toHaveAttribute('fill', 'currentColor')
      } else {
        expect(tone).toHaveClass('neutral')
        expect(tone).toHaveTextContent('·')
        expect(tone.querySelector('svg')).toBeNull()
      }
    }
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('ciyu-daily-v1') ?? '{}')
      expect(saved.games?.some((game: { guesses: unknown[] }) => game.guesses.length === 1)).toBe(true)
    })
    expect(screen.getByRole('combobox')).toHaveValue('')
    unmount()

    render(<App />)
    expect(screen.getByLabelText(/朋,|朋$/)).toBeInTheDocument()
  })

  it('does not consume a guess when Enter occurs during IME composition', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start playing' }))
    const input = screen.getByRole('combobox', { name: 'Enter pinyin or a Chinese word' })
    fireEvent.change(input, { target: { value: '朋友' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true })
    expect(screen.getByLabelText('0 of 6 guesses used')).toBeInTheDocument()
  })
})
