/**
 * Demo cards + idioms shown on the wrap screen.
 *
 * Demo mode is the always-works fallback: no network calls, no Anki dependency.
 * Includes one sentence card with a `words` array so STPVO can be exercised.
 */
export const DEMO_CARDS = [
  { hanzi: '学习',     pinyin: 'xuéxí',    english: 'to study / to learn',         audioFile: null, type: 'New',    words: null },
  { hanzi: '朋友',     pinyin: 'péngyou',  english: 'friend',                       audioFile: null, type: 'New',    words: null },
  { hanzi: '我今天去图书馆学习', pinyin: 'Wǒ jīntiān qù túshūguǎn xuéxí',
                                            english: 'I go to the library to study today',
                                                                                    audioFile: null, type: 'Review', words: ['我','今天','图书馆','去','学习'] },
  { hanzi: '安心',     pinyin: 'ānxīn',    english: 'peace of mind / to feel at ease', audioFile: null, type: 'New',    words: null },
  { hanzi: '时间',     pinyin: 'shíjiān',  english: 'time',                         audioFile: null, type: 'New',    words: null },
  { hanzi: '明白',     pinyin: 'míngbai',  english: 'to understand / clear',        audioFile: null, type: 'New',    words: null },
];

export const IDIOMS = [
  { zh: '加油',         py: 'Jiāyóu',                en: '"Add oil" — keep going!' },
  { zh: '熟能生巧',     py: 'Shú néng shēng qiǎo',   en: '"Practice makes perfect"' },
  { zh: '学无止境',     py: 'Xué wú zhǐ jìng',       en: '"Learning has no end"' },
  { zh: '坚持就是胜利', py: 'Jiānchí jiùshì shènglì', en: '"Persistence is victory"' },
  { zh: '一步一个脚印', py: 'Yī bù yī gè jiǎoyìn',   en: '"One step, one footprint"' },
  { zh: '日积月累',     py: 'Rì jī yuè lěi',         en: '"Day after day, month after month"' },
];

export const pickIdiom = () => IDIOMS[Math.floor(Math.random() * IDIOMS.length)];
