import { levels, type Catalog, type ContentItem } from '../content/types.js';
import type { ConceptState, LearnerState } from '../events/types.js';

export type InstructionalState =
  | 'unseen'
  | 'just_introduced'
  | 'recognized'
  | 'recalled'
  | 'spoken'
  | 'weak'
  | 'due_for_reinforcement';

export function instructionalState(
  concept: ConceptState | undefined,
  now = Date.now(),
): InstructionalState {
  if (!concept) return 'unseen';
  if (
    concept.failures > 0 &&
    concept.failures >= Math.max(1, Math.ceil(concept.attempts / 3))
  )
    return 'weak';
  if (concept.dueAt <= now && concept.reinforcement > 0)
    return 'due_for_reinforcement';
  if ((concept.dimensions.spoken_production ?? 0) >= 0.2) return 'spoken';
  if ((concept.dimensions.independent_recall ?? 0) >= 0.25) return 'recalled';
  if (
    Math.max(
      concept.dimensions.meaning_recognition ?? 0,
      concept.dimensions.listening_recognition ?? 0,
    ) >= 0.25
  )
    return 'recognized';
  return 'just_introduced';
}

export function unexplained(
  item: ContentItem,
  state: LearnerState,
  includeTarget = true,
): string[] {
  return [
    ...new Set([...(includeTarget ? [item.id] : []), ...item.dependencies]),
  ].filter((id) => !state.concepts[id]);
}

export function readyToCombine(
  item: ContentItem,
  state: LearnerState,
  now = Date.now(),
  catalog?: Catalog,
): boolean {
  if (!item.dependencyComplete || item.dependencies.length === 0) return false;
  return item.dependencies.every((id) => {
    const concept = state.concepts[id];
    if (!concept) return false;
    const sourceState = instructionalState(concept, now);
    const lexical = catalog?.items[id]?.family === 'lexicalConcepts';
    if (lexical)
      return (
        (concept.dimensions.listening_recognition ?? 0) >= 0.25 &&
        (concept.dimensions.spoken_production ?? 0) >= 0.2
      );
    return (
      sourceState === 'recognized' ||
      sourceState === 'recalled' ||
      sourceState === 'spoken'
    );
  });
}

export function mayInfer(item: ContentItem, type: string): boolean {
  return (
    levels.indexOf(item.level) >= 3 &&
    type === 'inference' &&
    item.explicitInference
  );
}

export function dependencyIntroductions(
  catalog: Catalog,
  item: ContentItem,
  state: LearnerState,
): ContentItem[] {
  return unexplained(item, state, false)
    .map((id) => catalog.items[id])
    .filter(
      (candidate): candidate is ContentItem =>
        !!candidate && !!candidate.meaning.en && !!candidate.telugu,
    );
}
