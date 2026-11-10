import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { answerPool, schedule, wordById } from './data'
import { dictionary, dictionaryById } from './dictionary'
import { preparePinyinIndex } from './pinyin'
import {
  addHint, dailyAnswerId as scheduledAnswerId, displayForm, formatChineseDate, isAssisted, isHintAvailable, makeDailyGame, makePracticeGame, nextShanghaiMidnight,
  normalizePinyin, resolveGuess, scoreGuess, scorePinyinParts, shanghaiDate, shareText, suggestions, upcomingAnswerIds, vocabularyLevelForDate,
} from './game'
import { defaultSettings, loadData, replaceGame, saveData } from './storage'
import type { Game, HintType, PersistedData, PinyinPartFeedback as PinyinPart, Reading, Script, Settings, TileState, Word } from './types'

type Screen = 'game' | 'history' | 'stats' | 'settings'

// Only called after App has checked that the approved pool is nonempty.
const dailyAnswerId = (date: string): string => scheduledAnswerId(date, schedule, answerPool)!
const PRACTICE_SPOILER_DAYS = 30

function currentDaily(data: PersistedData): Game {
  const date = shanghaiDate()
  const oldActive = data.games.find((game) => game.mode === 'daily' && game.status === 'active' && game.date !== date)
  if (oldActive) {
    oldActive.status = 'expired'
    oldActive.completedAt = new Date().toISOString()
  }
  return data.games.find((game) => game.puzzleId === `d_${date}`) ?? makeDailyGame(date, dailyAnswerId(date))
}

function App() {
  if (!answerPool.length) {
    return <main className="page-panel" role="status">
      <h1>No approved words yet</h1>
      <p>Daily and practice puzzles are unavailable until curated vocabulary is added.</p>
      <p>Edit <code>content\curated-words.csv</code>, approve reviewed words, then run <code>npm run content:curated</code>.</p>
    </main>
  }
  return <PuzzleApp />
}

function PuzzleApp() {
  const [persisted, setPersisted] = useState<PersistedData>(() => loadData())
  const [game, setGame] = useState<Game>(() => currentDaily(loadData()))
  const [screen, setScreen] = useState<Screen>('game')
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingReading, setPendingReading] = useState<Reading | null>(null)
  const [pendingSource, setPendingSource] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(!persisted.onboardingDone)
  const [clock, setClock] = useState(Date.now())
  const [composing, setComposing] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<Game | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [celebrationId, setCelebrationId] = useState<string | null>(null)

  const settings = persisted.settings
  const script = settings.script
  const answer = wordById.get(game.answerId)!
  const pending = pendingId ? dictionaryById.get(pendingId) ?? null : null
  const submitted = game.guesses.map((guess) => guess.wordId)
  const candidateSuggestions = useMemo(
    () => suggestions(query, dictionary, submitted, script, 8),
    [query, submitted.join(','), script],
  )
  const visibleChinese = /[\u3400-\u9fff]/.test(query.trim())
  const invalidPinyin = !visibleChinese && Boolean(query.trim()) && normalizePinyin(query) === null

  useEffect(() => { preparePinyinIndex(dictionary) }, [])

  useEffect(() => {
    if (!celebrationId) return
    const timeout = window.setTimeout(() => setCelebrationId(null), 2200)
    return () => window.clearTimeout(timeout)
  }, [celebrationId])

  useEffect(() => {
    saveData(persisted)
  }, [persisted])

  useEffect(() => {
    setPersisted((data) => {
      const games = replaceGame(data.games, game)
      return games === data.games ? data : { ...data, games }
    })
  }, [game])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const onUpdate = () => setUpdateAvailable(true)
    window.addEventListener('app-update-available', onUpdate)
    return () => window.removeEventListener('app-update-available', onUpdate)
  }, [])

  useEffect(() => {
    const date = shanghaiDate(new Date(clock))
    if (game.mode === 'daily' && game.date !== date) {
      setPersisted((data) => ({
        ...data,
        games: data.games.map((item) => item.puzzleId === game.puzzleId && item.status === 'active'
          ? { ...item, status: 'expired', completedAt: new Date().toISOString() }
          : item),
      }))
      const saved = loadData()
      setGame(saved.games.find((item) => item.puzzleId === `d_${date}`) ?? makeDailyGame(date, dailyAnswerId(date)))
    }
  }, [clock, game.date, game.mode])

  useEffect(() => {
    const date = shanghaiDate()
    setPersisted((data) => {
      const games = data.games.map((item) => item.mode === 'daily' && item.status === 'active' && item.date < date
        ? { ...item, status: 'expired' as const, completedAt: new Date().toISOString() }
        : item)
      return games.every((item, index) => item === data.games[index]) ? data : { ...data, games }
    })
  }, [clock])

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [message])

  function updateSettings(next: Partial<Settings>) {
    setPersisted((data) => ({ ...data, settings: { ...data.settings, ...next } }))
  }

  function chooseWord(id: string) {
    const entry = dictionaryById.get(id)!
    const option = candidateSuggestions.find((item) => item.id === id)
    setPendingReading(entry.readings.find((reading) => reading.pinyin === option?.pinyin) ?? null)
    setPendingSource(query)
    setPendingId(id)
    setQuery(displayForm(dictionaryById.get(id)!, script))
    setError('')
  }

  function onInput(value: string) {
    setPendingReading(null)
    setQuery(value)
    setPendingId(null)
    setPendingSource('')
    setError(!/[\u3400-\u9fff]/.test(value.trim()) && value.trim() && normalizePinyin(value) === null
      ? "Use pinyin letters, tone numbers, or an apostrophe."
      : '')
    setHighlighted(0)
    const nativeId = resolveGuess(value)
    if (nativeId && [...value.trim()].length === 2) setPendingId(nativeId)
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      if (composing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
      event.preventDefault()
      if (pendingId) {
        submit()
      } else if (!visibleChinese && candidateSuggestions.length) {
        const option = candidateSuggestions[Math.min(highlighted, candidateSuggestions.length - 1)]
        if (!option.disabled) chooseWord(option.id)
        else setError('Choose a word from the suggestions.')
      } else if (!visibleChinese) {
        setError('Choose a word from the suggestions.')
      } else if (!/^[\u3400-\u9fff]{2}$/.test(query.trim())) {
        setError('Enter exactly two Chinese characters.')
      } else {
        setError("This word isn't in our dictionary. Try another.")
      }
      return
    }
    if (event.key === 'Backspace' && pendingId) {
      event.preventDefault()
      setPendingId(null)
      setPendingReading(null)
      setQuery(pendingSource)
      setPendingSource('')
      return
    }
    if (event.key === 'ArrowDown' && candidateSuggestions.length) {
      event.preventDefault()
      setHighlighted((index) => Math.min(index + 1, candidateSuggestions.length - 1))
    }
    if (event.key === 'ArrowUp' && candidateSuggestions.length) {
      event.preventDefault()
      setHighlighted((index) => Math.max(index - 1, 0))
    }
    if (event.key === 'Tab' && candidateSuggestions.length) {
      event.preventDefault()
      setHighlighted((index) => (index + 1) % candidateSuggestions.length)
    }
    if (event.key === ' ' && candidateSuggestions.length && !visibleChinese) {
      event.preventDefault()
      const option = candidateSuggestions[Math.min(highlighted, candidateSuggestions.length - 1)]
      if (!option.disabled) chooseWord(option.id)
    }
    if (event.key === 'Escape') setQuery('')
  }

  function submit() {
    if (game.status !== 'active') return
    if (!pendingId || !pending) {
      setError(visibleChinese ? 'Enter a recognized two-character word.' : 'Choose a word from the suggestions.')
      return
    }
    if (submitted.includes(pending.id)) {
      setError('You already tried this word.')
      return
    }
    const nextGuesses = [...game.guesses, {
      wordId: pending.id,
      ...(pendingReading ? { reading: pendingReading } : {}),
      tiles: scoreGuess(pending.simplified, answer.simplified),
    }]
    const won = pending.id === answer.id
    if (won) setCelebrationId(game.puzzleId)
    const status = won ? 'won' : nextGuesses.length === 6 ? 'lost' : 'active'
    setGame({
      ...game,
      guesses: nextGuesses,
      status,
      completedAt: status === 'active' ? undefined : new Date().toISOString(),
    })
    setQuery('')
    setPendingId(null)
    setPendingReading(null)
    setPendingSource('')
    setError('')
  }

  function useHint(hint: HintType) {
    const next = addHint(game, hint)
    if (next === game) {
      setMessage(game.hintsUsed.includes(hint) ? 'This hint is already used.' : 'Unlocks after 3 unsuccessful guesses.')
      return
    }
    setGame(next)
  }

  function startPractice(reviewSaved = false) {
    const today = dailyAnswerId(shanghaiDate())
    const upcoming = upcomingAnswerIds(shanghaiDate(), PRACTICE_SPOILER_DAYS, schedule, answerPool)
    const unspoiled = answerPool.filter((word) => !upcoming.has(word.id))
    // Small pools may all be scheduled soon; then only today's answer is withheld.
    const eligible = unspoiled.length ? unspoiled : answerPool.filter((word) => word.id !== today)
    if (!eligible.length) {
      setMessage('No other approved word is available for practice. Add another approved word to the curated list.')
      return
    }
    const recent = new Set(persisted.games
      .filter((item) => item.mode === 'practice')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 50)
      .map((item) => item.answerId))
    const fresh = eligible.filter((word) => !recent.has(word.id))
    const available = fresh.length ? fresh : eligible
    const saved = available.filter((word) => persisted.savedWords.includes(word.id))
    const allSaved = eligible.filter((word) => persisted.savedWords.includes(word.id))
    if (reviewSaved && allSaved.length === 0) {
      setMessage('Save a learning card first to review saved words.')
      return
    }
    const pool = reviewSaved ? (saved.length ? saved : allSaved) : available
    setGame(makePracticeGame(pool[Math.floor(Math.random() * pool.length)].id))
    setScreen('game')
    setQuery('')
    setPendingId(null)
    setPendingReading(null)
    setPendingSource('')
    setSelectedHistory(null)
  }

  function openDaily() {
    const date = shanghaiDate()
    const oldActive = persisted.games.find((item) => item.mode === 'daily' && item.date < date && item.status === 'active')
    if (oldActive) {
      setPersisted((data) => ({
        ...data,
        games: data.games.map((item) => item.puzzleId === oldActive.puzzleId
          ? { ...item, status: 'expired', completedAt: new Date().toISOString() }
          : item),
      }))
    }
    setGame(persisted.games.find((item) => item.puzzleId === `d_${date}`) ?? makeDailyGame(date, dailyAnswerId(date)))
    setQuery('')
    setPendingId(null)
    setPendingReading(null)
    setPendingSource('')
    setScreen('game')
  }

  function toggleSaved(wordId: string) {
    setPersisted((data) => ({
      ...data,
      savedWords: data.savedWords.includes(wordId)
        ? data.savedWords.filter((id) => id !== wordId)
        : [...data.savedWords, wordId],
    }))
  }

  async function share() {
    return shareGame(game)
  }

  async function shareGame(target: Game) {
    const text = shareText(target, settings.highContrast)
    try {
      if (navigator.share) await navigator.share({ text })
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        setMessage('Copied to clipboard.')
      } else {
        throw new Error('Sharing and clipboard access are unavailable.')
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return
      setMessage('Could not share right now. Please try again.')
    }
  }

  function resetData() {
    if (!window.confirm('Reset all local data? Your progress and saved words cannot be recovered.')) return
    localStorage.removeItem('ciyu-daily-v1')
    const clean: PersistedData = { games: [], savedWords: [], settings: defaultSettings, onboardingDone: true }
    setPersisted(clean)
    setGame(currentDaily(clean))
    setMessage('Local data reset.')
  }

  const historyGame = selectedHistory
  const cardGame = historyGame ?? game
  const cardAnswer = wordById.get(cardGame.answerId) ?? answer
  const midnight = nextShanghaiMidnight(new Date(clock))
  const remaining = Math.max(0, midnight.getTime() - clock)
  const countdown = [Math.floor(remaining / 3_600_000), Math.floor((remaining % 3_600_000) / 60_000), Math.floor((remaining % 60_000) / 1000)]
    .map((part) => String(part).padStart(2, '0')).join(':')
  const dailyResults = persisted.games.filter((item) => item.mode === 'daily' && item.status !== 'active')

  return (
    <div className="app-shell" data-theme={settings.darkMode === 'system' ? undefined : settings.darkMode} data-contrast={settings.highContrast ? 'high' : undefined} data-motion={settings.reducedMotion}>
      <header className="topbar">
        <button className="icon-button menu-mark" aria-label="Open menu" onClick={() => setScreen(screen === 'history' ? 'game' : 'history')}>☰</button>
        <div className="brand">
          <span className="seal" lang="zh-Hans">词</span>
          <span><strong lang="zh-Hans">词语</strong> <b>Daily</b></span>
        </div>
        <nav aria-label="Main navigation">
          <button aria-current={screen === 'game' ? 'page' : undefined} onClick={openDaily}>Play</button>
          <button aria-current={screen === 'history' ? 'page' : undefined} onClick={() => setScreen('history')}>History</button>
          <button aria-current={screen === 'stats' ? 'page' : undefined} onClick={() => setScreen('stats')}>Stats</button>
          <button aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => setScreen('settings')}>Settings</button>
        </nav>
        <button className="icon-button help-button" aria-label="How to play" onClick={() => setShowOnboarding(true)}>?</button>
      </header>
      {updateAvailable && game.status !== 'active' && <div className="update-notice" role="status">
        <span>An update is ready. It will not interrupt an active puzzle.</span>
        <button onClick={() => window.dispatchEvent(new Event('app-update-request'))}>Update now</button>
      </div>}

      <main className="content">
        {screen === 'game' && (
          <section className="game-screen" aria-label={game.mode === 'daily' ? 'Daily puzzle' : 'Practice puzzle'}>
            <div className="game-heading">
              <div>
                <p className="eyebrow">{game.mode === 'daily' ? 'Daily puzzle' : 'Practice round'}</p>
                <h1>{game.mode === 'daily' ? formatChineseDate(game.date) : 'Practice'}</h1>
                {game.mode === 'daily' && vocabularyLevelForDate(game.date) && <p className="muted">Vocabulary level: {vocabularyLevelForDate(game.date)}</p>}
              </div>
              <div className="game-heading-actions">
                {game.mode === 'practice' && <button className="daily-link" onClick={openDaily}>Daily puzzle</button>}
                <div className="script-switch" aria-label="Writing script">
                <button className={script === 'simplified' ? 'selected' : ''} onClick={() => updateSettings({ script: 'simplified' })}>简体</button>
                <button className={script === 'traditional' ? 'selected' : ''} onClick={() => updateSettings({ script: 'traditional' })}>繁體</button>
                </div>
              </div>
            </div>

            <div className="topic-reveal">
              <strong>Topic</strong>
              <span id="puzzle-topic">{answer.topic}</span>
            </div>

            <div className="board" aria-label={`${game.guesses.length} of 6 guesses used`}>
              {Array.from({ length: 6 }, (_, row) => {
                const guess = game.guesses[row]
                const word = guess ? dictionaryById.get(guess.wordId) : null
                const chars = word ? [...displayForm(word, script)] : pending && row === game.guesses.length ? [...displayForm(pending, script)] : []
                const feedback = guess?.tiles
                return (
                  <div className={`guess-row ${pending && row === game.guesses.length ? 'pending-row' : ''}`} key={row} aria-label={`Guess ${row + 1}`}>
                    {[0, 1].map((position) => {
                      const state = feedback?.[position]
                      const tonePart = guess && word ? scorePinyinParts(guess.reading ?? word, answer)[position].find((part) => part.kind === 'tone') : undefined
                      return (
                        <div className="guess-cell" key={position}>
                          <div className={`tile-wrap ${state ?? (chars[position] ? 'pending' : 'empty')}`}>
                            {game.status === 'won' && celebrationId === game.puzzleId && row === game.guesses.length - 1 && <div className="win-sparkles" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span key={index}>✦</span>)}</div>}
                            {tonePart && <span className={`tone-mark ${tonePart.toneMark === '·' ? 'neutral' : 'accent'} ${tonePart.matches ? 'correct' : 'incorrect'}`} aria-label={`Tone ${tonePart.value}, ${tonePart.matches ? 'correct' : 'incorrect'}`} title={`Tone ${tonePart.value}: ${tonePart.matches ? 'correct' : 'incorrect'}`}><ToneGlyph mark={tonePart.toneMark} /></span>}
                            <div className={`tile ${state ?? (chars[position] ? 'pending' : 'empty')}`} lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'} aria-label={state ? `${chars[position]}, ${tileLabel(state)}` : chars[position] ?? 'Empty'}>
                              <span className="tile-character">{chars[position] ?? ''}</span>
                              {state === 'correct' && <span className="tile-icon" aria-hidden="true">✓</span>}
                              {state === 'present' && <span className="tile-icon" aria-hidden="true">↔</span>}
                            </div>
                          </div>
                          {guess && word && <PinyinFeedback parts={scorePinyinParts(guess.reading ?? word, answer)[position]} characterPosition={position} />}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            {game.guesses.length > 0 && <p className="feedback-legend">Pinyin: initial · final · tone; ✓ matches, × differs.</p>}

            <div className="hint-row" aria-label="Hints">
              <button className={`hint-chip ${game.hintsUsed.includes('sentence') ? 'used' : ''}`} disabled={!isHintAvailable(game, 'sentence')} title={game.hintsUsed.includes('sentence') ? 'Sentence hint revealed' : 'Unlocks after 3 unsuccessful guesses'} onClick={() => useHint('sentence')}>{game.hintsUsed.includes('sentence') ? '✓' : isHintAvailable(game, 'sentence') ? '◇' : '⌑'} Sentence</button>
            </div>
            <HintCards key={game.puzzleId} game={game} answer={answer} script={script} />

            {game.status === 'active' ? (
              <div className="input-area">
                {!visibleChinese && query.trim() && (
                  <SuggestionList
                    options={candidateSuggestions}
                    selected={highlighted}
                    showGlosses={settings.showGlosses}
                    script={script}
                    onChoose={chooseWord}
                    onHighlight={setHighlighted}
                  />
                )}
                {query.trim() && !visibleChinese && !invalidPinyin && candidateSuggestions.length === 0 && (
                  <div className="empty-suggestions" role="status">No two-character word matches this pinyin.</div>
                )}
                {error && <p className="inline-error" role="alert"><span aria-hidden="true">⚠</span> {error}</p>}
                <div className="input-bar">
                  <span className="mode-badge" title={visibleChinese || (!query.trim() && settings.defaultInputMode === 'native') ? 'Native character input' : 'Pinyin input'}>{visibleChinese || (!query.trim() && settings.defaultInputMode === 'native') ? '中' : '拼'}</span>
                  <input
                    role="combobox"
                    aria-label="Enter pinyin or a Chinese word"
                    aria-expanded={candidateSuggestions.length > 0 && Boolean(query.trim()) && !visibleChinese}
                    aria-controls="suggestion-list"
                    aria-activedescendant={candidateSuggestions[highlighted] ? `suggestion-${candidateSuggestions[highlighted].id}` : undefined}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="text"
                    placeholder={settings.defaultInputMode === 'native' ? 'Enter a Chinese word or pinyin' : 'Type pinyin, e.g. pengyou'}
                    value={query}
                    onChange={(event) => onInput(event.target.value)}
                    onKeyDown={onInputKeyDown}
                    onCompositionStart={() => setComposing(true)}
                    onCompositionEnd={() => setComposing(false)}
                  />
                  <button className="submit-button" aria-label="Submit guess" disabled={!pendingId} onClick={submit}>✓</button>
                </div>
                <p className="input-note">Choose a word from the suggestions, or type two Chinese characters.</p>
              </div>
            ) : (
              <ResultCard game={cardGame} answer={cardAnswer} script={script} saved={persisted.savedWords.includes(cardAnswer.id)} onSave={() => toggleSaved(cardAnswer.id)} onShare={share} onPractice={startPractice} countdown={countdown} />
            )}
            {game.mode === 'daily' && <p className="quiet-countdown">Next word in <span>{countdown}</span></p>}
          </section>
        )}

        {screen === 'history' && (
          <section className="page-panel">
            <p className="eyebrow">Your journey</p><h1>History & saved words</h1>
            <div className="history-layout">
              <div>
                <h2>Daily puzzles</h2>
                {dailyResults.length === 0 ? <p className="muted">Completed and expired puzzles will appear here.</p> : (
                  <ul className="history-list">{[...dailyResults].sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
                    <li key={item.puzzleId}><button onClick={() => setSelectedHistory(item)}><span>{formatChineseDate(item.date)}</span><span>{item.status === 'won' ? `${item.guesses.length}/6` : item.status}</span><span>{isAssisted(item) ? 'Assisted' : ''}</span></button></li>
                  ))}</ul>
                )}
                <button className="primary-button" onClick={() => startPractice()}>General practice</button>
                <button className="secondary-button" onClick={() => startPractice(true)}>Review saved words</button>
                {persisted.savedWords.length === 0 && <p className="muted">Save a word from its learning card to build a review list.</p>}
              </div>
              <div>
                <h2>Saved words <span className="count-badge">{persisted.savedWords.length}</span></h2>
                {persisted.savedWords.length === 0 ? <p className="muted">Save a word from its learning card to review it here.</p> : (
                  <div className="saved-list">{persisted.savedWords.map((id) => {
                    const word = wordById.get(id)
                    return word ? <button key={id} onClick={() => { setGame(makePracticeGame(id)); setScreen('game'); setSelectedHistory(null) }}><strong lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>{displayForm(word, script)}</strong><span>{word.pinyin} · {word.gloss}</span></button> : null
                  })}</div>
                )}
                {selectedHistory && <ResultCard game={selectedHistory} answer={wordById.get(selectedHistory.answerId)!} script={script} saved={persisted.savedWords.includes(selectedHistory.answerId)} onSave={() => toggleSaved(selectedHistory.answerId)} onShare={() => shareGame(selectedHistory)} onPractice={startPractice} countdown={countdown} />}
              </div>
            </div>
          </section>
        )}

        {screen === 'stats' && <Statistics games={persisted.games} />}

        {screen === 'settings' && (
          <section className="page-panel settings-panel">
            <p className="eyebrow">Make it yours</p><h1>Settings</h1>
            <label className="setting-row">Writing script<select value={settings.script} onChange={(event) => updateSettings({ script: event.target.value as Script })}><option value="simplified">简体 Chinese</option><option value="traditional">繁體 Chinese</option></select></label>
            <label className="setting-row">Default input mode<select value={settings.defaultInputMode} onChange={(event) => updateSettings({ defaultInputMode: event.target.value as Settings['defaultInputMode'] })}><option value="pinyin">Pinyin</option><option value="native">Chinese keyboard</option></select></label>
            <label className="setting-row">Show suggestion glosses<input type="checkbox" checked={settings.showGlosses} onChange={(event) => updateSettings({ showGlosses: event.target.checked })} /></label>
            <label className="setting-row">High-contrast tile colors<input type="checkbox" checked={settings.highContrast} onChange={(event) => updateSettings({ highContrast: event.target.checked })} /></label>
            <label className="setting-row">Appearance<select value={settings.darkMode} onChange={(event) => updateSettings({ darkMode: event.target.value as Settings['darkMode'] })}><option value="system">Follow device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
            <label className="setting-row">Reduced motion<select value={settings.reducedMotion} onChange={(event) => updateSettings({ reducedMotion: event.target.value as Settings['reducedMotion'] })}><option value="system">Follow device</option><option value="on">On</option><option value="off">Off</option></select></label>
            <button className="danger-button" onClick={resetData}>Reset local data</button>
            <p className="muted">Your progress and settings stay on this device. No account is needed.</p>
            <p className="muted">Bundled dictionary: <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict">CC-CEDICT</a>, by the CC-CEDICT contributors, licensed under <a href="/licenses/CC-BY-SA-4.0.txt">CC BY-SA 4.0</a>. Two-character entries have been filtered, normalized, merged, and supplemented with local overrides. Derived dictionary data is shared under the same license. <a href="/licenses/CC-CEDICT-NOTICE.txt">Attribution and data notices</a>.</p>
          </section>
        )}
      </main>

      <footer><span>词语 Daily</span><span>One Chinese word a day.</span><button onClick={() => setShowOnboarding(true)}>How to play</button></footer>
      {message && <div className="toast" role="status" aria-live="polite">{message}</div>}
      {showOnboarding && <div className="modal-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <button className="dialog-close" aria-label="Close" onClick={() => { setShowOnboarding(false); setPersisted((data) => ({ ...data, onboardingDone: true })) }}>×</button>
        <span className="seal large-seal" lang="zh-Hans">词</span><p className="eyebrow">A small daily ritual</p><h2 id="welcome-title">Find today's Chinese word</h2>
        <p>Two characters. Six tries.</p>
        <div className="help-input-steps"><span>Type pinyin</span><span aria-hidden="true">→</span><span>Choose a word</span><span aria-hidden="true">→</span><span>Submit ✓</span></div>
        <p className="help-caption">Or type Chinese directly. Invalid or repeated words cost no try.</p>
        <div className="example-feedback" aria-label="Character feedback examples">
          <div><span className="tile correct" lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>中<span className="tile-icon" aria-hidden="true">✓</span></span><span>Correct place</span></div>
          <div><span className="tile present" lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>文<span className="tile-icon" aria-hidden="true">↔</span></span><span>Wrong place</span></div>
          <div><span className="tile absent" lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>字</span><span>Not in word</span></div>
        </div>
        <div className="help-pronunciation" aria-label="Pronunciation feedback example">
          <span className="help-tone" aria-hidden="true"><ToneGlyph mark="ˉ" /></span>
          <span className="help-character" lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>中</span>
          <PinyinFeedback parts={[{ kind: 'initial', value: 'zh', matches: true }, { kind: 'final', value: 'ong', matches: false }]} characterPosition={0} />
          <p className="help-caption">Tone above · Initial + final below<br />Green matches · Red differs</p>
        </div>
        <div className="help-hints">
          <p><strong>Topic</strong> — always visible, not a hint.</p>
          <p><span aria-hidden="true">⌑</span> <strong>Sentence</strong> — after 3 failed tries.<br /><span className="help-caption">Chinese first; translation optional.</span></p>
        </div>
        <p className="help-caption">Hints mark your result as assisted. No full-pinyin hint.</p>
        <button className="primary-button full-width" onClick={() => { setShowOnboarding(false); setPersisted((data) => ({ ...data, onboardingDone: true })) }}>Start playing</button>
      </section></div>}
    </div>
  )
}

function ToneGlyph({ mark }: { mark: string | undefined }) {
  const paths: Record<string, string> = {
    'ˉ': 'M3 6C9 7 17 6 24 5C28 4 30 6 29 8C28 10 20 9 14 10C8 11 4 9 3 7C2 6 2 6 3 6Z',
    'ˊ': 'M3 14C10 10 18 5 23 2C25 1 29 3 29 5C29 6 26 6 24 7L5 14C2 15 2 15 3 14Z',
    'ˇ': 'M3 3C4 1 6 2 7 4L15 11C16 12 17 11 19 10L29 3C30 2 31 3 29 5L18 14C16 16 14 15 12 13L3 6C2 5 2 4 3 3Z',
    'ˋ': 'M4 2C6 1 7 3 9 5L28 13C31 15 30 16 28 15L4 7C1 6 2 3 4 2Z',
  }
  const path = mark ? paths[mark] : undefined
  return path
    ? <svg viewBox="0 0 32 16" aria-hidden="true" focusable="false"><path d={path} fill="currentColor" /></svg>
    : mark
}

function tileLabel(state: TileState) {
  return state === 'correct' ? 'correct position' : state === 'present' ? 'in the word, different position' : 'not in the word'
}

function SuggestionList({ options, selected, showGlosses, script, onChoose, onHighlight }: {
  options: ReturnType<typeof suggestions>
  selected: number
  showGlosses: boolean
  script: Script
  onChoose: (id: string) => void
  onHighlight: (index: number) => void
}) {
  return <div className="suggestion-list" id="suggestion-list" role="listbox" aria-label="Word suggestions">
    <span className="sr-only" aria-live="polite">{options.length} suggestions</span>
    {options.map((option, index) => <button
      id={`suggestion-${option.id}`}
      key={option.id}
      className={`suggestion ${index === selected ? 'highlighted' : ''} ${option.disabled ? 'disabled' : ''}`}
      role="option"
      aria-selected={index === selected}
      aria-disabled={option.disabled}
      onMouseEnter={() => onHighlight(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => !option.disabled && onChoose(option.id)}
    >
      <strong lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>{option.text}</strong><span className="suggestion-pinyin">{option.pinyin}</span>
      {showGlosses && <span className="suggestion-gloss">{option.disabled ? 'Already tried' : option.gloss}</span>}
    </button>)}
  </div>
}

function PinyinFeedback({ parts, characterPosition }: { parts: PinyinPart[]; characterPosition: number }) {
  return <div className="pinyin-feedback" aria-label={`Character ${characterPosition + 1} pronunciation feedback`}>
    {parts.filter((part) => part.kind !== 'tone').map((part, index) => <span key={part.kind} className="pinyin-feedback-item">
      {index > 0 && <span className="part-separator" aria-hidden="true">·</span>}
      <span
        className={`pinyin-part ${part.kind} ${part.matches ? 'correct' : 'incorrect'}`}
        aria-label={`${part.kind === 'tone' ? 'Tone' : part.kind === 'initial' ? 'Initial' : 'Final'} ${part.value}, ${part.matches ? 'correct' : 'incorrect'}`}
      >
        {part.value}<span className="part-icon" aria-hidden="true">{part.matches ? '✓' : '×'}</span>
      </span>
    </span>)}
  </div>
}

function HintCards({ game, answer, script }: { game: Game; answer: Word; script: Script }) {
  const [showTranslation, setShowTranslation] = useState(false)
  const visibleHints = game.hintsUsed.filter((hint) => hint === 'sentence')
  if (!visibleHints.length) return null
  return <div className="hint-cards">{visibleHints.map((hint) => <div className="hint-card" key={hint}>
    <strong>Sentence</strong>
    <div className="sentence-clue">
      <span lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>{script === 'simplified' ? answer.hintSimplified : answer.hintTraditional}</span>
      <button className="translation-toggle" aria-expanded={showTranslation} aria-controls="sentence-translation" onClick={() => setShowTranslation((shown) => !shown)}>{showTranslation ? 'Hide translation' : 'Show translation'}</button>
      {showTranslation && <p id="sentence-translation" className="hint-translation" lang="en">{answer.hintEnglish}</p>}
    </div>
  </div>)}</div>
}

function ResultCard({ game, answer, script, saved, onSave, onShare, onPractice, countdown }: {
  game: Game; answer: Word; script: Script; saved: boolean; onSave: () => void; onShare: () => void; onPractice: () => void; countdown: string
}) {
  const completed = game.status !== 'active'
  const isWin = game.status === 'won'
  return <section className="result-section" aria-label="Puzzle result">
    <h2 className="result-heading">{game.status === 'expired' ? 'This puzzle has expired' : isWin ? `Solved in ${game.guesses.length}/6 — nice work.` : "Today's word was…"}</h2>
    {completed && <LearningCard word={answer} script={script} saved={saved} onSave={onSave} />}
    <div className="result-grid" aria-label="Your guesses">
      {game.guesses.map((guess, index) => <div className="result-row" key={`${guess.wordId}-${index}`} aria-label={`Guess ${index + 1}`}>
        {guess.tiles.map((tile, position) => <span className={`mini-tile ${tile}`} key={position} aria-label={tileLabel(tile)}>{tile === 'correct' ? '✓' : tile === 'present' ? '↔' : ''}</span>)}
      </div>)}
    </div>
    <div className="result-actions"><button className="primary-button" onClick={onShare}>Share result</button><button className="secondary-button" onClick={onPractice}>Practice more</button></div>
    {game.mode === 'daily' && <p className="quiet-countdown">Next word in <span>{countdown}</span></p>}
  </section>
}

function LearningCard({ word, script, saved, onSave }: { word: Word; script: Script; saved: boolean; onSave: () => void }) {
  const form = displayForm(word, script)
  const alt = displayForm(word, script === 'simplified' ? 'traditional' : 'simplified')
  const example = script === 'simplified' ? word.exampleSimplified : word.exampleTraditional
  return <article className="learning-card">
    <div className="card-word"><strong lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>{form}</strong><span>{word.pinyin}</span></div>
    <p className="alternate-form"><span lang={script === 'simplified' ? 'zh-Hant' : 'zh-Hans'}>{script === 'simplified' ? '繁體' : '简体'}: {alt}</span></p>
    <hr />
    <h3>{word.definition}</h3>
    <p className="chinese-example" lang={script === 'simplified' ? 'zh-Hans' : 'zh-Hant'}>{example}</p>
    <p className="translation">{word.exampleEnglish}</p>
    <div className="card-footer"><span className="topic-tag"># {word.topic}</span><button className={`save-button ${saved ? 'saved' : ''}`} onClick={onSave} aria-pressed={saved}>{saved ? '★ Saved' : '☆ Save word'}</button></div>
    <div className="audio-note">Audio is not available for this word yet.</div>
  </article>
}

function Statistics({ games }: { games: Game[] }) {
  const daily = games.filter((game) => game.mode === 'daily' && game.status !== 'active')
  const wins = daily.filter((game) => game.status === 'won')
  const dates = new Map(daily.map((game) => [game.date, game]))
  let current = 0
  const today = shanghaiDate()
  const anchor = daily.some((game) => game.date === today) ? today : new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  for (let cursor = anchor; dates.get(cursor)?.status === 'won';) {
    current++
    cursor = new Date(Date.parse(`${cursor}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  }
  const sortedDates = [...dates.keys()].sort()
  let best = 0
  let streak = 0
  let previous = ''
  for (const date of sortedDates) {
    const dayAfter = previous ? new Date(Date.parse(`${previous}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : ''
    streak = dates.get(date)?.status === 'won' ? (date === dayAfter ? streak + 1 : 1) : 0
    best = Math.max(best, streak)
    previous = date
  }
  return <section className="page-panel"><p className="eyebrow">Your progress</p><h1>Statistics</h1>
    <div className="stats-grid"><Stat value={String(daily.length)} label="Played" /><Stat value={daily.length ? `${Math.round(wins.length / daily.length * 100)}%` : '0%'} label="Win rate" /><Stat value={String(current)} label="Current streak" /><Stat value={String(best)} label="Best streak" /></div>
    <h2>Guess distribution</h2><div className="distribution">{Array.from({ length: 6 }, (_, index) => {
      const count = wins.filter((game) => game.guesses.length === index + 1).length
      return <div className="distribution-row" key={index}><span>{index + 1}</span><div><i style={{ width: `${count ? Math.max(8, count / Math.max(1, wins.length) * 100) : 0}%` }} /></div><b>{count}</b><span className="sr-only">wins in {index + 1} guesses</span></div>
    })}</div>
    <p className="muted">Assisted completions: {wins.filter(isAssisted).length}</p>
  </section>
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>
}

export default App
