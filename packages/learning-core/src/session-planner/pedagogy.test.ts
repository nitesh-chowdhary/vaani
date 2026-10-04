import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  buildPlan,
  allowedActivity,
  replay,
  evaluate,
  intentFor,
  dimensionForIntent,
  selectRetrievalActivity,
  allowance,
  conversationallyReady,
  DAY,
  type ConceptState,
  type LearningEvent,
  type LearnerState,
  type Master,
} from '../index.js';
const catalog = buildCatalog(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../VAANI_TELUGU_A0_C2_FINAL_MASTER.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Master,
);
const now = 1700000000000;
const empty = replay(catalog, []);
const water = catalog.items['te.lex.water']!,
  tea = catalog.items['te.lex.tea']!,
  want = catalog.items['te.lex.want-need']!;
const concept = (
  dimensions: ConceptState['dimensions'] = {},
  extra: Partial<ConceptState> = {},
): ConceptState => ({
  introducedAt: now - DAY,
  lastAt: now,
  dueAt: now + DAY,
  milestone: 0,
  reinforcement: 5,
  failures: 0,
  attempts: 5,
  contexts: [],
  dimensions,
  ...extra,
});
function simulate(
  plan: ReturnType<typeof buildPlan>,
  initial = empty,
  count = 30,
) {
  let state = initial;
  let sequence = state.events.at(-1)?.sequence ?? 0;
  for (const a of plan.activities.slice(0, count)) {
    expect(
      allowedActivity(catalog, state, a, now),
      `${a.id}: ${a.type} ${a.conceptId}`,
    ).toBe(true);
    for (const id of a.choiceIds ?? [])
      expect(state.concepts[id], `Untaught option ${id}`).toBeTruthy();
    const e: LearningEvent = {
      id: `simulation-${++sequence}`,
      sessionId: 'sim',
      sequence,
      at: now + sequence,
      type: a.phase === 'exposure' ? 'concept_exposed' : 'activity_answered',
      conceptId: a.conceptId,
      activityId: a.id,
      dimension: a.dimension,
      evidence: 'independent',
      inputMode: a.intent?.response === 'speak' ? 'speech' : 'text',
      evaluationSkill: a.intent?.skill,
    };
    state = replay(catalog, [...state.events, e]);
  }
  return state;
}
describe('speaking/listening-first pedagogy', () => {
  it('simulates 30 zero-knowledge activities with taught options, safe combinations and no base-language typing', () => {
    const plan = buildPlan(catalog, empty, now, 60);
    simulate(plan);
    const first = plan.activities.slice(0, 30);
    expect(
      first.filter((a) => a.intent?.response === 'type_base'),
    ).toHaveLength(0);
    expect(
      first.filter((a) => a.intent?.response === 'speak').length,
    ).toBeGreaterThan(6);
    expect(
      first.filter((a) => a.intent?.skill === 'listening').length,
    ).toBeGreaterThan(5);
    expect(first.some((a) => a.type === 'sentence_construction')).toBe(true);
    expect(first[0]?.conceptId).toBe(water.id);
    expect(
      first.every(
        (a) =>
          a.phase !== 'exposure' ||
          (catalog.items[a.conceptId]!.meaning.en &&
            catalog.items[a.conceptId]!.romanization),
      ),
    ).toBe(true);
  });
  it('retrieves abstract words from authored context with target choices and speech', () => {
    const pattern = catalog.items.g01!;
    expect(
      selectRetrievalActivity(
        catalog,
        pattern,
        empty,
        'recall',
        new Set([pattern.id, want.id, water.id]),
      ).intent.response,
    ).toBe('choose_target');
    const p = buildPlan(catalog, empty, now, 60);
    const actions = p.activities.filter(
      (a) => a.conceptId === want.id && a.phase !== 'exposure',
    );
    expect(
      actions.some(
        (a) =>
          a.intent?.cue === 'context' && a.intent.response === 'choose_target',
      ),
    ).toBe(true);
    expect(actions.some((a) => a.intent?.response === 'speak')).toBe(true);
    expect(actions.every((a) => a.intent?.response !== 'type_base')).toBe(true);
  });
  it('uses recognition, listening and speech to rehabilitate weak words', () => {
    const state = {
      ...empty,
      concepts: {
        [water.id]: concept({}, { failures: 3, attempts: 3 }),
        [tea.id]: concept(),
      },
      events: [],
    };
    const reviews = buildPlan(catalog, state, now, 60).activities.filter(
      (a) => a.conceptId === water.id && a.phase === 'review',
    );
    expect(new Set(reviews.map((a) => a.intent?.response))).toEqual(
      new Set(['choose_target', 'choose_media', 'speak']),
    );
  });
  it('selects due modality from skill gaps and recent retrieval, independently of SRS dates', () => {
    const state = {
      ...empty,
      concepts: {
        [water.id]: concept({ spoken_production: 2, listening_recognition: 0 }),
        [tea.id]: concept(),
      },
    };
    const heard = selectRetrievalActivity(catalog, water, state, 'due');
    expect(heard.type).toBe('audio_image_recognition');
    const speaking = selectRetrievalActivity(
      catalog,
      water,
      {
        ...state,
        events: [
          {
            id: 'heard',
            sessionId: 's',
            sequence: 1,
            at: now,
            type: 'activity_answered',
            conceptId: water.id,
            dimension: 'listening_recognition',
            evidence: 'independent',
          },
        ],
      },
      'due',
    );
    expect(speaking.intent.response).toBe('speak');
    expect(state.concepts[water.id]!.dueAt).toBe(now + DAY);
  });
  it('trains writing explicitly only after conversational evidence and keeps reading distinct', () => {
    const state = {
      ...empty,
      concepts: {
        [water.id]: concept({
          listening_recognition: 3,
          spoken_production: 3,
          independent_recall: 3,
        }),
        [tea.id]: concept(),
      },
    };
    expect(
      selectRetrievalActivity(catalog, water, state, 'due').intent,
    ).toMatchObject({
      response: 'type_target',
      skill: 'writing',
      spellingMatters: true,
    });
    expect(
      selectRetrievalActivity(catalog, water, state, 'reading').intent,
    ).toMatchObject({
      skill: 'reading',
      response: 'choose_media',
      spellingMatters: false,
    });
    expect(intentFor('reading_recognition')).toMatchObject({
      skill: 'reading',
      spellingMatters: false,
    });
    expect(intentFor('spoken_recall')).toMatchObject({
      skill: 'speaking',
      spellingMatters: false,
    });
  });
  it('recognition and base-language typing alone do not create conversational strength or accelerated pacing', () => {
    const events = Array.from({ length: 30 }, (_, i): LearningEvent => ({
      id: `meaning-${i}`,
      sessionId: 's',
      sequence: i,
      at: now,
      type: 'activity_answered',
      conceptId: water.id,
      dimension: 'meaning_recognition',
      evidence: 'independent',
    }));
    const state = {
      ...empty,
      events,
      concepts: { [water.id]: concept({ meaning_recognition: 10 }) },
    };
    expect(conversationallyReady(state, water.id)).toBe(false);
    expect(allowance(state, now)).toBeLessThan(70);
  });
  it('comprehension accepts an obvious support-language typo without spelling feedback', () => {
    const result = evaluate(
      want,
      'meaning_recognition',
      { response: 'wnat', inputMode: 'text', latencyMs: 1000 },
      false,
    );
    expect(result).toMatchObject({
      classification: 'correct',
      evidence: 'independent',
      feedback: 'Correct',
    });
    expect(result.feedback).not.toMatch(/spell/iu);
  });
  it('reserves near-correct orthography feedback for explicit writing', () => {
    const item = {
      ...water,
      telugu: 'నాకు నీళ్లు కావాలి',
      acceptedAnswers: [],
    };
    expect(
      evaluate(
        item,
        'writing_recall',
        { response: 'నాకు నీళ్లు కాలి', inputMode: 'text', latencyMs: 1000 },
        false,
      ),
    ).toMatchObject({
      classification: 'nearly_correct',
      feedback: 'Almost — check the spelling.',
    });
    expect(
      evaluate(
        item,
        'spoken_recall',
        { response: 'నాకు నీళ్లు కాలి', inputMode: 'speech', latencyMs: 1000 },
        false,
      ).feedback,
    ).not.toMatch(/spell/iu);
    expect(
      evaluate(
        water,
        'writing_recall',
        { response: 'neellu', inputMode: 'text', latencyMs: 1000 },
        false,
      ).classification,
    ).toBe('incorrect');
  });
  it('keeps speech, comprehension, reading and writing evidence separate on replay', () => {
    const exposed: LearningEvent = {
      id: 'exposed',
      sessionId: 's',
      sequence: 1,
      at: now - DAY,
      type: 'concept_exposed',
      conceptId: water.id,
    };
    const e = (
      id: string,
      dimension: LearningEvent['dimension'],
      mode: LearningEvent['inputMode'],
      evidence: LearningEvent['evidence'] = 'independent',
    ): LearningEvent => ({
      id,
      sessionId: 's',
      sequence: Number(id),
      at: now,
      type: 'activity_answered',
      conceptId: water.id,
      dimension,
      inputMode: mode,
      evidence,
    });
    const reading = replay(catalog, [
      exposed,
      e('2', 'reading_recognition', 'text'),
    ]).concepts[water.id]!;
    expect(reading.dimensions.spoken_production).toBeUndefined();
    expect(reading.dimensions.delayed_recall).toBeUndefined();
    const oral = replay(catalog, [
      exposed,
      e('2', 'spoken_production', 'speech'),
    ]).concepts[water.id]!;
    expect(oral.dimensions).toMatchObject({
      spoken_production: 1,
      independent_recall: 1,
      delayed_recall: 1,
    });
    expect(oral.dimensions.written_production).toBeUndefined();
    const poorWriting = replay(catalog, [
      exposed,
      e('2', 'written_production', 'text', 'incorrect'),
    ]).concepts[water.id]!;
    expect(poorWriting.failures).toBe(0);
  });
  it('does not award independent speech evidence to typed or self-reported fallback', () => {
    expect(dimensionForIntent(intentFor('unscripted_transfer'))).toBe(
      'transfer_to_unseen_context',
    );
    expect(dimensionForIntent(intentFor('inference'))).toBe(
      'transfer_to_unseen_context',
    );
    expect(
      evaluate(
        water,
        'writing_recall',
        { response: water.telugu, inputMode: 'speech', latencyMs: 1000 },
        false,
      ).evidence,
    ).toBe('unverified');
    expect(
      evaluate(
        water,
        'spoken_recall',
        { response: 'watre', inputMode: 'text', latencyMs: 1000 },
        false,
      ).evidence,
    ).toBe('unverified');
    expect(
      evaluate(
        water,
        'spoken_recall',
        { response: 'neellu', inputMode: 'text', latencyMs: 1000 },
        false,
      ).evidence,
    ).toBe('unverified');
    expect(
      evaluate(
        water,
        'spoken_recall',
        {
          response: '',
          inputMode: 'self',
          selfRating: 'good',
          latencyMs: 1000,
        },
        true,
      ).evidence,
    ).toBe('self_reported');
  });
  it('keeps weak and strong pacing different, with no daily word cap', () => {
    const e = (evidence: LearningEvent['evidence']) =>
      Array.from({ length: 24 }, (_, i): LearningEvent => ({
        id: `p-${i}`,
        sessionId: 's',
        sequence: i,
        at: now,
        type: 'activity_answered',
        conceptId: water.id,
        dimension: [
          'spoken_production',
          'listening_recognition',
          'independent_recall',
          'delayed_recall',
        ][i % 4] as LearningEvent['dimension'],
        evidence,
      }));
    const strong = { ...empty, events: e('independent') };
    const weak = { ...empty, events: e('incorrect') };
    expect(allowance(strong, now, 120)).toBe(140);
    expect(allowance(weak, now)).toBeLessThan(allowance(strong, now));
    const p = buildPlan(catalog, weak, now, 60);
    simulate(p, weak);
  });
  it('established learners receive oral/contextual composition rather than automatic translation tests', () => {
    const opening = buildPlan(catalog, empty, now, 60);
    const state = simulate(opening, empty, 30);
    const established: LearnerState = { ...state, level: 'A1' };
    const plan = buildPlan(catalog, established, now + 1000, 5);
    expect(
      plan.activities.every((a) => a.intent?.response !== 'type_base'),
    ).toBe(true);
    expect(
      plan.activities.some((a) => a.type === 'combination_introduction'),
    ).toBe(true);
    expect(
      plan.activities.some((a) => a.intent?.skill === 'contextual_response'),
    ).toBe(true);
    simulate(plan, established, 30);
  });
});
