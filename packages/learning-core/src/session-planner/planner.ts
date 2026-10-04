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
  dependencyIntroductions,
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

const BEGINNER_PRIORITY = [
  'te.lex.water',
  'te.lex.tea',
  'te.lex.want-need',
  'te.lex.coffee',
  'te.lex.rice-food',
  'te.lex.food',
  'te.lex.milk',
  'te.lex.house',
  'te.lex.phone',
  'te.lex.bus',
  'te.lex.train',
  'te.lex.auto',
  'te.lex.car',
  'te.lex.ticket',
  'te.lex.station',
  'te.lex.doctor',
  'te.lex.hospital',
  'te.lex.medicine',
  'te.lex.mother',
  'te.lex.father',
];

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
        ? 0.65
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

function orderedBeginnerLexical(
  catalog: Catalog,
  state: LearnerState,
): ContentItem[] {
  const rank = new Map(BEGINNER_PRIORITY.map((id, index) => [id, index]));
  return Object.values(catalog.items)
    .filter(
      (item) =>
        item.family === 'lexicalConcepts' &&
        item.level === 'A0' &&
        item.telugu &&
        item.romanization &&
        item.meaning.en &&
        !state.concepts[item.id],
    )
    .sort(
      (a, b) =>
        (rank.get(a.id) ?? 1000) - (rank.get(b.id) ?? 1000) ||
        catalog.order.indexOf(a.id) - catalog.order.indexOf(b.id),
    );
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
    const selected = selectRetrievalActivity(catalog, item, state, 'due');
    add(item, selected.type, 'review', { ...selected, reviewPurpose: 'due' });
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

function buildBeginnerPlan(
  catalog: Catalog,
  state: LearnerState,
  now: number,
  minutes: number,
): Plan {
  const budget = allowance(state, now, minutes);
  const activities: Activity[] = [];
  const add = addFactory(activities);
  addReviews(catalog, state, now, minutes, activities);
  const fresh = orderedBeginnerLexical(catalog, state).slice(0, budget);
  const introduce = (item: ContentItem) =>
    add(item, 'concept_introduction', 'exposure');
  if (Object.keys(state.concepts).length === 0 && fresh.length >= 5) {
    const [water, tea, want, coffee, rice] = fresh;
    introduce(water!);
    introduce(tea!);
    add(water!, 'image_word_recognition', 'practice', {
      mediaCueId: water!.id,
      choiceIds: [water!.id, tea!.id],
      choiceMode: 'telugu',
    });
    introduce(want!);
    add(tea!, 'image_word_recognition', 'practice', {
      mediaCueId: tea!.id,
      choiceIds: [water!.id, tea!.id],
      choiceMode: 'telugu',
    });
    add(water!, 'audio_image_recognition', 'practice', {
      choiceIds: [water!.id, tea!.id],
      choiceMode: 'media',
    });
    introduce(coffee!);
    add(water!, 'image_recall', 'practice', { mediaCueId: water!.id });
    add(tea!, 'audio_image_recognition', 'practice', {
      choiceIds: [water!.id, tea!.id, coffee!.id],
      choiceMode: 'media',
    });
    add(water!, 'spoken_recall', 'practice', { mediaCueId: water!.id });
    add(want!, 'context_recognition', 'practice', {
      choiceIds: [want!.id, water!.id, tea!.id],
      choiceMode: 'telugu',
    });
    add(coffee!, 'image_word_recognition', 'practice', {
      mediaCueId: coffee!.id,
      choiceIds: [water!.id, tea!.id, coffee!.id],
      choiceMode: 'telugu',
    });
    add(tea!, 'image_recall', 'practice', { mediaCueId: tea!.id });
    add(want!, 'contextual_recall', 'practice');
    introduce(rice!);
    add(coffee!, 'image_recall', 'practice', { mediaCueId: coffee!.id });
    const known = new Set([water!.id, tea!.id, want!.id, coffee!.id, rice!.id]);
    const sentence = Object.values(catalog.items).find(
      (item) =>
        item.family === 'sentenceBank' &&
        item.level === 'A0' &&
        item.dependencyComplete &&
        item.dependencies
          .filter((id) => catalog.items[id]?.family !== 'grammarInUse')
          .every((id) => known.has(id)),
    );
    const pattern = sentence?.dependencies
      .map((id) => catalog.items[id])
      .find((item) => item?.family === 'grammarInUse');
    if (sentence && pattern) {
      introduce(pattern);
      add(water!, 'image_recall', 'practice', { mediaCueId: water!.id });
      add(pattern, 'context_recognition', 'practice', {
        choiceIds: [pattern.id, want!.id, water!.id],
        choiceMode: 'telugu',
      });
      add(sentence, 'combination_introduction', 'exposure');
      add(sentence, 'audio_target_recognition', 'practice', {
        choiceIds: [sentence.id, water!.id, tea!.id],
        choiceMode: 'telugu',
      });
      add(sentence, 'combination_recall', 'practice');
      add(water!, 'spoken_recall', 'review', {
        mediaCueId: water!.id,
        reviewPurpose: 'reinforcement',
      });
      add(sentence, 'sentence_construction', 'practice');
      const variation = Object.values(catalog.items).find(
        (item) =>
          item.family === 'sentenceBank' &&
          item.id !== sentence.id &&
          item.level === 'A0' &&
          item.dependencyComplete &&
          item.dependencies.every((id) => known.has(id) || id === pattern.id),
      );
      if (variation) {
        add(variation, 'combination_introduction', 'exposure');
        add(variation, 'audio_target_recognition', 'practice', {
          choiceIds: [variation.id, sentence.id],
          choiceMode: 'telugu',
        });
        add(variation, 'combination_recall', 'practice');
      }
    }
    for (const item of fresh.slice(5)) {
      introduce(item);
      known.add(item.id);
      const selected = selectRetrievalActivity(
        catalog,
        item,
        state,
        'listen',
        known,
      );
      add(item, selected.type, 'practice', selected);
      const prior = fresh[Math.max(0, fresh.indexOf(item) - 3)]!;
      const recall = selectRetrievalActivity(
        catalog,
        prior,
        state,
        'recall',
        known,
      );
      add(prior, recall.type, 'review', {
        ...recall,
        reviewPurpose: 'reinforcement',
      });
      const speaking = selectRetrievalActivity(
        catalog,
        item,
        state,
        'recall',
        known,
      );
      add(item, speaking.type, 'practice', speaking);
    }
  } else {
    const known = new Set(Object.keys(state.concepts));
    for (let index = 0; index < fresh.length; index += 3) {
      const group = fresh.slice(index, index + 3);
      for (const item of group) {
        introduce(item);
        known.add(item.id);
      }
      for (const item of group) {
        const selected = selectRetrievalActivity(
          catalog,
          item,
          state,
          'listen',
          known,
        );
        add(item, selected.type, 'practice', selected);
      }
      for (const item of group) {
        const selected = selectRetrievalActivity(
          catalog,
          item,
          state,
          'recall',
          known,
        );
        add(item, selected.type, 'practice', selected);
      }
    }
  }

  if (Object.keys(state.concepts).length) {
    const practiced = new Set(
      state.events
        .filter((e) => e.type === 'activity_answered')
        .map((e) => e.conceptId),
    );
    const combinations = Object.values(catalog.items)
      .filter(
        (item) =>
          item.family === 'sentenceBank' &&
          item.level === 'A0' &&
          !practiced.has(item.id) &&
          readyToCombine(item, state, now, catalog),
      )
      .slice(0, 2);
    for (const item of combinations) {
      add(item, 'combination_introduction', 'exposure');
      add(item, 'shadow', 'practice');
      add(item, 'contextual_recall', 'practice');
    }
  }
  return {
    allowance: budget,
    activities,
    level: state.level,
    nominalMinutes: minutes,
  };
}

function buildEstablishedPlan(
  catalog: Catalog,
  state: LearnerState,
  now: number,
  minutes: number,
): Plan {
  const budget = allowance(state, now, minutes);
  const activities: Activity[] = [];
  const add = addFactory(activities);
  const introduced = new Set(Object.keys(state.concepts));
  addReviews(catalog, state, now, minutes, activities);
  const eligible = Object.values(catalog.items).filter(
    (item) =>
      (item.productionReady || item.family === 'lexicalConcepts') &&
      levels.indexOf(item.level) <= levels.indexOf(state.level) &&
      !item.unseen,
  );
  const fresh = eligible
    .filter(
      (item) => item.family === 'lexicalConcepts' && !introduced.has(item.id),
    )
    .slice(0, budget);
  for (let offset = 0; offset < fresh.length; offset += 3) {
    const group = fresh.slice(offset, offset + 3);
    for (const item of group) {
      add(item, 'concept_introduction', 'exposure');
      introduced.add(item.id);
    }
    for (const purpose of ['listen', 'recall'] as const)
      for (const item of group) {
        const selected = selectRetrievalActivity(
          catalog,
          item,
          state,
          purpose,
          introduced,
        );
        add(item, selected.type, 'practice', selected);
      }
  }

  const practiced = new Set(
    state.events
      .filter((event) => event.type === 'activity_answered')
      .map((event) => event.conceptId),
  );
  const sources = [
    'sentenceBank',
    'dialogues',
    'listeningScripts',
    'grammarInUse',
  ]
    .map(
      (family) =>
        eligible
          .filter(
            (item) =>
              item.family === family &&
              !practiced.has(item.id) &&
              item.dependencyComplete,
          )
          .sort(
            (a, b) =>
              a.dependencies.filter((id) => !introduced.has(id)).length -
              b.dependencies.filter((id) => !introduced.has(id)).length,
          )[0],
    )
    .filter((item): item is ContentItem => !!item);
  for (const source of sources) {
    // Introduced is not the same as heard/speakable: repair skill prerequisites
    // before reusing known vocabulary in a sentence or conversation.
    for (const id of source.dependencies) {
      const dependency = catalog.items[id];
      const dimensions = state.concepts[id]?.dimensions;
      if (
        dependency?.family === 'lexicalConcepts' &&
        introduced.has(id) &&
        ((dimensions?.listening_recognition ?? 0) < 0.25 ||
          (dimensions?.spoken_production ?? 0) < 0.2)
      ) {
        for (const purpose of ['listen', 'recall'] as const) {
          const selected = selectRetrievalActivity(
            catalog,
            dependency,
            state,
            purpose,
            introduced,
          );
          add(dependency, selected.type, 'practice', selected);
        }
      }
    }
    const virtual = {
      ...state,
      concepts: Object.fromEntries(
        [...introduced].map((id) => [
          id,
          state.concepts[id] ?? {
            introducedAt: now,
            lastAt: now,
            dueAt: now + 86400000,
            milestone: 0,
            reinforcement: 0,
            failures: 0,
            attempts: 0,
            dimensions: {},
            contexts: [],
          },
        ]),
      ),
    };
    for (const dependency of dependencyIntroductions(
      catalog,
      source,
      virtual,
    )) {
      add(dependency, 'concept_introduction', 'exposure');
      introduced.add(dependency.id);
      const selected = selectRetrievalActivity(
        catalog,
        dependency,
        state,
        'listen',
        introduced,
      );
      add(dependency, selected.type, 'practice', selected);
      const speaking = selectRetrievalActivity(
        catalog,
        dependency,
        state,
        'recall',
        introduced,
      );
      add(dependency, speaking.type, 'practice', speaking);
    }
    if (source.dependencies.every((id) => introduced.has(id))) {
      add(source, 'combination_introduction', 'exposure');
      add(
        source,
        source.family === 'dialogues'
          ? 'roleplay_a'
          : source.family === 'listeningScripts'
            ? 'shadow'
            : 'contextual_recall',
        'practice',
      );
    }
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
  return state.level === 'A0'
    ? buildBeginnerPlan(catalog, state, now, minutes)
    : buildEstablishedPlan(catalog, state, now, minutes);
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
    if (!completed.has(activityId))
      return {
        id: activityId,
        conceptId: id,
        type: 'spoken_recall',
        phase: 'review',
        dimension: 'spoken_production',
        prompt: '',
        intent: intentFor('spoken_recall'),
        reviewPurpose: 'reinforcement',
      };
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
    (activity.choiceIds ?? []).every(
      (id) =>
        !!state.concepts[id] &&
        !!catalog.items[id] &&
        catalog.items[id]!.dependencies.every((dep) => !!state.concepts[dep]),
    )
  );
}
