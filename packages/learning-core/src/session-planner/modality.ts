import type { Catalog, ContentItem, Meaning } from '../content/types.js';
import type { Dimension, LearnerState } from '../events/types.js';
import type { Activity } from './planner.js';

export interface ActivityIntent {
  cue: 'media' | 'audio' | 'context' | 'target_text' | 'base_language';
  response:
    | 'choose_media'
    | 'choose_target'
    | 'choose_context'
    | 'speak'
    | 'build'
    | 'type_target'
    | 'type_base'
    | 'continue';
  skill:
    | 'comprehension'
    | 'listening'
    | 'speaking'
    | 'contextual_response'
    | 'reading'
    | 'writing';
  answer: 'target' | 'meaning' | 'choice';
  evaluation?:
    'semantic' | 'phonetic' | 'target_orthography' | 'selection' | 'speech';
  spellingMatters: boolean;
  evidenceDimension?: Dimension;
}
export function intentFor(type: string): ActivityIntent {
  const intent = (
    cue: ActivityIntent['cue'],
    response: ActivityIntent['response'],
    skill: ActivityIntent['skill'],
    answer: ActivityIntent['answer'] = 'target',
  ): ActivityIntent => ({
    cue,
    response,
    skill,
    answer,
    spellingMatters: skill === 'writing',
    evaluation:
      answer === 'choice'
        ? 'selection'
        : skill === 'writing'
          ? 'target_orthography'
          : answer === 'meaning'
            ? 'semantic'
            : 'phonetic',
  });
  if (
    [
      'concept_introduction',
      'combination_introduction',
      'introduction',
    ].includes(type)
  )
    return intent('context', 'continue', 'comprehension');
  if (type === 'image_word_recognition')
    return intent('media', 'choose_target', 'comprehension', 'choice');
  if (type === 'audio_image_recognition')
    return intent('audio', 'choose_media', 'listening', 'choice');
  if (type === 'audio_target_recognition')
    return intent('audio', 'choose_target', 'listening', 'choice');
  if (type === 'reading_image_recognition')
    return intent('target_text', 'choose_media', 'reading', 'choice');
  if (type === 'audio_context_recognition')
    return intent('audio', 'choose_context', 'listening', 'choice');
  if (type === 'context_recognition')
    return intent('context', 'choose_target', 'listening', 'choice');
  if (type === 'writing_recall' || type === 'dictation_partial')
    return intent(
      type === 'dictation_partial' ? 'audio' : 'context',
      'type_target',
      'writing',
    );
  if (type === 'reading_recognition')
    return intent('target_text', 'type_base', 'reading', 'meaning');
  if (
    ['meaning_recall', 'meaning_recognition', 'pattern_discovery'].includes(
      type,
    )
  )
    return intent('target_text', 'type_base', 'comprehension', 'meaning');
  if (['audio_to_meaning', 'gist', 'audio_recognition'].includes(type))
    return intent('audio', 'type_base', 'listening', 'meaning');
  if (['sentence_construction', 'word_order'].includes(type))
    return intent('context', 'build', 'comprehension');
  if (type === 'combination_recall')
    return intent('context', 'speak', 'contextual_response');
  if (type.includes('shadow')) return intent('audio', 'speak', 'speaking');
  if (type.includes('transfer') || type === 'inference')
    return {
      ...intent('context', 'speak', 'contextual_response'),
      evidenceDimension: 'transfer_to_unseen_context',
    };
  if (
    ['contextual_recall', 'context_response', 'unscripted_transfer'].includes(
      type,
    ) ||
    type.startsWith('roleplay') ||
    ['oral_summary', 'inference', 'detail'].includes(type)
  )
    return intent('context', 'speak', 'contextual_response');
  return intent(
    type === 'image_recall' ? 'media' : 'context',
    'speak',
    'speaking',
  );
}
export function dimensionForIntent(intent: ActivityIntent): Dimension {
  if (intent.evidenceDimension) return intent.evidenceDimension;
  if (intent.response === 'build') return 'sentence_construction';
  return {
    comprehension: 'meaning_recognition',
    listening: 'listening_recognition',
    speaking: 'spoken_production',
    contextual_response: 'contextual_response',
    reading: 'reading_recognition',
    writing: 'written_production',
  }[intent.skill] as Dimension;
}
export type RetrievalPurpose =
  | 'recognize'
  | 'listen'
  | 'recall'
  | 'due'
  | 'reinforce'
  | 'writing'
  | 'reading';

export function contextSupport(item: ContentItem): Meaning {
  // Base-language context is a clarification, never an English typing task.
  // Target-language context is exposed separately only after dependency checks.
  return item.context?.meaning ?? item.prompt ?? item.meaning;
}
export function conversationallyReady(
  state: LearnerState,
  id: string,
): boolean {
  const d = state.concepts[id]?.dimensions;
  return (
    !!d &&
    (d.listening_recognition ?? 0) >= 2 &&
    (d.spoken_production ?? 0) >= 2 &&
    (d.independent_recall ?? 0) >= 2
  );
}
export function selectRetrievalActivity(
  catalog: Catalog,
  item: ContentItem,
  state: LearnerState,
  purpose: RetrievalPurpose,
  known = new Set(Object.keys(state.concepts)),
): Partial<Activity> & { type: string; intent: ActivityIntent } {
  const candidates = [...known]
    .map((id) => catalog.items[id])
    .filter(
      (other): other is ContentItem =>
        !!other &&
        other.id !== item.id &&
        other.telugu !== item.telugu &&
        other.dependencyComplete &&
        other.dependencies.every((id) => known.has(id)),
    );
  const visualChoices = candidates.filter((other) => !!other.media).slice(-3);
  const choices = [item.id, ...candidates.slice(-3).map((other) => other.id)];
  const recent = state.events
    .filter((e) => e.type === 'activity_answered' && e.conceptId === item.id)
    .slice(-4);
  const last = recent.at(-1)?.dimension;
  const d = state.concepts[item.id]?.dimensions ?? {};
  let type: string;
  if (['dialogues', 'listeningScripts'].includes(item.family)) {
    const type = item.family === 'dialogues' ? 'roleplay_a' : 'shadow';
    const intent = intentFor(type);
    return { type, intent, dimension: dimensionForIntent(intent) };
  }

  // Reusable patterns are not utterances: never ask learners to pronounce blanks.
  if (
    item.family === 'grammarInUse' &&
    /_{2,}/u.test(item.telugu) &&
    choices.length >= 2
  )
    type = 'context_recognition';
  else if (purpose === 'reading' && item.media && visualChoices.length)
    type = 'reading_image_recognition';
  else if (purpose === 'writing') type = 'writing_recall';
  else if (
    purpose === 'due' &&
    conversationallyReady(state, item.id) &&
    !state.events
      .slice(-12)
      .some((e) => e.dimension === 'written_production') &&
    (d.written_production ?? 0) < 1
  )
    type = 'writing_recall';
  else if (
    purpose === 'due' &&
    conversationallyReady(state, item.id) &&
    item.media &&
    visualChoices.length &&
    (d.reading_recognition ?? 0) < 1 &&
    !state.events.slice(-12).some((e) => e.dimension === 'reading_recognition')
  )
    type = 'reading_image_recognition';
  else if (['recall', 'reinforce'].includes(purpose))
    type = item.media ? 'spoken_recall' : 'contextual_recall';
  else if (
    purpose === 'due' &&
    last !== 'spoken_production' &&
    ((d.listening_recognition ?? 0) >= (d.spoken_production ?? 0) ||
      last === 'listening_recognition')
  )
    type = item.media ? 'spoken_recall' : 'contextual_recall';
  else if (item.media && visualChoices.length)
    type =
      purpose === 'recognize'
        ? 'image_word_recognition'
        : 'audio_image_recognition';
  else if (choices.length >= 2)
    type =
      purpose === 'recognize'
        ? 'context_recognition'
        : 'audio_target_recognition';
  else
    type = ['listen', 'recognize'].includes(purpose)
      ? 'audio_target_recognition'
      : 'shadow';
  const intent = intentFor(type);
  const result: Partial<Activity> & { type: string; intent: ActivityIntent } = {
    type,
    intent,
    dimension: dimensionForIntent(intent),
  };
  if (item.media && !['audio', 'target_text'].includes(intent.cue))
    result.mediaCueId = item.id;
  if (intent.answer === 'choice') {
    result.choiceIds = [
      'audio_image_recognition',
      'reading_image_recognition',
    ].includes(type)
      ? [item.id, ...visualChoices.map((other) => other.id)]
      : choices;
    result.choiceMode = [
      'audio_image_recognition',
      'reading_image_recognition',
    ].includes(type)
      ? 'media'
      : 'telugu';
  }
  return result;
}
