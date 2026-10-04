import { describe, it, expect } from 'vitest';
import {
  equivalentTeluguPronunciation,
  pronunciationIndex,
} from './telugu-pronunciation.js';
import { evaluate } from './evaluate.js';
import type { ContentItem } from '../content/types.js';
const target = (telugu: string, romanization: string) => ({
  telugu,
  romanization,
});
const coffee = target('కాఫీ', 'kaafee');
const item: ContentItem = {
  ...coffee,
  id: 'coffee',
  family: 'lexicalConcepts',
  level: 'A0',
  meaning: { en: 'coffee' },
  prompt: { en: 'coffee' },
  glosses: [],
  dependencies: [],
  acceptedAnswers: ['కాఫీ', 'kaafee'],
  register: 'spoken',
  reviewStatus: 'model_reviewed',
  audioSpeed: 'natural',
  productionReady: true,
  explicitInference: false,
  unseen: false,
  openResponse: false,
  dependencyComplete: true,
  raw: { id: 'coffee' },
};
describe('anchored Telugu pronunciation matrix', () => {
  it.each([
    'kaafee',
    'kaaffee',
    'kafe',
    'kaafe',
    'kaffe',
    'kafee',
    'KAAFFEE',
    ' kaafee! ',
    "kaa-f'fee",
    'kāfī',
    'kaaphee',
  ])('accepts coffee support spelling %s', (response) => {
    expect(equivalentTeluguPronunciation(response, coffee)).toBe(true);
    const result = evaluate(
      item,
      'spoken_recall',
      { response, inputMode: 'text', latencyMs: 1000 },
      false,
    );
    expect(result.classification).toBe('correct');
    expect(result.feedback).not.toMatch(/spelling/i);
    expect(result.evidence).toBe('independent');
    expect(result.recallOnly).toBe(true);
  });
  it.each([
    ['పాలు', 'paalu', 'palu', false],
    ['పాలు', 'paalu', 'pallu', false],
    ['ఇల్లు', 'illu', 'ilu', false],
    ['అన్నం', 'annam', 'anam', false],
    ['నీళ్లు', 'neellu', 'niillu', true],
    ['నీళ్లు', 'neellu', 'neelu', false],
    ['కావాలి', 'kaavaali', 'kavali', true],
    ['కావాలి', 'kaavaali', 'kaavali', true],
    ['కావాలి', 'kaavaali', 'kavaali', true],
    ['కావాలి', 'kaavaali', 'kaabali', false],
    ['వస్తాను', 'vastaanu', 'wasthanu', false],
    ['వస్తాను', 'vastaanu', 'wastanu', true],
    ['టీ', 'tee', 'tii', true],
    ['టీ', 'tee', 'ti', false],
    ['టీ', 'tee', 'ta', false],
    ['కాలు', 'kaalu', 'kalu', false],
    ['కల', 'kala', 'kaala', false],
    ['కాఫీ', 'kaafee', 'kati', false],
    ['కాఫీ', 'kaafee', 'coffee', false],
  ])('%s (%s) vs %s => %s', (telugu, romanization, response, accepted) => {
    expect(
      equivalentTeluguPronunciation(
        response,
        target(telugu as string, romanization as string),
      ),
    ).toBe(accepted);
  });
  it('abstains when vowel relaxation collides with a different authored word', () => {
    const a = target('వలము', 'valamu'),
      b = target('వాలము', 'vaalamu');
    expect(
      equivalentTeluguPronunciation('valamu', b, pronunciationIndex([a, b])),
    ).toBe(false);
  });
  it('accepts genuine authored alternatives, without inventing them', () => {
    const alternate = {
      ...item,
      acceptedAnswers: [...item.acceptedAnswers, 'కాపీ', 'kaapee'],
    };
    expect(
      evaluate(
        alternate,
        'spoken_recall',
        { response: 'కాపీ', inputMode: 'speech', latencyMs: 1000 },
        false,
      ).classification,
    ).toBe('correct');
    expect(
      evaluate(
        item,
        'spoken_recall',
        { response: 'కాపీ', inputMode: 'speech', latencyMs: 1000 },
        false,
      ).classification,
    ).toBe('incorrect');
  });
  it('never applies phonetic Latin matching to Telugu writing', () => {
    for (const response of ['kaafee', 'kaaffee', 'kafe', 'కాపీ'])
      expect(
        evaluate(
          item,
          'writing_recall',
          { response, inputMode: 'text', latencyMs: 1000 },
          false,
        ).classification,
      ).not.toBe('correct');
    expect(
      evaluate(
        item,
        'writing_recall',
        { response: 'కాఫీ', inputMode: 'text', latencyMs: 1000 },
        false,
      ).classification,
    ).toBe('correct');
  });
});
