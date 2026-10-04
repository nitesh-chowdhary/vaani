// Pronunciation support, not transliteration correctness. The Telugu spelling
// anchors consonants, aspiration and real gemination; display Latin text is not
// the identity. Loose vowel length is allowed only for longer, unambiguous forms.
export interface PronunciationTarget {
  telugu: string;
  romanization: string;
}
export type PronunciationIndex = ReadonlyMap<string, ReadonlySet<string>>;
const clean = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[\p{P}\p{Z}\s]+/gu, '');
const identity = (text: string) => clean(text);
function key(text: string) {
  return clean(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ph/g, 'f')
    .replace(/w/g, 'v')
    .replace(/ee/g, 'i')
    .replace(/([aeiou])\1+/g, '$1')
    .replace(/([bcdfgklmnprstvy])\1+/g, '$1');
}
export function pronunciationIndex(
  targets: Iterable<PronunciationTarget>,
): PronunciationIndex {
  const index = new Map<string, Set<string>>();
  for (const target of targets) {
    if (!target.romanization) continue;
    const k = key(target.romanization);
    const entries = index.get(k) ?? new Set<string>();
    entries.add(identity(target.telugu));
    index.set(k, entries);
  }
  return index;
}
const consonants: Record<string, string> = {
  క: 'k',
  ఖ: 'kh',
  గ: 'g',
  ఘ: 'gh',
  ఙ: 'ng',
  చ: 'ch',
  ఛ: 'chh',
  జ: 'j',
  ఝ: 'jh',
  ఞ: 'ny',
  ట: 't',
  ఠ: 'th',
  డ: 'd',
  ఢ: 'dh',
  ణ: 'n',
  త: 't',
  థ: 'th',
  ద: 'd',
  ధ: 'dh',
  న: 'n',
  ప: 'p',
  ఫ: 'ph',
  బ: 'b',
  భ: 'bh',
  మ: 'm',
  య: 'y',
  ర: 'r',
  ఱ: 'r',
  ల: 'l',
  ళ: 'l',
  వ: 'v',
  శ: 'sh',
  ష: 'sh',
  స: 's',
  హ: 'h',
};
const vowels: Record<string, string[]> = {
  అ: ['a'],
  ఆ: ['aa', 'ā'],
  ఇ: ['i'],
  ఈ: ['ii', 'ee', 'ī'],
  ఉ: ['u'],
  ఊ: ['uu', 'oo', 'ū'],
  ఎ: ['e'],
  ఏ: ['ee', 'e', 'ē'],
  ఐ: ['ai'],
  ఒ: ['o'],
  ఓ: ['oo', 'o', 'ō'],
  ఔ: ['au', 'ou'],
  'ా': ['aa', 'ā'],
  'ి': ['i'],
  'ీ': ['ii', 'ee', 'ī'],
  'ు': ['u'],
  'ూ': ['uu', 'oo', 'ū'],
  'ె': ['e'],
  'ే': ['ee', 'e', 'ē'],
  'ై': ['ai'],
  'ొ': ['o'],
  'ో': ['oo', 'o', 'ō'],
  'ౌ': ['au', 'ou'],
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function equivalentTeluguPronunciation(
  response: string,
  target: PronunciationTarget,
  index?: PronunciationIndex,
): boolean {
  if (!/^[\p{Script=Latin}\p{M}\p{P}\p{Z}\s]+$/u.test(response)) return false;
  const chars = [...identity(target.telugu)];
  const syllables = chars.filter((c) => !!consonants[c] || !!vowels[c]).length;
  // Short words retain vowel length and consonant identity. No edit distance.
  const relaxed = syllables >= 5 || chars.includes('ఫ');
  let pattern = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (consonants[c]) {
      let forms = [consonants[c]];
      if (c === 'వ') forms.push('w');
      if (c === 'చ') forms.push('c');
      if (c === 'ఫ') forms.push('f', 'ff');
      if (['ట', 'డ', 'ణ', 'ళ'].includes(c))
        forms.push({ ట: 'ṭ', డ: 'ḍ', ణ: 'ṇ', ళ: 'ḷ' }[c]!);
      // True Telugu double consonants must stay double, including retroflex ll.
      const geminate = chars[i + 1] === '్' && chars[i + 2] === c;
      if (geminate) {
        forms = forms.map((f) => f + f);
        i += 2;
      }

      pattern += `(?:${forms.map(escape).join('|')})`;
      if (chars[i + 1] === '్') {
        i++;
        continue;
      }
      const sign = chars[i + 1];
      if (vowels[sign]) {
        pattern += vowel(sign, relaxed, i + 1 === chars.length - 1);
        i++;
      } else pattern += 'a';
    } else if (vowels[c]) pattern += vowel(c, relaxed, i === chars.length - 1);
    else if (c === 'ం') pattern += '(?:m|n)';
    else if (c === 'ః') pattern += 'h';
    else if (/\p{Script=Telugu}/u.test(c)) return false;
    else pattern += escape(c);
  }
  const normalized = clean(response);
  if (!pattern || !new RegExp(`^${pattern}$`, 'u').test(normalized))
    return false;
  // If relaxing transcription could describe another authored word, abstain.
  const competing = index?.get(key(response));
  return (
    !competing || [...competing].every((t) => t === identity(target.telugu))
  );
}
function vowel(c: string, relaxed: boolean, final: boolean) {
  const forms = [...vowels[c]];
  if (relaxed) {
    if (['ఆ', 'ా'].includes(c)) forms.push('a');
    if (['ఈ', 'ీ'].includes(c)) forms.push('i', ...(final ? ['e'] : []));
    if (['ఊ', 'ూ'].includes(c)) forms.push('u');
  }
  return `(?:${[...new Set(forms)].map(escape).join('|')})`;
}
