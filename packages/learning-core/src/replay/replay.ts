import type { Catalog } from '../content/types.js';
import type {
  ConceptState,
  LearningEvent,
  LearnerState,
} from '../events/types.js';
import { applyEvidence } from '../mastery/mastery.js';
import { schedule, DAY } from '../srs/srs.js';
import { progression } from '../progression/progression.js';
export function replay(catalog: Catalog, input: LearningEvent[]): LearnerState {
  const concepts: Record<string, ConceptState> = {};
  const seen = new Set<string>();
  const events = [...input]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  for (const event of events) {
    if (!event.conceptId) continue;
    const id = event.conceptId;
    if (event.type === 'concept_exposed' && !concepts[id])
      concepts[id] = {
        introducedAt: event.at,
        lastAt: event.at,
        dueAt: event.at,
        milestone: 0,
        reinforcement: 0,
        failures: 0,
        attempts: 0,
        dimensions: {},
        contexts: [],
      };
    const state = concepts[id];
    if (
      !state ||
      event.type !== 'activity_answered' ||
      !event.dimension ||
      !event.evidence
    )
      continue;
    state.attempts++;
    state.lastAt = event.at;
    if (
      event.evidence === 'incorrect' &&
      !['written_production', 'reading_recognition'].includes(event.dimension)
    )
      state.failures++;
    state.dimensions = applyEvidence(state, event.dimension, event.evidence);
    const oral =
      event.dimension === 'spoken_production' ||
      (event.inputMode === 'speech' &&
        (event.dimension === 'contextual_response' ||
          event.evaluationSkill === 'speaking' ||
          event.evaluationSkill === 'contextual_response'));
    if (oral) {
      if (event.dimension !== 'spoken_production')
        state.dimensions = applyEvidence(
          state,
          'spoken_production',
          event.evidence,
        );
      state.dimensions = applyEvidence(
        state,
        'independent_recall',
        event.evidence,
      );
    }
    if (
      event.evidence === 'independent' &&
      event.at - state.introducedAt >= DAY &&
      (oral ||
        ['independent_recall', 'delayed_recall'].includes(event.dimension))
    )
      state.dimensions = applyEvidence(state, 'delayed_recall', 'independent');
    if (event.contextId && !state.contexts.includes(event.contextId))
      state.contexts.push(event.contextId);
    if (
      oral ||
      ['independent_recall', 'delayed_recall'].includes(event.dimension) ||
      (event.reviewPurpose &&
        (event.dimension !== 'written_production' ||
          event.evidence === 'independent'))
    )
      Object.assign(
        state,
        schedule(
          state,
          ['listening_recognition', 'reading_recognition'].includes(
            event.dimension,
          ) && event.evidence === 'independent'
            ? 'hesitant'
            : event.evidence,
          event.at,
          catalog.master.srsPolicy.delayedRecallMilestoneDays as number[],
          catalog.master.srsPolicy.sameSessionReinforcementMinutes as number[],
        ),
      );
  }
  const p = progression(catalog, events);
  return { concepts, events, level: p.level, completedC2: p.completedC2 };
}
