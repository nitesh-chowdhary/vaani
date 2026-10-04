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
  communicationClusters,
  nextReinforcement,
  schedule,
  shouldSuppressActivity,
  retrievalForMemory,
  knowledgeDepth,
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
          a.intent?.skill === 'listening' &&
          a.intent.response === 'choose_target',
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
    ).toBe('incorrect');
    expect(
      evaluate(
        water,
        'spoken_recall',
        { response: 'neellu', inputMode: 'text', latencyMs: 1000 },
        false,
      ).evidence,
    ).toBe('independent');
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

describe('communication clusters', () => {
  it('reaches authored multi-word speech by activity 11 after real prerequisite evidence', () => {
    const plan = buildPlan(catalog, empty, now);
    const position = plan.activities.findIndex(
      (a) =>
        a.intent?.response === 'speak' &&
        catalog.items[a.conceptId]?.family === 'sentenceBank',
    );
    expect(position + 1).toBeLessThanOrEqual(12);
    simulate(plan, empty, 60);
    expect(
      plan.activities
        .slice(0, position)
        .filter(
          (a) =>
            a.phase === 'exposure' &&
            catalog.items[a.conceptId]?.family === 'lexicalConcepts',
        ),
    ).toHaveLength(2);
  });
  it('prefers mostly-known dependencies and introduces no unrelated vocabulary', () => {
    const s = {
      ...empty,
      concepts: {
        [want.id]: concept({ listening_recognition: 1, spoken_production: 1 }),
        [tea.id]: concept({ listening_recognition: 1, spoken_production: 1 }),
        g01: concept({ listening_recognition: 1 }),
      },
    };
    const plan = buildPlan(catalog, s, now);
    const first = plan.activities.find(
      (a) => a.type === 'combination_introduction',
    )!;
    expect(first.conceptId).toBe('te.sent.00005');
    expect(
      plan.activities
        .slice(0, plan.activities.indexOf(first))
        .some(
          (a) =>
            a.phase === 'exposure' &&
            catalog.items[a.conceptId]?.family === 'lexicalConcepts',
        ),
    ).toBe(false);
  });
  it('substitutes through existing validated sentences sharing an authored pattern', () => {
    const clusters = communicationClusters(catalog, empty);
    const request = clusters.find((c) => c.target.id === 'te.sent.00001')!;
    expect(request.variations.length).toBeGreaterThan(1);
    const plan = buildPlan(catalog, empty, now);
    const sentences = plan.activities.filter(
      (a) => a.type === 'combination_introduction',
    );
    expect(sentences.length).toBeGreaterThan(2);
    for (const a of sentences)
      expect(catalog.items[a.conceptId]?.raw.id).toBe(a.conceptId);
    simulate(plan, empty, 100);
  });
  it('keeps exact SRS schedules and schedules sentence retrieval beyond a year', () => {
    const days = catalog.master.srsPolicy
      .delayedRecallMilestoneDays as number[];
    const same = catalog.master.srsPolicy
      .sameSessionReinforcementMinutes as number[];
    expect(days).toEqual([1, 2, 3, 5, 7, 14, 30, 60, 120, 240, 365]);
    expect(same).toEqual([0, 4, 12, 25, 45]);
    const c = concept(
      {},
      { introducedAt: now - 400 * DAY, dueAt: now, milestone: 11 },
    );
    expect(schedule(c, 'independent', now, days, same).dueAt).toBeGreaterThan(
      now + DAY,
    );
    expect(schedule(c, 'incorrect', now, days, same).dueAt).toBe(
      now + 4 * 60000,
    );
    const sentence = catalog.items['te.sent.00001']!;
    const state = simulate(buildPlan(catalog, empty, now), empty, 30);
    expect(state.concepts[sentence.id]?.reinforcement).toBeGreaterThan(0);
    state.concepts[sentence.id]!.dueAt = now;
    state.concepts[sentence.id]!.introducedAt = now - 5 * 60000;
    const activity = nextReinforcement(catalog, state, now, 's', new Set());
    expect(activity?.intent?.response).not.toBe('type_base');
  });
  it('selects dialogue response review rather than reciting the entire dialogue', () => {
    const d = catalog.items['te.dialogue.0002']!;
    expect(selectRetrievalActivity(catalog, d, empty, 'due').type).toBe(
      'roleplay_a',
    );
    expect(
      selectRetrievalActivity(catalog, d, empty, 'reinforce').intent.response,
    ).toBe('speak');
    expect(
      communicationClusters(catalog, empty).some((c) => c.target.id === d.id),
    ).toBe(true);
  });
  it('blocks sentence production if listening or speech prerequisites are missing', () => {
    const sentence = catalog.items['te.sent.00001']!;
    const state = {
      ...empty,
      concepts: Object.fromEntries(
        [...sentence.dependencies, sentence.id].map((id) => [
          id,
          concept({ meaning_recognition: 2 }),
        ]),
      ),
    };
    const a = {
      id: 'blocked',
      conceptId: sentence.id,
      type: 'combination_recall',
      phase: 'practice' as const,
      dimension: 'contextual_response' as const,
      prompt: '',
    };
    expect(allowedActivity(catalog, state, a, now)).toBe(false);
  });
});

it('follows a real authored trajectory through substitutions, a micro-dialogue and delayed review', () => {
  let state = empty;
  let dialogueSeen = false;
  for (let session = 0; session < 4; session++) {
    const plan = buildPlan(catalog, state, now + session * 60000, 60);
    dialogueSeen ||= plan.activities.some((a) => a.type === 'roleplay_a');
    state = simulate(plan, state, plan.activities.length);
  }
  expect(dialogueSeen).toBe(true);
  const due = buildPlan(catalog, state, now + 2 * DAY, 60);
  expect(
    due.activities.some(
      (a) =>
        a.phase === 'review' &&
        catalog.items[a.conceptId]?.family === 'sentenceBank',
    ),
  ).toBe(true);
  expect(state.level).toBe('A0');
});
it('retains weak-learner communication practice while reducing new dependencies', () => {
  const events: LearningEvent[] = Array.from({ length: 20 }, (_, i) => ({
    id: `weak-${i}`,
    sessionId: 'weak',
    sequence: i,
    at: now,
    type: 'activity_answered',
    conceptId: water.id,
    dimension: 'spoken_production',
    evidence: 'incorrect',
  }));
  const state = {
    ...empty,
    events,
    concepts: { [water.id]: concept({}, { failures: 4, attempts: 4 }) },
  };
  const plan = buildPlan(catalog, state, now);
  expect(plan.allowance).toBeLessThan(buildPlan(catalog, empty, now).allowance);
  expect(
    plan.activities.some(
      (a) => a.phase === 'review' && a.conceptId === water.id,
    ),
  ).toBe(true);
  expect(
    plan.activities.some((a) => a.type === 'combination_introduction'),
  ).toBe(true);
});
it('only matches the authored productive role, never the entire dialogue as an oral target', () => {
  const d = catalog.items['te.dialogue.0002']!;
  const turn = (d.raw.turns as { speaker: string; telugu: string }[]).find(
    (t) => t.speaker === 'A',
  )!;
  expect(
    evaluate(
      d,
      'roleplay_a',
      { response: turn.telugu, inputMode: 'speech', latencyMs: 1000 },
      false,
    ).evidence,
  ).toBe('independent');
  expect(
    evaluate(
      d,
      'roleplay_a',
      { response: turn.telugu, inputMode: 'text', latencyMs: 1000 },
      false,
    ).evidence,
  ).toBe('independent');
});

it('a successfully repaired pattern does not permanently block its communication target', () => {
  const sentence = catalog.items['te.sent.00001']!;
  const state = {
    ...empty,
    concepts: Object.fromEntries(
      sentence.dependencies.map((id) => [
        id,
        concept(
          { listening_recognition: 1, spoken_production: 1 },
          { failures: 1, attempts: 2 },
        ),
      ]),
    ),
    events: [
      {
        id: 'repair',
        sessionId: 's',
        sequence: 1,
        at: now,
        type: 'activity_answered' as const,
        conceptId: 'g01',
        dimension: 'listening_recognition' as const,
        evidence: 'independent' as const,
      },
    ],
  };
  expect(
    allowedActivity(
      catalog,
      state,
      {
        id: 'sentence',
        conceptId: sentence.id,
        type: 'combination_introduction',
        phase: 'exposure',
        dimension: 'meaning_recognition',
        prompt: '',
      },
      now,
    ),
  ).toBe(true);
});

describe('P0 progression and repetition', () => {
  function journey(mode: 'speech' | 'text', limit = 100) {
    let state = empty,
      sequence = 0;
    const rows: {
      conceptId: string;
      type: string;
      family: string;
      response?: string;
    }[] = [];
    for (let session = 0; session < 4 && rows.length < limit; session++) {
      for (const a of buildPlan(catalog, state, now + session * 60000)
        .activities) {
        if (rows.length === limit) break;
        if (
          !allowedActivity(catalog, state, a, now + session * 60000) ||
          shouldSuppressActivity(catalog, state, a)
        )
          continue;
        const item = catalog.items[a.conceptId]!;
        const role = a.type.startsWith('roleplay')
          ? (
              item.raw.turns as {
                speaker: string;
                telugu: string;
                romanization: string;
              }[]
            ).find((t) => t.speaker === (a.type === 'roleplay_b' ? 'B' : 'A'))
          : undefined;
        if (a.intent?.response === 'speak' && mode === 'text') {
          state = replay(catalog, [
            ...state.events,
            {
              id: `asr-${++sequence}`,
              sessionId: `session-${session}`,
              sequence,
              at: now + sequence,
              type: 'speech_verification_pending',
              conceptId: item.id,
              speechVerificationPending: true,
            },
          ]);
        }
        const result =
          a.phase === 'exposure'
            ? undefined
            : evaluate(
                item,
                a.type,
                {
                  response: a.choiceIds
                    ? item.id
                    : mode === 'text'
                      ? (role?.romanization ?? item.romanization)
                      : (role?.telugu ?? item.telugu),
                  inputMode: a.intent?.response === 'speak' ? mode : 'text',
                  latencyMs: 1000,
                },
                false,
                { intent: a.intent },
              );
        expect(result?.classification).not.toBe('incorrect');
        rows.push({
          conceptId: item.id,
          type: a.type,
          family: item.family,
          response: a.intent?.response,
        });
        state = replay(catalog, [
          ...state.events,
          {
            id: `answer-${++sequence}`,
            sessionId: `session-${session}`,
            sequence,
            at: now + sequence,
            type:
              a.phase === 'exposure' ? 'concept_exposed' : 'activity_answered',
            conceptId: item.id,
            activityId: a.id,
            activityType: a.type,
            dimension: result?.recallOnly ? 'independent_recall' : a.dimension,
            evidence: result?.evidence,
            inputMode: a.intent?.response === 'speak' ? mode : 'text',
            evaluationSkill: a.intent?.skill,
            speechVerificationPending: result?.recallOnly ? true : undefined,
          },
        ]);
      }
    }
    return { state, rows };
  }
  it.each(['speech', 'text'] as const)(
    '100 correct activities progress through language with %s',
    (mode) => {
      const { state, rows } = journey(mode);
      expect(rows).toHaveLength(100);
      const lexical = rows.filter((r) => r.family === 'lexicalConcepts');
      expect(lexical.length).toBeLessThan(60);
      expect(
        Math.max(
          ...lexical.map(
            (r) => lexical.filter((x) => x.conceptId === r.conceptId).length,
          ),
        ),
      ).toBeLessThan(6);
      expect(rows.some((r) => r.type === 'roleplay_a')).toBe(true);
      expect(
        rows.filter((r) => r.family === 'sentenceBank').length,
      ).toBeGreaterThan(40);
      expect(new Set(lexical.map((r) => r.conceptId)).size).toBeGreaterThan(10);
      if (mode === 'text') {
        expect(
          Object.values(state.concepts).every(
            (c) => !(c.dimensions.spoken_production ?? 0),
          ),
        ).toBe(true);
        expect(
          Object.values(state.concepts).every((c) => c.failures === 0),
        ).toBe(true);
        expect(
          state.concepts[water.id]?.dimensions.independent_recall,
        ).toBeGreaterThan(0);
        expect(state.concepts[water.id]?.speechVerificationPending).toBe(true);
      }
    },
  );
  it('suppresses isolated practice after recall but a genuine failure re-enables support', () => {
    const { state } = journey('speech', 30);
    const a = {
      id: 'duplicate',
      conceptId: water.id,
      type: 'spoken_recall',
      phase: 'practice' as const,
      dimension: 'spoken_production' as const,
      prompt: '',
    };
    expect(shouldSuppressActivity(catalog, state, a)).toBe(true);
    expect(knowledgeDepth(catalog, state, water.id)).toBeGreaterThanOrEqual(4);
    const failed = replay(catalog, [
      ...state.events,
      {
        id: 'failed',
        sessionId: 's',
        sequence: 9999,
        at: now + 400000,
        type: 'activity_answered',
        conceptId: water.id,
        dimension: 'independent_recall',
        evidence: 'incorrect',
        inputMode: 'text',
      },
    ]);
    expect(shouldSuppressActivity(catalog, failed, a)).toBe(false);
    expect(
      retrievalForMemory(catalog, water, failed, now + 400000, 'reinforce')
        .target.id,
    ).toBe(water.id);
  });
  it('a due word returns inside a safe known sentence while preserving the word schedule', () => {
    const { state } = journey('speech', 30);
    const review = retrievalForMemory(catalog, water, state, now + DAY, 'due');
    expect(review.target.family).not.toBe('lexicalConcepts');
    expect(review.memoryConceptIds).toContain(water.id);
    const result = replay(catalog, [
      ...state.events,
      {
        id: 'context-review',
        sessionId: 'later',
        sequence: 9999,
        at: now + DAY + 10000,
        type: 'activity_answered',
        conceptId: review.target.id,
        dimension: 'contextual_response',
        evidence: 'independent',
        inputMode: 'speech',
        memoryConceptIds: review.memoryConceptIds,
        reviewPurpose: 'due',
      },
    ]);
    expect(result.concepts[water.id]?.dueAt).toBeGreaterThan(now + DAY);
    expect(
      result.concepts[water.id]?.dimensions.delayed_recall,
    ).toBeGreaterThan(0);
  });
  it('skip and recognition problems never lower mastery or count as failure', () => {
    const { state } = journey('speech', 3);
    const before = state.concepts[water.id]!;
    const updated = replay(catalog, [
      ...state.events,
      {
        id: 'skip',
        sessionId: 's',
        sequence: 9999,
        at: now,
        type: 'activity_skipped',
        conceptId: water.id,
      },
      {
        id: 'no-speech',
        sessionId: 's',
        sequence: 10000,
        at: now,
        type: 'speech_verification_pending',
        conceptId: water.id,
        speechVerificationPending: true,
      },
    ]);
    expect(updated.concepts[water.id]?.dimensions).toEqual(before.dimensions);
    expect(updated.concepts[water.id]?.failures).toBe(before.failures);
    expect(updated.concepts[water.id]?.dueAt).toBe(before.dueAt);
  });
});
