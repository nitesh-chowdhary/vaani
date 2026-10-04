export type AnswerClassification = 'correct' | 'nearly_correct' | 'incorrect';

export interface AnswerSpec {
  canonical: string;
  aliases: readonly string[];
  alternatives?: boolean;
  parentheticalContext?: boolean;
  commaAlternatives?: boolean;
}

// Display punctuation is not an answer requirement. Keep word order and negation.
export function normalizeMatchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/gu, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function splitOutsideParentheses(value: string, commas: boolean): string[] {
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (char === '/' || (commas && char === ','))) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

export function acceptedVariants(spec: AnswerSpec): string[] {
  const variants = [spec.canonical, ...spec.aliases].flatMap((value) => {
    const parts = spec.alternatives
      ? splitOutsideParentheses(value, !!spec.commaAlternatives)
      : [value];
    return [value, ...parts].flatMap((part) =>
      spec.parentheticalContext
        ? [part, part.replace(/\([^()]*\)/gu, '')]
        : [part],
    );
  });
  return [...new Set(variants.map(normalizeMatchText).filter(Boolean))];
}

function oneObviousTypo(expected: string, response: string): boolean {
  if (
    !/^\p{Script=Latin}+$/u.test(expected) ||
    !/^\p{Script=Latin}+$/u.test(response)
  )
    return false;
  const length = Math.max(expected.length, response.length);
  if (length > 64) return false;
  if (expected.length === response.length) {
    const different = [...expected].flatMap((letter, index) =>
      letter === response[index] ? [] : [index],
    );
    // A swapped pair is common; short-word substitutions can change the meaning.
    if (length >= 4 && different.length === 2) {
      const [a, b] = different as [number, number];
      return (
        b === a + 1 &&
        expected[a] === response[b] &&
        expected[b] === response[a]
      );
    }
    return length >= 7 && different.length === 1;
  }
  if (length < 5 || Math.abs(expected.length - response.length) !== 1)
    return false;
  const longer = expected.length > response.length ? expected : response;
  const shorter = expected.length > response.length ? response : expected;
  return [...longer].some(
    (_, index) => longer.slice(0, index) + longer.slice(index + 1) === shorter,
  );
}

// Expand only equivalences explicitly authored in the lexical glosses, while
// keeping the rest of a sentence intact. Never accept sentence fragments.
export function expandAuthoredAlternatives(
  display: string,
  groups: readonly string[],
): string[] {
  if (!display.includes('/')) return [];
  let variants = [display];
  for (const group of groups) {
    const parts = splitOutsideParentheses(group, false).map((part) =>
      part.trim(),
    );
    if (parts.length < 2 || parts.some((part) => !part || /[()]/u.test(part)))
      continue;
    const escaped = parts.map((part) =>
      part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+'),
    );
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])(?:${escaped.join('\\s*/\\s*')})(?=$|[^\\p{L}\\p{N}])`,
      'giu',
    );
    variants = [
      ...new Set(
        variants.flatMap((value) => [
          value,
          ...parts.map((part) =>
            value.replace(pattern, (_match, prefix: string) => prefix + part),
          ),
        ]),
      ),
    ].slice(0, 32);
  }
  return variants.filter((value) => value !== display);
}

function orthographicTypo(expected: string, response: string): boolean {
  if (!expected || !response) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const a = [...segmenter.segment(expected)].map((part) => part.segment);
  const b = [...segmenter.segment(response)].map((part) => part.segment);
  if (Math.max(a.length, b.length) < 4 || Math.max(a.length, b.length) > 64)
    return false;
  if (a.length === b.length) {
    const different = a.flatMap((value, i) => (value === b[i] ? [] : [i]));
    if (different.length === 1) return a.length >= 5;
    if (different.length === 2) {
      const [i, j] = different as [number, number];
      return j === i + 1 && a[i] === b[j] && a[j] === b[i];
    }
    return false;
  }
  if (Math.abs(a.length - b.length) !== 1) return false;
  const longer = a.length > b.length ? a : b,
    shorter = a.length > b.length ? b : a;
  return longer.some(
    (_, i) =>
      longer.filter((_, index) => i !== index).join('') === shorter.join(''),
  );
}

function nearMatch(expected: string, response: string): boolean {
  const expectedWords = expected.split(' ');
  const responseWords = response.split(' ');
  if (expectedWords.length !== responseWords.length) return false;
  const changed = expectedWords.filter(
    (word, index) => word !== responseWords[index],
  );
  return (
    changed.length === 1 &&
    expectedWords.every(
      (word, index) =>
        word === responseWords[index] ||
        oneObviousTypo(word, responseWords[index]!),
    )
  );
}

export function matchAnswer(
  response: string,
  spec: AnswerSpec,
  options: {
    allowTypos?: boolean;
    orthography?: boolean;
    knownAnswers?: ReadonlySet<string>;
  } = {},
): AnswerClassification {
  const normalized = normalizeMatchText(response);
  if (!normalized) return 'incorrect';
  const accepted = acceptedVariants(spec);
  if (accepted.includes(normalized)) return 'correct';
  const parts = spec.alternatives
    ? splitOutsideParentheses(response, !!spec.commaAlternatives).map(
        normalizeMatchText,
      )
    : [normalized];
  // Every supplied alternative must be valid; "want / banana" is not correct.
  if (parts.length > 1)
    return parts.every((part) => part && accepted.includes(part))
      ? 'correct'
      : 'incorrect';
  if (options.allowTypos === false || options.knownAnswers?.has(normalized))
    return 'incorrect';
  return accepted.some(
    (value) =>
      nearMatch(value, normalized) ||
      (!!options.orthography && orthographicTypo(value, normalized)),
  )
    ? 'nearly_correct'
    : 'incorrect';
}
