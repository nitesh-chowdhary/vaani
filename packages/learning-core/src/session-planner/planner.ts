import { retrievalForMemory, knowledgeDepth } from './practice.js';
import {
  levels,
  type Catalog,
  type ContentItem,
  type Level,
} from '../content/types.js';
import type {
  Dimension,
  LearnerState,
  LearningEvent,
} from '../events/types.js';
import {
  instructionalState,
  mayInfer,
  readyToCombine,
} from '../dependencies/dependencies.js';

import {
  intentFor,
  dimensionForIntent,
  selectRetrievalActivity,
  type ActivityIntent,
} from './modality.js';

export interface Activity {
  id: string;
  conceptId: string;
  type: string;
  phase: 'exposure' | 'practice' | 'review' | 'assessment';
  dimension: Dimension;
  prompt: string;
  intent?: ActivityIntent;
  reviewPurpose?: 'due' | 'reinforcement';
  memoryConceptIds?: string[];
  sourceExerciseId?: string;
  contextId?: string;
  mediaCueId?: string;
  choiceIds?: string[];
  choiceMode?: 'telugu' | 'media';
}
export interface Plan {
  allowance: number;
  activities: Activity[];
  level: Level;
  nominalMinutes: number;
}

export function allowance(
  state: LearnerState,
  now: number,
  minutes = 60,
): number {
  const recent = state.events
    .filter(
      (event) =>
        event.type === 'activity_answered' &&
        event.evidence !== 'unverified' &&
        !['written_production', 'reading_recognition'].includes(
          event.dimension ?? '',
        ),
    )
    .slice(-100);
  const rate = (events: LearningEvent[]) =>
    events.length
      ? events.filter((event) => event.evidence === 'independent').length /
        events.length
      : recent.length
        ? recent.filter((event) => event.evidence === 'independent').length /
          recent.length
        : 0.85;
  const recall = recent.filter((event) =>
    [
      'independent_recall',
      'delayed_recall',
      'spoken_production',
      'contextual_response',
    ].includes(event.dimension ?? ''),
  );
  const score = Math.min(
    rate(recall),
    rate(recent.filter((event) => event.dimension === 'delayed_recall')),
    (rate(recent) +
      rate(
        recent.filter((event) => event.dimension === 'listening_recognition'),
      ) +
      rate(recent.filter((event) => event.dimension === 'spoken_production'))) /
      3,
  );
  let target =
    recent.length === 0
      ? 60
      : score >= 0.9
        ? 70
        : score >= 0.8
          ? 50
          : score >= 0.7
            ? 35
            : 15;
  if (recent.length && !recall.length) target = Math.min(target, 35);
  const hinted = recent.filter(
    (event) => event.evidence === 'hinted' || (event.latencyMs ?? 0) > 20000,
  ).length;
  if (hinted > recent.length * 0.3) target = Math.min(target, 25);
  const due = Object.values(state.concepts).filter(
    (concept) => concept.dueAt <= now,
  ).length;
  if (due > 100) target = 0;
  else if (due > 40) target = Math.min(target, 15);
  return Math.max(0, Math.floor((target * minutes) / 60));
}

export const dimensionFor = (type: string): Dimension =>
  type === 'delayed_recall'
    ? 'delayed_recall'
    : dimensionForIntent(intentFor(type));
function addFactory(activities: Activity[]) {
  return (
    item: ContentItem,
    type: string,
    phase: Activity['phase'],
    options: Partial<Activity> = {},
  ) => {
    const intent = options.intent ?? intentFor(type);
    activities.push({
      id: `step-${activities.length + 1}`,
      conceptId: item.id,
      type,
      phase,
      intent,
      dimension: dimensionForIntent(intent),
      prompt: '',
      ...options,
    });
  };
}

function addReviews(
  catalog: Catalog,
  state: LearnerState,
  now: number,
  minutes: number,
  activities: Activity[],
): void {
  const add = addFactory(activities);
  const due = Object.entries(state.concepts)
    .filter(([id, concept]) => !!catalog.items[id] && concept.dueAt <= now)
    .sort((a, b) => a[1].dueAt - b[1].dueAt);
  for (const [id] of due.slice(0, Math.max(6, Math.round(minutes / 2)))) {
    const item = catalog.items[id]!;
    const { target, selected, memoryConceptIds } = retrievalForMemory(
      catalog,
      item,
      state,
      now,
      'due',
    );
    const existing = activities.find(
      (a) =>
        a.phase === 'review' &&
        a.conceptId === target.id &&
        a.type === selected.type,
    );
    if (existing)
      existing.memoryConceptIds = [
        ...new Set([...(existing.memoryConceptIds ?? []), ...memoryConceptIds]),
      ];
    else
      add(target, selected.type, 'review', {
        ...selected,
        memoryConceptIds,
        reviewPurpose: 'due',
      });
  }
  const weak = Object.entries(state.concepts)
    .filter(
      ([id, c]) =>
        !!catalog.items[id]?.telugu && instructionalState(c, now) === 'weak',
    )
    .slice(0, 8);
  for (const purpose of ['recognize', 'listen', 'recall'] as const)
    for (const [id] of weak) {
      const item = catalog.items[id]!;
      const selected = selectRetrievalActivity(catalog, item, state, purpose);
      add(item, selected.type, 'review', {
        ...selected,
        reviewPurpose: 'reinforcement',
      });
    }
}

/** Authored communication units, never generated target-language morphology. */
export interface CommunicationCluster {
  target: ContentItem;
  dependencies: ContentItem[];
  patternIds: string[];
  variations: ContentItem[];
}
export function communicationClusters(
  catalog: Catalog,
  state: LearnerState,
): CommunicationCluster[] {
  const eligible = catalog.order
    .map((id) => catalog.items[id]!)
    .filter(
      (item) =>
        item &&
        ['sentenceBank', 'dialogues', 'listeningScripts'].includes(
          item.family,
        ) &&
        item.productionReady &&
        item.dependencyComplete &&
        !item.unseen &&
        levels.indexOf(item.level) <= levels.indexOf(state.level),
    );
  return eligible.map((target) => {
    const visited = new Set<string>();
    const dependencies: ContentItem[] = [];
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const item = catalog.items[id];
      if (!item) return;
      item.dependencies.forEach(visit);
      dependencies.push(item);
    };
    target.dependencies
      .slice()
      .sort(
        (a, b) =>
          Number(!!catalog.items[b]?.media) - Number(!!catalog.items[a]?.media),
      )
      .forEach(visit);
    const patternIds = dependencies
      .filter((i) => i.family === 'grammarInUse')
      .map((i) => i.id);
    return {
      target,
      dependencies,
      patternIds,
      variations: eligible.filter(
        (other) =>
          other.id !== target.id &&
          other.family === 'sentenceBank' &&
          patternIds.some((id) => other.dependencies.includes(id)),
      ),
    };
  });
}
function buildCommunicationPlan(
  catalog: Catalog,
  state: LearnerState,
  now: number,
  minutes: number,
): Plan {
  const budget = allowance(state, now, minutes);
  const activities: Activity[] = [];
  const add = addFactory(activities);
  addReviews(catalog, state, now, minutes, activities);
  const known = new Set(Object.keys(state.concepts));
  const rehearsed = new Set<string>();
  let spent = 0;
  const clusters = communicationClusters(catalog, state);
  const remaining = new Set(clusters);
  const usedFunctions = new Set(
    Object.keys(state.concepts)
      .map((id) => catalog.items[id]?.raw.function)
      .filter((f) => typeof f === 'string'),
  );
  while (remaining.size) {
    const cost = (c: CommunicationCluster) =>
      c.dependencies.filter(
        (i) => i.family === 'lexicalConcepts' && !known.has(i.id),
      ).length;
    const lastFunction = [...activities]
      .reverse()
      .find((a) => a.type === 'combination_introduction')?.conceptId;
    const previousFunction = lastFunction
      ? catalog.items[lastFunction]?.raw.function
      : undefined;
    const score = (c: CommunicationCluster) => {
      const fn = c.target.raw.function;
      return (
        cost(c) -
        (c.target.family === 'dialogues' &&
        c.dependencies.some((i) => known.has(i.id))
          ? 3
          : 0) -
        (typeof fn === 'string' && !usedFunctions.has(fn) && known.size
          ? 1.5
          : 0) +
        (fn && fn === previousFunction ? 0.75 : 0)
      );
    };
    const next = [...remaining]
      .filter((c) => spent + cost(c) <= budget)
      .sort(
        (a, b) =>
          Number(known.has(a.target.id)) - Number(known.has(b.target.id)) ||
          score(a) - score(b) ||
          catalog.order.indexOf(a.target.id) -
            catalog.order.indexOf(b.target.id),
      )[0];
    if (!next) break;
    remaining.delete(next);
    const { target, dependencies } = next;
    // Review carries already learned targets; reserve fresh clusters for communication.
    if (known.has(target.id)) continue;
    for (const dependency of dependencies) {
      if (!known.has(dependency.id)) {
        add(dependency, 'concept_introduction', 'exposure');
        known.add(dependency.id);
        if (dependency.family === 'lexicalConcepts') spent++;
      }
      if (rehearsed.has(dependency.id)) continue;
      const dimensions = state.concepts[dependency.id]?.dimensions;
      if (dependency.family === 'lexicalConcepts') {
        if ((dimensions?.listening_recognition ?? 0) < 0.25) {
          const selected = selectRetrievalActivity(
            catalog,
            dependency,
            state,
            'listen',
            known,
          );
          add(dependency, selected.type, 'practice', selected);
        }
        if ((dimensions?.spoken_production ?? 0) < 0.2) {
          const selected = selectRetrievalActivity(
            catalog,
            dependency,
            state,
            'recall',
            known,
          );
          add(dependency, selected.type, 'practice', selected);
        }
      } else {
        // Pattern recognition establishes a reusable frame; never pronounce blanks.
        const selected = selectRetrievalActivity(
          catalog,
          dependency,
          state,
          'recognize',
          known,
        );
        add(dependency, selected.type, 'practice', selected);
      }
      rehearsed.add(dependency.id);
    }
    add(target, 'combination_introduction', 'exposure');
    known.add(target.id);
    if (typeof target.raw.function === 'string')
      usedFunctions.add(target.raw.function);
    const listening = selectRetrievalActivity(
      catalog,
      target,
      state,
      'listen',
      known,
    );
    add(target, listening.type, 'practice', listening);
    if (target.family !== 'dialogues') add(target, 'shadow', 'practice');
    if (target.family === 'sentenceBank')
      add(target, 'sentence_construction', 'practice');
    const oral = selectRetrievalActivity(
      catalog,
      target,
      state,
      'recall',
      known,
    );
    if (target.family === 'dialogues') add(target, 'roleplay_b', 'practice');
    else add(target, oral.type, 'practice', oral);
  }
  return {
    allowance: budget,
    activities,
    level: state.level,
    nominalMinutes: minutes,
  };
}

export function buildPlan(
  catalog: Catalog,
  state: LearnerState,
  now: number,
  minutes = 60,
): Plan {
  return buildCommunicationPlan(catalog, state, now, minutes);
}

export function nextReinforcement(
  catalog: Catalog,
  state: LearnerState,
  now: number,
  sessionId: string,
  completed: Set<string>,
): Activity | undefined {
  const due = Object.entries(state.concepts)
    .filter(
      ([id, concept]) =>
        concept.dueAt <= now &&
        concept.reinforcement > 0 &&
        concept.reinforcement < 5 &&
        now - concept.introducedAt < 3600000 &&
        catalog.items[id]?.productionReady,
    )
    .sort((a, b) => a[1].dueAt - b[1].dueAt);
  for (const [id, concept] of due) {
    const activityId = `reinforce-${sessionId}-${id}-${concept.reinforcement}-${concept.dueAt}`;
    if (!completed.has(activityId)) {
      const { target, selected, memoryConceptIds } = retrievalForMemory(
        catalog,
        catalog.items[id]!,
        state,
        now,
        'reinforce',
      );
      const latest = state.events
        .filter((e) => e.conceptId === id && e.type === 'activity_answered')
        .at(-1);
      if (
        target.id === id &&
        catalog.items[id]?.family === 'lexicalConcepts' &&
        knowledgeDepth(catalog, state, id) >= 3 &&
        ['independent', 'hesitant', 'hinted'].includes(latest?.evidence ?? '')
      )
        continue;
      return {
        id: activityId,
        conceptId: target.id,
        memoryConceptIds,
        ...selected,
        phase: 'review',
        dimension: dimensionForIntent(selected.intent),
        prompt: '',
        reviewPurpose: 'reinforcement',
      };
    }
  }
  return undefined;
}

export function allowedActivity(
  catalog: Catalog,
  state: LearnerState,
  activity: Activity,
  now = Date.now(),
): boolean {
  const item = catalog.items[activity.conceptId];
  if (!item) return false;
  if (
    mayInfer(
      {
        ...item,
        explicitInference:
          !!activity.sourceExerciseId &&
          catalog.items[activity.sourceExerciseId]?.raw
            .requiresExplainedSource === false,
      },
      activity.type,
    )
  )
    return true;
  if (activity.phase === 'exposure')
    return (
      item.family === 'lexicalConcepts' ||
      (item.family === 'grammarInUse'
        ? item.dependencies.every((id) => !!state.concepts[id])
        : readyToCombine(item, state, now, catalog))
    );
  return (
    !!state.concepts[item.id] &&
    item.dependencies.every((id) => !!state.concepts[id]) &&
    (item.family === 'lexicalConcepts' ||
      item.family === 'grammarInUse' ||
      readyToCombine(item, state, now, catalog)) &&
    (activity.choiceIds ?? []).every(
      (id) =>
        !!state.concepts[id] &&
        !!catalog.items[id] &&
        catalog.items[id]!.dependencies.every((dep) => !!state.concepts[dep]),
    )
  );
}
