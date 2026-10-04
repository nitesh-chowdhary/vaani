import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../content/catalog.js';
import type { ContentItem, Master } from '../content/types.js';
import {
  acceptedVariants,
  matchAnswer,
  normalizeMatchText,
} from './answer-matcher.js';
import { evaluate, meaningAnswerSpec } from './evaluate.js';

const master = JSON.parse(
  readFileSync(
    new URL(
      '../../../../VAANI_TELUGU_A0_C2_FINAL_MASTER.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Master;
const catalog = buildCatalog(master);
const want = catalog.items['te.lex.want-need']!;
const water = catalog.items['te.lex.water']!;
const answer = (response: string) => ({
  response,
  inputMode: 'text' as const,
  latencyMs: 1000,
});
const check = (item: ContentItem, response: string) =>
  evaluate(item, 'meaning_recognition', answer(response), false);

describe('meaning matching', () => {
  it.each([
    'want',
    'need',
    'Want',
    ' NEED ',
    'want / need',
    'need / want',
    'NEED/WANT',
    'want!',
    ' need  /   want. ',
  ])('accepts %s for want / need', (response) => {
    expect(check(want, response)).toMatchObject({
      classification: 'correct',
      feedback: 'Correct',
      evidence: 'independent',
    });
  });
  it.each(['banana', 'went', 'not want', 'want / banana', '', 'desire'])(
    'rejects %s without inventing synonyms',
    (response) => {
      expect(check(want, response)).toMatchObject({
        classification: 'incorrect',
        feedback: 'Try again',
      });
    },
  );
  it('normalizes harmless punctuation, apostrophes, repeated spaces, and case without reordering sentences', () => {
    expect(normalizeMatchText('  DON’T   WANT! ')).toBe('dont want');
    const item = catalog.items['te.lex.dont-want']!;
    expect(check(item, 'dont want')).toMatchObject({
      classification: 'correct',
    });
    expect(check(item, 'want')).toMatchObject({ classification: 'incorrect' });
    expect(
      matchAnswer('water want I', { canonical: 'I want water.', aliases: [] }),
    ).toBe('incorrect');
  });
  it('treats commas as lexical alternatives but keeps commas in sentences as punctuation', () => {
    expect(
      matchAnswer('home, house', {
        canonical: 'house, home',
        aliases: [],
        alternatives: true,
        commaAlternatives: true,
      }),
    ).toBe('correct');
    expect(
      matchAnswer('home', {
        canonical: 'house, home',
        aliases: [],
        alternatives: true,
        commaAlternatives: true,
      }),
    ).toBe('correct');
    const sentence = { canonical: 'I agree, but we need time.', aliases: [] };
    expect(matchAnswer('I agree but we need time', sentence)).toBe('correct');
    expect(matchAnswer('I agree', sentence)).toBe('incorrect');
    expect(matchAnswer('but we need time', sentence)).toBe('incorrect');
  });
  it('allows omission of lexical context notes without turning them into standalone answers', () => {
    const polite = catalog.items['te.lex.you-polite']!;
    expect(check(polite, 'you')).toMatchObject({ classification: 'correct' });
    expect(check(polite, 'you (polite / plural)')).toMatchObject({
      classification: 'correct',
    });
    for (const response of ['polite', 'plural', 'you (casual)'])
      expect(check(polite, response).classification).toBe('incorrect');
    expect(
      check(catalog.items['te.lex.we-exclusive']!, 'we (including you)')
        .classification,
    ).toBe('incorrect');
  });
  it('handles every authored lexical slash alternative and preserves its display meaning', () => {
    let checked = 0;
    for (const record of master.lexicalConcepts) {
      const display = (record.meaning as { en: string }).en;
      const parts = display
        .replace(/\([^()]*\)/gu, '')
        .split('/')
        .map((part) => part.trim());
      if (parts.length < 2) continue;
      checked++;
      const item = catalog.items[record.id]!;
      for (const part of parts)
        expect(check(item, part).classification, `${item.id}: ${part}`).toBe(
          'correct',
        );
      expect(
        check(item, parts.reverse().join(' / ')).classification,
        item.id,
      ).toBe('correct');
      expect(item.meaning.en).toBe(display);
    }
    expect(checked).toBeGreaterThan(160);
  });
  it('loads explicitly authored meaning aliases and production alternatives without changing the master', () => {
    const copy = structuredClone(master);
    const record = copy.lexicalConcepts.find((item) => item.id === want.id)!;
    record.acceptedMeanings = { en: ['desire'], hi: ['चाहना'] };
    record.meaningAliases = { en: ['would like'] };
    record.acceptedAnswers = ['కావాలండి'];
    const item = buildCatalog(copy).items[want.id]!;
    for (const response of ['desire', 'would like'])
      expect(check(item, response).classification).toBe('correct');
    expect(
      evaluate(
        item,
        'spoken_recall',
        { ...answer('కావాలండి'), inputMode: 'speech' },
        false,
      ).classification,
    ).toBe('correct');
    expect(
      master.lexicalConcepts.find((entry) => entry.id === want.id),
    ).not.toHaveProperty('acceptedMeanings');
  }, 15000);
  it('matches only the selected base language', () => {
    const item = {
      ...want,
      meaning: { en: 'want / need', es: 'querer / necesitar' },
      acceptedMeanings: { es: ['desear'] },
    };
    expect(
      evaluate(item, 'meaning_recognition', answer('necesitar'), false, {
        baseLanguage: 'es',
      }).classification,
    ).toBe('correct');
    expect(
      evaluate(item, 'meaning_recognition', answer('desear'), false, {
        baseLanguage: 'es',
      }).classification,
    ).toBe('correct');
    expect(
      evaluate(item, 'meaning_recognition', answer('want'), false, {
        baseLanguage: 'es',
      }).classification,
    ).toBe('incorrect');
  });
  it('expands authored word alternatives inside sentences without accepting fragments', () => {
    const sentence = catalog.items['te.sent.00001']!;
    for (const response of ['I want water.', 'I need water'])
      expect(check(sentence, response).classification).toBe('correct');
    for (const response of ['I want', 'need water', 'I do not want water'])
      expect(check(sentence, response).classification).toBe('incorrect');
    const pattern = catalog.items.g01!;
    expect(check(pattern, 'I need ___.').classification).toBe('correct');
  });
});

describe('conservative typo feedback and natural production', () => {
  it.each(['watre', 'waater', 'watr'])(
    'accepts %s as understood without testing support-language spelling',
    (response) => {
      expect(check(water, response)).toMatchObject({
        classification: 'correct',
        feedback: 'Correct',
        evidence: 'independent',
      });
    },
  );
  it('permits a short transposition but rejects short substitutions and wrong word lists', () => {
    expect(check(want, 'wnat').classification).toBe('correct');
    expect(check(water, 'later').classification).toBe('incorrect');
    expect(check(want, 'want / nead').classification).toBe('incorrect');
    expect(
      matchAnswer(
        'pubic',
        { canonical: 'public', aliases: [] },
        { knownAnswers: new Set(['pubic']) },
      ),
    ).toBe('incorrect');
  });
  it('does not give fuzzy credit to choice IDs or speech transcripts', () => {
    expect(
      evaluate(water, 'image_word_recognition', answer('te.lex.watre'), false)
        .classification,
    ).toBe('incorrect');
    expect(
      evaluate(
        water,
        'spoken_recall',
        { ...answer('neellu'), inputMode: 'speech' },
        false,
      ).classification,
    ).toBe('correct');
    expect(
      evaluate(
        water,
        'spoken_recall',
        { ...answer('neelllu'), inputMode: 'speech' },
        false,
      ).classification,
    ).toBe('incorrect');
  });
  it('accepts multiple explicitly authored natural sentences, while honoring an exact-construction task', () => {
    const item = {
      ...catalog.items['te.sent.00001']!,
      acceptedAnswers: [
        'నాకు నీళ్లు కావాలి.',
        'నీళ్లు కావాలి.',
        'neellu kaavaali',
      ],
    };
    for (const response of item.acceptedAnswers)
      expect(
        evaluate(item, 'combination_recall', answer(response), false)
          .classification,
      ).toBe('correct');
    expect(
      evaluate(
        { ...item, raw: { ...item.raw, scriptedAnswerRequired: true } },
        'combination_recall',
        answer('నీళ్లు కావాలి.'),
        false,
      ).classification,
    ).toBe('incorrect');
  });
  it('keeps internal evidence states out of open-response and self-check feedback', () => {
    const results = [
      evaluate(
        { ...want, openResponse: true },
        'context_response',
        answer('my response'),
        false,
      ),
      evaluate(
        want,
        'spoken_recall',
        { ...answer(''), inputMode: 'self', selfRating: 'good' },
        false,
      ),
    ];
    expect(results[0]!.evidence).toBe('unverified');
    for (const result of results)
      expect(result.feedback).not.toMatch(
        /model|unverified|verified|rubric|evidence|classification|confidence/iu,
      );
    expect(acceptedVariants(meaningAnswerSpec(want))).toContain('need');
  });
});
