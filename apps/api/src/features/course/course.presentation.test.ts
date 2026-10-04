import { describe, expect, it } from 'vitest';
import { replay, type Activity } from '@vaani/learning-core';
import { loadContent } from '../content/content.service.js';
import { activitySupport, coursePresentation } from './course.presentation.js';

const { catalog } = loadContent();
const activity: Activity = {
  id: 'practice',
  conceptId: 'te.lex.water',
  type: 'spoken_recall',
  phase: 'practice',
  prompt: '',
  dimension: 'spoken_production',
};
describe('course presentation contract', () => {
  it('adapts authoritative course language metadata without editing the source', () => {
    expect(coursePresentation(catalog)).toEqual({
      targetLanguage: {
        code: 'te',
        name: 'Telugu',
        nativeName: 'తెలుగు',
        speechLocale: 'te-IN',
        hasRomanization: true,
      },
      baseLanguage: { code: 'en', name: 'English' },
    });
  });
  it('supports other language metadata without requiring another authored course', () => {
    const fixture = {
      ...catalog,
      master: {
        ...catalog.master,
        targetLanguage: { code: 'xx', name: 'Target' },
        baseLanguage: { default: 'zz', name: 'Base' },
      },
    };
    expect(coursePresentation(fixture)).toEqual({
      targetLanguage: {
        code: 'xx',
        name: 'Target',
        speechLocale: 'xx',
        hasRomanization: false,
      },
      baseLanguage: { code: 'zz', name: 'Base' },
    });
  });
  it('keeps beginner support and reduces prominence only with demonstrated recall, speech and retention', () => {
    const empty = replay(catalog, []);
    expect(activitySupport(activity, empty).romanizationDefault).toBe(true);
    const known = {
      ...empty,
      concepts: {
        [activity.conceptId]: {
          introducedAt: 0,
          lastAt: 0,
          dueAt: 0,
          milestone: 0,
          reinforcement: 0,
          failures: 0,
          attempts: 20,
          contexts: [],
          dimensions: {
            meaning_recognition: 10,
            independent_recall: 4,
            spoken_production: 3,
            delayed_recall: 2,
          },
        },
      },
    };
    expect(activitySupport(activity, known).romanizationDefault).toBe(false);
    expect(
      activitySupport(activity, {
        ...known,
        events: [
          {
            id: 'recent',
            sessionId: 'session',
            sequence: 1,
            at: 1,
            type: 'activity_answered',
            conceptId: activity.conceptId,
            evidence: 'incorrect',
          },
        ],
      }).romanizationDefault,
    ).toBe(true);
    expect(
      activitySupport({ ...activity, phase: 'exposure' }, known)
        .romanizationDefault,
    ).toBe(true);
    expect(
      activitySupport(activity, {
        ...known,
        concepts: {
          [activity.conceptId]: {
            ...known.concepts[activity.conceptId]!,
            dimensions: { meaning_recognition: 10 },
          },
        },
      }).romanizationDefault,
    ).toBe(true);
  });
});
