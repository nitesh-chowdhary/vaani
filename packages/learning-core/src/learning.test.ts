import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  buildCatalog,
  validateMaster,
  localized,
  resolveConcept,
  resolveGloss,
  replay,
  allowance,
  buildPlan,
  schedule,
  nextInterval,
  DAY,
  applyEvidence,
  progression,
  allowedActivity,
  mayInfer,
  instructionalState,
  readyToCombine,
  type LearningEvent,
  type ConceptState,
  type Master,
  type Activity,
} from './index.js';
const master = JSON.parse(
  readFileSync(
    new URL('../../../VAANI_TELUGU_A0_C2_FINAL_MASTER.json', import.meta.url),
    'utf8',
  ),
) as Master;
const catalog = buildCatalog(master);
const now = 1700000000000;
const empty = replay(catalog, []);
const concept = (overrides: Partial<ConceptState> = {}): ConceptState => ({
  introducedAt: now,
  lastAt: now,
  dueAt: now,
  milestone: 0,
  reinforcement: 0,
  failures: 0,
  attempts: 0,
  dimensions: {},
  contexts: [],
  ...overrides,
});
const event = (overrides: Partial<LearningEvent> = {}): LearningEvent => ({
  id: 'event-1',
  sessionId: 'session-1',
  sequence: 1,
  at: now,
  type: 'concept_exposed',
  conceptId: 'te.lex.i',
  ...overrides,
});
const evidence = (kind: LearningEvent['evidence'], count = 20) =>
  Array.from({ length: count }, (_, i) =>
    event({
      id: `event-${i}`,
      sequence: i + 1,
      type: 'activity_answered',
      dimension: [
        'independent_recall',
        'spoken_production',
        'listening_recognition',
        'delayed_recall',
      ][i % 4] as LearningEvent['dimension'],
      evidence: kind,
    }),
  );
describe('canonical content', () => {
  it('validates the complete master and preserves all 67 sections', () => {
    expect(validateMaster(master)).toBe(master);
    expect(Object.keys(catalog.sections)).toHaveLength(67);
    expect(catalog.sections).toEqual(master);
    expect(catalog.counts.exerciseInstances).toBe(18926);
  });
  it('rejects duplicate stable/exercise IDs', () => {
    const bad = structuredClone(master);
    bad.exerciseInstances.push(bad.exerciseInstances[0]);
    expect(() => validateMaster(bad)).toThrow('Duplicate ID');
  });
  it.each(['telugu', 'romanization', 'meaning'])(
    'rejects missing lexical %s',
    (key) => {
      const bad = structuredClone(master);
      delete bad.lexicalConcepts[0][key];
      expect(() => validateMaster(bad)).toThrow();
    },
  );
  it('rejects broken references and dependencies', () => {
    const bad = structuredClone(master);
    bad.exerciseInstances[0].sourceSentenceId = 'missing';
    bad.lexicalConcepts[0].dependencies = ['missing'];
    expect(() => validateMaster(bad)).toThrow('Invalid reference');
  });
  it('rejects dependency cycles', () => {
    const bad = structuredClone(master);
    bad.lexicalConcepts[0].dependencies = [bad.lexicalConcepts[1].id];
    bad.lexicalConcepts[1].dependencies = [bad.lexicalConcepts[0].id];
    expect(() => validateMaster(bad)).toThrow('Dependency cycle');
  });
  it('rejects invalid levels and missing course sections', () => {
    const bad = structuredClone(master);
    bad.lexicalConcepts[0].level = 'Z9' as never;
    delete bad.regionalComprehension;
    expect(() => validateMaster(bad)).toThrow();
  });
  it('resolves IDs and language-keyed glosses independently from text', () => {
    const item = resolveConcept(catalog, 'te.lex.i');
    expect(localized({ ...item.meaning, hi: 'मैं' }, 'hi')).toBe('मैं');
    expect(resolveGloss(catalog, item.id)?.meaning.en).toBe('I');
    expect(() => resolveConcept(catalog, 'unknown')).toThrow();
  });
  it('preserves quality flags and withholds records without authored context', () => {
    expect(catalog.warnings.length).toBeGreaterThan(0);
    expect(
      Object.values(catalog.items).some(
        (i) => i.reviewStatus === 'generated_needs_native_review',
      ),
    ).toBe(true);
    const missing = Object.values(catalog.items).find(
      (i) => i.family === 'lexicalConcepts' && !i.context,
    )!;
    expect(missing.raw).toBeTruthy();
    expect(missing.productionReady).toBe(false);
  });
});
describe('dependencies and session sequencing', () => {
  it('keeps a zero-knowledge first 20 activities safe and teaches words before combinations', () => {
    const plan = buildPlan(catalog, empty, now, 60);
    expect(plan.activities.length).toBeGreaterThan(30);
    let state = empty;
    let sequence = 0;
    for (const activity of plan.activities.slice(0, 20)) {
      expect(
        allowedActivity(catalog, state, activity, now + sequence),
        `${activity.type} ${activity.conceptId}`,
      ).toBe(true);
      for (const choiceId of activity.choiceIds ?? [])
        expect(
          state.concepts[choiceId],
          `unintroduced choice ${choiceId}`,
        ).toBeTruthy();
      if (activity.phase === 'exposure')
        state = replay(catalog, [
          ...state.events,
          event({
            id: `flow-${++sequence}`,
            sequence,
            type: 'concept_exposed',
            at: now + sequence,
            conceptId: activity.conceptId,
          }),
        ]);
      else
        state = replay(catalog, [
          ...state.events,
          event({
            id: `flow-${++sequence}`,
            sequence,
            type: 'activity_answered',
            at: now + sequence,
            conceptId: activity.conceptId,
            activityId: activity.id,
            inputMode:
              activity.intent?.response === 'speak' ? 'speech' : 'text',
            dimension: activity.dimension,
            evidence: 'independent',
          }),
        ]);
    }
    const first = plan.activities.slice(0, 20);
    expect(first[0]?.type).toBe('concept_introduction');
    expect(first[0]?.conceptId).toBe('te.lex.water');
    expect(
      first.findIndex((a) => a.type === 'combination_introduction'),
    ).toBeGreaterThan(
      first.findIndex(
        (a) => a.conceptId === 'g01' && a.type === 'context_recognition',
      ),
    );
    expect(first.filter((a) => a.type === 'spoken_recall')[0]?.conceptId).toBe(
      'te.lex.water',
    );
    expect(
      first
        .filter((a) => a.phase === 'exposure')
        .every(
          (a) =>
            catalog.items[a.conceptId]?.meaning.en &&
            catalog.items[a.conceptId]?.romanization,
        ),
    ).toBe(true);
    expect(
      first.every(
        (activity, index) =>
          index === 0 ||
          activity.conceptId !== first[index - 1]?.conceptId ||
          activity.type !== first[index - 1]?.type,
      ),
    ).toBe(true);
  });
  it('uses stable real photographs for concrete opening concepts and no emoji learning fallback', () => {
    for (const id of [
      'te.lex.water',
      'te.lex.tea',
      'te.lex.coffee',
      'te.lex.rice-food',
    ]) {
      const media = catalog.items[id]?.media;
      expect(media?.url).toMatch(/^\/media\/telugu\/beginner\/.+\.jpg$/);
      expect(media?.source).toBe('local');
      expect(media?.attribution?.sourceUrl).toContain('unsplash.com/photos/');
      expect(media?.fallback).toMatch(/\.svg$/);
      expect(media?.fallback).not.toContain('💧');
    }
  });
  it('does not expose an authored context sentence during the first word introduction', () => {
    const water = catalog.items['te.lex.water']!;
    expect(water.meaning.en).toBe('water');
    expect(water.romanization).toBe('neellu');
    expect(water.media?.url).toBeTruthy();
    expect(water.context).toBeTruthy();
    const plan = buildPlan(catalog, empty, now, 5);
    expect(plan.activities[0]?.conceptId).toBe(water.id);
    expect(plan.activities[0]?.type).toBe('concept_introduction');
  });
  it('gates authored sentence combinations on recognized prerequisites and retains explicit dependency IDs', () => {
    const sentence = catalog.items['te.sent.00001']!;
    expect(sentence.dependencies).toEqual(
      expect.arrayContaining(['te.lex.water', 'te.lex.want-need', 'g01']),
    );
    expect(sentence.dependencyComplete).toBe(true);
    expect(readyToCombine(sentence, empty, now)).toBe(false);
    const known = replay(catalog, [
      event({ id: 'water', sequence: 1, conceptId: 'te.lex.water' }),
      event({
        id: 'water-recognized',
        sequence: 2,
        type: 'activity_answered',
        conceptId: 'te.lex.water',
        dimension: 'meaning_recognition',
        evidence: 'independent',
      }),
      event({ id: 'want', sequence: 3, conceptId: 'te.lex.want-need' }),
      event({
        id: 'want-recognized',
        sequence: 4,
        type: 'activity_answered',
        conceptId: 'te.lex.want-need',
        dimension: 'meaning_recognition',
        evidence: 'independent',
      }),
      event({ id: 'pattern', sequence: 5, conceptId: 'g01' }),
      event({
        id: 'pattern-recognized',
        sequence: 6,
        type: 'activity_answered',
        conceptId: 'g01',
        dimension: 'meaning_recognition',
        evidence: 'independent',
      }),
    ]);
    for (const id of ['te.lex.water', 'te.lex.want-need']) {
      known.concepts[id].dimensions.listening_recognition = 1;
      known.concepts[id].dimensions.spoken_production = 1;
    }
    expect(readyToCombine(sentence, known, now)).toBe(true);
    expect(
      allowedActivity(
        catalog,
        known,
        {
          id: 'sentence',
          conceptId: sentence.id,
          type: 'combination_introduction',
          phase: 'exposure',
          dimension: 'sentence_construction',
          prompt: '',
        },
        now,
      ),
    ).toBe(true);
  });
  it('tracks unseen, introduced, recognized, recalled, spoken, weak, and due instructional states', () => {
    expect(instructionalState(undefined, now)).toBe('unseen');
    expect(instructionalState(concept(), now)).toBe('just_introduced');
    expect(
      instructionalState(
        concept({ dimensions: { meaning_recognition: 0.4 } }),
        now,
      ),
    ).toBe('recognized');
    expect(
      instructionalState(
        concept({ dimensions: { independent_recall: 0.4 } }),
        now,
      ),
    ).toBe('recalled');
    expect(
      instructionalState(
        concept({ dimensions: { spoken_production: 0.4 } }),
        now,
      ),
    ).toBe('spoken');
    expect(instructionalState(concept({ failures: 1, attempts: 1 }), now)).toBe(
      'weak',
    );
    expect(
      instructionalState(concept({ dueAt: now - 1, reinforcement: 1 }), now),
    ).toBe('due_for_reinforcement');
  });
  it('reintroduces weak concepts between new material and maintains performance pacing without a daily cap', () => {
    const water = concept({ failures: 2, attempts: 2, dueAt: now + DAY });
    const state = {
      ...empty,
      concepts: { 'te.lex.water': water },
      events: evidence('incorrect', 10),
    };
    const weakPlan = buildPlan(catalog, state, now, 60);
    expect(allowance(state, now)).toBeLessThan(
      allowance({ ...empty, events: evidence('independent') }, now),
    );
    expect(
      weakPlan.activities.filter(
        (a) => a.conceptId === 'te.lex.water' && a.phase === 'review',
      ).length,
    ).toBeGreaterThan(1);
    expect(
      allowance({ ...empty, events: evidence('independent') }, now, 120),
    ).toBe(140);
  });
  it('known concepts can be reused, unknown concepts cannot', () => {
    const a: Activity = {
      id: 'a',
      conceptId: 'te.lex.i',
      type: 'meaning_recall',
      phase: 'practice',
      dimension: 'independent_recall',
      prompt: '',
    };
    expect(allowedActivity(catalog, empty, a)).toBe(false);
    expect(allowedActivity(catalog, replay(catalog, [event()]), a)).toBe(true);
  });
  it('advanced inference requires explicit permission and never applies to beginners', () => {
    const i = catalog.items['te.lex.i'];
    expect(
      mayInfer({ ...i, level: 'B1', explicitInference: true }, 'inference'),
    ).toBe(true);
    expect(
      mayInfer({ ...i, level: 'B1', explicitInference: false }, 'inference'),
    ).toBe(false);
    expect(mayInfer({ ...i, explicitInference: true }, 'inference')).toBe(
      false,
    );
  });
  it('prioritizes due reviews', () => {
    const state = {
      ...empty,
      concepts: { 'te.lex.i': concept({ dueAt: now - 1 }) },
    };
    expect(buildPlan(catalog, state, now, 5).activities[0].phase).toBe(
      'review',
    );
  });
  it('strong performance increases new content; weak performance reduces it', () => {
    const strong = { ...empty, events: evidence('independent') };
    const weak = { ...empty, events: evidence('incorrect') };
    expect(allowance(strong, now)).toBe(70);
    expect(allowance(weak, now)).toBeLessThan(allowance(empty, now));
  });
  it('review backlog lowers or suspends new introductions', () => {
    const concepts = Object.fromEntries(
      Array.from({ length: 110 }, (_, i) => [`c${i}`, concept()]),
    );
    expect(allowance({ ...empty, concepts }, now)).toBe(0);
  });
  it('has no 60-word daily cap and later same-day sessions introduce new material', () => {
    const p1 = buildPlan(catalog, empty, now, 5);
    const exposed = p1.activities
      .filter((a) => a.phase === 'exposure')
      .map((a, i) =>
        event({ id: `e${i}`, sequence: i + 1, conceptId: a.conceptId }),
      );
    const state = replay(catalog, exposed);
    const p2 = buildPlan(catalog, state, now + 3600000, 5);
    expect(
      p2.activities.some(
        (a) => a.phase === 'exposure' && !state.concepts[a.conceptId],
      ),
    ).toBe(true);
    const s3 = replay(catalog, [
      ...exposed,
      ...p2.activities
        .filter((a) => a.phase === 'exposure')
        .map((a, i) =>
          event({
            id: `n${i}`,
            sequence: exposed.length + i + 1,
            conceptId: a.conceptId,
          }),
        ),
    ]);
    expect(
      buildPlan(catalog, s3, now + 7200000, 5).activities.some(
        (a) => a.phase === 'exposure' && !s3.concepts[a.conceptId],
      ),
    ).toBe(true);
    expect(
      allowance({ ...empty, events: evidence('independent') }, now, 120),
    ).toBe(140);
  });
});
describe('SRS and mastery replay', () => {
  const days = master.srsPolicy.delayedRecallMilestoneDays as number[];
  const same = master.srsPolicy.sameSessionReinforcementMinutes as number[];
  it('uses the same-session 0/4/12/25/45 schedule without advancing early', () => {
    const c = concept();
    for (const minute of [0, 4, 12, 25]) {
      Object.assign(
        c,
        schedule(c, 'independent', now + minute * 60000, days, same),
      );
      expect(c.dueAt).toBe(now + same[c.reinforcement] * 60000);
    }
    expect(schedule(c, 'independent', now + 260000, days, same).dueAt).toBe(
      c.dueAt,
    );
    Object.assign(c, schedule(c, 'independent', now + 45 * 60000, days, same));
    expect(c.dueAt).toBe(now + DAY);
  });
  it('includes all delayed milestones and continues after day 365 indefinitely', () => {
    expect(days).toEqual([1, 2, 3, 5, 7, 14, 30, 60, 120, 240, 365]);
    expect(nextInterval(11, days)).toBeGreaterThan(365 * DAY);
    expect(nextInterval(20, days)).toBeGreaterThan(nextInterval(19, days));
  });
  it('failed or hinted answers shorten review and provide weaker evidence', () => {
    const c = concept({
      dueAt: now + 30 * DAY,
      milestone: 6,
      reinforcement: 5,
    });
    expect(schedule(c, 'incorrect', now, days, same).dueAt).toBe(now + 240000);
    expect(schedule(c, 'hinted', now, days, same).dueAt).toBeLessThan(c.dueAt);
    expect(
      applyEvidence(c, 'independent_recall', 'hinted').independent_recall,
    ).toBeLessThan(
      applyEvidence(c, 'independent_recall', 'independent').independent_recall!,
    );
  });
  it('keeps recognition separate from speech and rewards delayed recall and transfer', () => {
    const a = event();
    const result = replay(catalog, [
      a,
      event({
        id: 'answer',
        sequence: 2,
        type: 'activity_answered',
        dimension: 'meaning_recognition',
        evidence: 'independent',
      }),
      event({
        id: 'later',
        sequence: 3,
        at: now + 2 * DAY,
        type: 'activity_answered',
        dimension: 'independent_recall',
        evidence: 'independent',
      }),
    ]);
    expect(
      result.concepts[a.conceptId!].dimensions.spoken_production,
    ).toBeUndefined();
    expect(result.concepts[a.conceptId!].dimensions.delayed_recall).toBe(1);
    expect(
      applyEvidence(concept(), 'transfer_to_unseen_context', 'independent')
        .transfer_to_unseen_context,
    ).toBeGreaterThan(
      applyEvidence(concept(), 'meaning_recognition', 'independent')
        .meaning_recognition!,
    );
  });
  it('replay is deterministic and duplicate events do not inflate progress', () => {
    const e = event();
    expect(replay(catalog, [e, e])).toEqual(replay(catalog, [e]));
  });
});
describe('continuous proficiency progression', () => {
  function reviews(level: LearningEvent['level'], offset: number) {
    return [0, 1].map((i) =>
      event({
        id: `${level}-${i}`,
        sequence: offset + i,
        type: 'assessment_reviewed',
        level,
        at: now + i * DAY,
        assessmentId: `${level}-unseen-${i}`,
        verified: true,
        unseen: true,
        evidence: 'independent',
        capabilities: master.levelExitCapabilities[level!] as string[],
      }),
    );
  }
  it('screen/unit completion and vocabulary counts cannot award proficiency', () => {
    expect(progression(catalog, evidence('independent', 200)).level).toBe('A0');
  });
  it('automatically progresses across checkpoints using repeated capability evidence', () => {
    const events: LearningEvent[] = [];
    for (const level of ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'] as const) {
      events.push(...reviews(level, events.length + 1));
    }
    expect(progression(catalog, events).level).toBe('C2');
    expect(progression(catalog, events).completedC2).toBe(false);
  });
  it('C2 needs unseen detailed capabilities, not just a level label', () => {
    const events: LearningEvent[] = [];
    for (const level of ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const)
      events.push(...reviews(level, events.length + 1));
    expect(progression(catalog, events).completedC2).toBe(false);
    const criteria = (
      master.c2ExitCriteriaDetailed as {
        mustDemonstrateRepeatedlyOnUnseenMaterial: string[];
      }
    ).mustDemonstrateRepeatedlyOnUnseenMaterial;
    for (const e of events.filter((e) => e.level === 'C2'))
      e.capabilities!.push(...criteria);
    expect(progression(catalog, events).completedC2).toBe(true);
    expect(
      progression(
        catalog,
        events.map((e) => ({ ...e, unseen: false })),
      ).level,
    ).toBe('A0');
  });
});
