import type { Catalog, ContentItem } from '../content/types.js';
import type { LearnerState } from '../events/types.js';
import { readyToCombine } from '../dependencies/dependencies.js';
import type { Activity } from './planner.js';
import { selectRetrievalActivity } from './modality.js';
const positive = (e: LearnerState['events'][number]) =>
  ['independent', 'hesitant', 'hinted'].includes(e.evidence ?? '');
export function practiceProfile(
  state: LearnerState,
  id: string,
  sessionId?: string,
) {
  const events = state.events.filter(
    (e) => e.conceptId === id && (!sessionId || e.sessionId === sessionId),
  );
  const answers = events.filter((e) => e.type === 'activity_answered');
  return {
    exposures: events.filter((e) => e.type === 'concept_exposed').length,
    successfulRecall: answers.filter(
      (e) =>
        positive(e) &&
        [
          'independent_recall',
          'spoken_production',
          'contextual_response',
        ].includes(e.dimension ?? ''),
    ).length,
    failures: answers.filter((e) => e.evidence === 'incorrect').length,
    activityFamilies: [
      ...new Set(answers.map((e) => e.activityType).filter(Boolean)),
    ],
    lastAt: answers.at(-1)?.at,
    latest: answers.at(-1),
  };
}
export function knowledgeDepth(
  catalog: Catalog,
  state: LearnerState,
  id: string,
): number {
  const c = state.concepts[id];
  if (!c) return 0;
  let depth = 1;
  if (
    Math.max(
      c.dimensions.listening_recognition ?? 0,
      c.dimensions.meaning_recognition ?? 0,
    ) >= 0.25
  )
    depth = 2;
  if (
    Math.max(
      c.dimensions.independent_recall ?? 0,
      c.dimensions.spoken_production ?? 0,
    ) >= 0.25
  )
    depth = 3;
  const uses = state.events.filter(
    (e) =>
      positive(e) &&
      e.type === 'activity_answered' &&
      catalog.items[e.conceptId ?? '']?.dependencies.includes(id),
  );
  const sentences = uses.filter(
    (e) => catalog.items[e.conceptId ?? '']?.family === 'sentenceBank',
  );
  if (sentences.length) depth = Math.max(depth, 4);
  if (new Set(sentences.map((e) => e.conceptId)).size > 1)
    depth = Math.max(depth, 5);
  if (uses.some((e) => e.dimension === 'contextual_response'))
    depth = Math.max(depth, 6);
  if (
    uses.some((e) => catalog.items[e.conceptId ?? '']?.family === 'dialogues')
  )
    depth = Math.max(depth, 7);
  if (uses.some((e) => e.dimension === 'transfer_to_unseen_context')) depth = 8;
  return depth;
}
export function shouldSuppressActivity(
  catalog: Catalog,
  state: LearnerState,
  activity: Activity,
  sessionId?: string,
): boolean {
  const item = catalog.items[activity.conceptId];
  if (
    item?.family !== 'lexicalConcepts' ||
    activity.phase === 'exposure' ||
    activity.reviewPurpose === 'due'
  )
    return false;
  const profile = practiceProfile(state, item.id, sessionId);
  const latest = state.events
    .filter((e) => e.conceptId === item.id && e.type === 'activity_answered')
    .at(-1);
  return (
    profile.successfulRecall > 0 &&
    !!latest &&
    positive(latest) &&
    knowledgeDepth(catalog, state, item.id) >= 3
  );
}
export function retrievalForMemory(
  catalog: Catalog,
  item: ContentItem,
  state: LearnerState,
  now: number,
  purpose: 'due' | 'reinforce',
) {
  const recent = state.events
    .filter((e) => e.conceptId === item.id && e.type === 'activity_answered')
    .at(-1);
  const canExpand =
    knowledgeDepth(catalog, state, item.id) >= 3 &&
    recent?.evidence !== 'incorrect';
  const candidates = canExpand
    ? Object.values(catalog.items).filter(
        (i) =>
          i.id !== item.id &&
          i.dependencies.includes(item.id) &&
          state.concepts[i.id] &&
          i.productionReady &&
          readyToCombine(i, state, now, catalog),
      )
    : [];
  candidates.sort((a, b) => {
    const recentCost = (i: ContentItem) =>
      state.events
        .slice(-12)
        .filter((e) => e.conceptId === i.id && e.type === 'activity_answered')
        .length;
    return (
      recentCost(a) - recentCost(b) ||
      Number(b.family === 'dialogues') - Number(a.family === 'dialogues')
    );
  });
  const target = candidates[0] ?? item;
  const selected = selectRetrievalActivity(
    catalog,
    target,
    state,
    target !== item ? 'recall' : purpose,
  );
  return {
    target,
    selected,
    memoryConceptIds: target !== item ? [item.id] : [],
  };
}
