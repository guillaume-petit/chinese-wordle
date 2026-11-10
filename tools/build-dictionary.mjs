import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

export const SOURCE_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz'
export const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'
const MAX_SOURCE_BYTES = 64 * 1024 * 1024
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const supportedForm = (value) => /^[\u3400-\u9fff]{2}$/u.test(value)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const syllableSet = new Set(('a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo e ei en eng er fa fan fang fei fen feng fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lv lve ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo m n ng hm hng').split(' '))
const marks = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }

export function toneMark(syllable, tone) {
  let text = syllable.replaceAll('v', 'ü')
  if (tone === 5) return text
  let index = text.indexOf('a')
  if (index < 0) index = text.indexOf('e')
  if (index < 0 && text.includes('ou')) index = text.indexOf('o')
  if (index < 0) {
    for (let i = text.length - 1; i >= 0; i--) {
      if (marks[text[i]]) { index = i; break }
    }
  }
  // Syllabic consonants have no vowel supported by the app's tone-mark map.
  if (index < 0) return `${text}${tone}`
  return text.slice(0, index) + marks[text[index]][tone - 1] + text.slice(index + 1)
}

export function parseReading(raw) {
  const parts = raw.trim().toLowerCase().replaceAll('u:', 'v').replaceAll('ü', 'v').split(/\s+/u)
  if (parts.length !== 2) return null
  const parsed = parts.map((part) => /^([a-z]+)([0-5])$/u.exec(part))
  if (parsed.some((part) => !part || !syllableSet.has(part[1]))) return null
  const syllables = parsed.map((part) => part[1])
  const tones = parsed.map((part) => Number(part[2]) || 5)
  return { pinyin: syllables.map((syllable, i) => toneMark(syllable, tones[i])).join(''), syllables, tones }
}

export function validateFrequency(value) {
  const object = (item) => item !== null && typeof item === 'object' && !Array.isArray(item)
  if (!object(value) || !object(value.metadata) || !object(value.ranks)) throw new Error('Frequency input requires metadata and ranks objects')
  for (const key of ['source', 'url', 'attribution', 'license']) {
    if (typeof value.metadata[key] !== 'string' || !value.metadata[key].trim()) throw new Error(`Frequency metadata.${key} must be a nonempty string`)
  }
  for (const [form, rank] of Object.entries(value.ranks)) {
    if (!supportedForm(form) || !Number.isSafeInteger(rank) || rank < 1) throw new Error(`Invalid frequency rank for ${form}: expected a positive safe integer keyed by two supported Han characters`)
  }
  return value
}

export function buildDictionary(text, { sourceSha256 = sha256(text), frequency = null } = {}) {
  if (frequency) validateFrequency(frequency)
  const header = []
  const stats = { sourceLines: 0, supportedLines: 0, skippedForms: 0, skippedReadings: 0, mergedLines: 0, formCollisions: 0 }
  const groups = new Map()
  const groupFor = (form) => {
    if (!groups.has(form)) groups.set(form, { simplified: form, forms: new Set([form]), readings: new Map(), glosses: new Set(), sourceCount: 0 })
    return groups.get(form)
  }
  const readingKey = (reading) => reading.syllables.map((part, i) => `${part}${reading.tones[i]}`).join(' ')
  const addReading = (group, reading) => group.readings.set(readingKey(reading), reading)
  for (const [index, raw] of text.replace(/^\uFEFF/u, '').split(/\r?\n/u).entries()) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) { header.push(raw); continue }
    stats.sourceLines++
    const match = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/u.exec(line)
    if (!match) throw new Error(`Malformed CEDICT entry at line ${index + 1}: ${line.slice(0, 100)}`)
    const [, traditional, simplified, rawReading, definitions] = match
    const glosses = definitions.split('/').map((value) => value.trim()).filter(Boolean)
    if (!glosses.length) throw new Error(`Malformed CEDICT definitions at line ${index + 1}`)
    if (!supportedForm(simplified) || !supportedForm(traditional)) { stats.skippedForms++; continue }
    const reading = parseReading(rawReading)
    if (!reading) { stats.skippedReadings++; continue }
    const group = groupFor(simplified)
    if (group.sourceCount++) stats.mergedLines++
    group.forms.add(simplified)
    group.forms.add(traditional)
    addReading(group, reading)
    for (const gloss of glosses) group.glosses.add(gloss)
    stats.supportedLines++
  }
  if (!stats.sourceLines || !stats.supportedLines) throw new Error('Source contains no supported dictionary entries')
  const ordered = [...groups.values()].sort((a, b) => compare(a.simplified, b.simplified))
  // Canonical simplified forms win; other ambiguous aliases have one owner.
  const owners = new Map(ordered.map((group) => [group.simplified, group.simplified]))
  for (const group of ordered) {
    for (const form of [...group.forms].sort(compare)) {
      if (!owners.has(form)) owners.set(form, group.simplified)
      else if (owners.get(form) !== group.simplified) stats.formCollisions++
    }
  }
  const entries = ordered.map((group) => {
    const readings = [...group.readings.entries()].sort(([a], [b]) => compare(a, b)).map(([, reading]) => reading)
    const primary = readings[0]
    const primaryKey = readingKey(primary)
    const forms = [...group.forms].filter((form) => owners.get(form) === group.simplified).sort(compare)
    const traditional = forms.find((form) => form !== group.simplified) ?? group.simplified
    const glosses = [...group.glosses].sort(compare)
    return {
      id: `cedict_${[...group.simplified].map((char) => char.codePointAt(0).toString(16)).join('_')}`,
      simplified: group.simplified, traditional,
      variants: forms.filter((form) => form !== traditional && form !== group.simplified),
      ...primary, readings: [primary, ...readings.filter((reading) => readingKey(reading) !== primaryKey)],
      frequency: frequency?.ranks[group.simplified] ?? null,
      gloss: glosses[0], glosses,
    }
  })
  if (!entries.length || new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error('Empty output or duplicate dictionary IDs')
  return {
    metadata: {
      source: 'CC-CEDICT', url: SOURCE_URL, license: LICENSE_URL, sourceSha256,
      sourceTextSha256: sha256(text), sourceDate: /^#! date=(.+)$/mu.exec(text)?.[1]?.trim() ?? null,
      sourceHeader: header, entryCount: entries.length,
      frequencySource: frequency?.metadata ?? null,
      changes: ['two supported Han character filtering', 'two-syllable reading filtering', 'pinyin and tone normalization', 'simplified-form merging', 'deterministic form collision resolution', 'optional frequency overlay'],
      stats,
    },
    entries,
  }
}

export function attributionNotice(metadata) {
  const overlay = metadata.frequencySource
    ? `Frequency overlay: ${metadata.frequencySource.source}\nSource URL: ${metadata.frequencySource.url}\nAttribution: ${metadata.frequencySource.attribution}\nOverlay license: ${metadata.frequencySource.license}\nOverlay SHA-256: ${metadata.frequencySha256}`
    : 'No frequency overlay is included. Unknown frequency is null; curated game ordering is not a corpus rank.'
  return `CHINESE WORDLE — DICTIONARY ATTRIBUTION

This app ships a modified CC-CEDICT dictionary, maintained by the CC-CEDICT
community and published by MDBG. CC-CEDICT continues CEDICT, started by
Paul Andrew Denisowski in 1997.

Publisher: https://www.mdbg.net/chinese/dictionary?page=cedict
Project: https://cc-cedict.org/wiki/
Downloaded source: ${metadata.url}
Source release: ${metadata.sourceDate ?? 'Not specified in source'}
Compressed source SHA-256: ${metadata.sourceSha256}
Derived dictionary entries: ${metadata.entryCount}
Source entries: ${metadata.stats.sourceLines}
Supported source entries: ${metadata.stats.supportedLines}
Skipped forms: ${metadata.stats.skippedForms}
Skipped readings: ${metadata.stats.skippedReadings}
Merged source entries: ${metadata.stats.mergedLines}
Form collisions: ${metadata.stats.formCollisions}

CC-CEDICT and this derived dictionary
are provided under Creative Commons Attribution-ShareAlike 4.0 International:
${LICENSE_URL}
Full legal text is bundled alongside this notice as CC-BY-SA-4.0.txt.
Original legal text: https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt

Changes: ${metadata.changes.join('; ')}.
No local dictionary overrides are included. All entries, readings, and glosses
come from the source; canonical IDs depend only on simplified-form code points.

${overlay}

The dictionary data license is separate from the application source code
license; CC BY-SA does not relicense the application code. An optional
frequency source retains its own stated license and attribution; the
combined derived dictionary remains CC BY-SA 4.0. Only add compatible overlays.

No endorsement by MDBG, CC-CEDICT contributors, or Creative Commons is implied.
The data is supplied without warranties. See the full license for conditions.
`
}

async function boundedRead(path, maximum) {
  const { stat } = await import('node:fs/promises')
  if ((await stat(path)).size > maximum) throw new Error(`Input exceeds ${maximum} bytes: ${path}`)
  return readFile(path)
}

export async function main(args = process.argv.slice(2)) {
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source', '--frequency'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options[args[i]]) throw new Error('Usage: node tools\\build-dictionary.mjs --source content\\cedict-source.txt.gz [--frequency file.json]')
    options[args[i]] = args[i + 1]
  }
  if (!options['--source']) throw new Error('--source is required; the importer never downloads data')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const bytes = await boundedRead(resolve(options['--source']), MAX_SOURCE_BYTES)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(gunzipSync(bytes, { maxOutputLength: MAX_SOURCE_BYTES }))
  const frequencyBytes = options['--frequency'] ? await boundedRead(resolve(options['--frequency']), 8 * 1024 * 1024) : null
  const frequency = frequencyBytes ? validateFrequency(JSON.parse(frequencyBytes)) : null
  const result = buildDictionary(text, { sourceSha256: sha256(bytes), frequency })
  if (frequencyBytes) result.metadata.frequencySha256 = sha256(frequencyBytes)
  const output = resolve(root, 'src', 'generated', 'dictionary.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(result)}\n`)
  // The app loads this compact copy at runtime; the full file stays the editorial/tooling source.
  const { compactDictionary } = await import('./build-runtime-dictionary.mjs')
  await writeFile(resolve(root, 'src', 'generated', 'dictionary.runtime.json'), `${JSON.stringify(compactDictionary(result))}\n`)
  const notice = resolve(root, 'public', 'licenses', 'CC-CEDICT-NOTICE.txt')
  await mkdir(dirname(notice), { recursive: true })
  await writeFile(notice, attributionNotice(result.metadata))
  console.log(JSON.stringify({ output, entries: result.entries.length, stats: result.metadata.stats }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
