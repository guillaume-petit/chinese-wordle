import { dictionaryById, wordByForm } from './dictionary'
import type { Word } from './types'

// Synthetic learning content is used only by tests, never by the app bundle.
export const words: Word[] = ['朋友', '天气', '学校', '今天', '你好', '喜欢'].map((form) => {
  const entry = dictionaryById.get(wordByForm.get(form)!)!
  const reading = form === '喜欢'
    ? { pinyin: 'xǐhuān', syllables: ['xi', 'huan'] as [string, string], tones: [3, 1] as [number, number] }
    : entry
  return {
    id: entry.id, simplified: entry.simplified, traditional: entry.traditional,
    pinyin: reading.pinyin, syllables: reading.syllables, tones: reading.tones,
    gloss: 'test vocabulary', definition: 'Test definition.', topic: 'Test topic',
    exampleSimplified: `我认识${form}。`, exampleTraditional: `我認識${entry.traditional}。`,
    exampleEnglish: 'Test example translation.',
    hintSimplified: '这是＿＿。', hintTraditional: '這是＿＿。',
    hintEnglish: 'This is ____.', tocflLevel: 1, sourceReference: 'Synthetic test fixture',
  }
})
export const wordById = new Map(words.map((word) => [word.id, word]))
export const answerPool = [...words]
