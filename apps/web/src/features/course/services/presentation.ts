import { intentFor } from '@vaani/learning-core';
import { learningText, languageLabel } from './learning-copy';
import type { ConceptMedia, Gloss, Meaning } from '@vaani/learning-core';
import type {
  CoursePresentation,
  Session,
  Target,
} from '../types/course.types';

// The only legacy-language mapping lives here, outside generic learning views.
// The API supplies this metadata for the active authored course.
export const currentCoursePresentation: CoursePresentation = {
  targetLanguage: {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    speechLocale: 'te-IN',
    hasRomanization: true,
  },
  baseLanguage: { code: 'en', name: 'English' },
};

export interface LearningTarget {
  id: string;
  targetText: string;
  romanization?: string;
  localizedMeaning: string;
  meanings: Meaning;
  glosses: Gloss[];
  media?: ConceptMedia;
  context?: {
    targetText: string;
    romanization?: string;
    localizedMeaning: string;
    meanings: Meaning;
  };
  turns?: {
    speaker: string;
    targetText: string;
    romanization?: string;
    localizedMeaning: string;
    meanings: Meaning;
  }[];
}

export function presentTarget(
  target: Target,
  languages: CoursePresentation,
): LearningTarget {
  const meaning = (meanings: Meaning) =>
    meanings[languages.baseLanguage.code] ?? '';
  return {
    id: target.id,
    targetText: target.telugu,
    romanization: languages.targetLanguage.hasRomanization
      ? target.romanization
      : undefined,
    localizedMeaning: meaning(target.meaning),
    meanings: target.meaning,
    glosses: target.glosses,
    media: target.media,
    context: target.context
      ? {
          targetText: target.context.text,
          romanization: languages.targetLanguage.hasRomanization
            ? target.context.romanization
            : undefined,
          localizedMeaning: meaning(target.context.meaning),
          meanings: target.context.meaning,
        }
      : undefined,
    turns: target.turns?.map((turn) => ({
      speaker: turn.speaker,
      targetText: turn.telugu,
      romanization: languages.targetLanguage.hasRomanization
        ? turn.romanization
        : undefined,
      localizedMeaning: meaning(turn.meaning),
      meanings: turn.meaning,
    })),
  };
}

export function presentActivity(
  activity: NonNullable<Session['activity']>,
  languages: CoursePresentation,
) {
  const intent = activity.intent ?? intentFor(activity.type);
  const listening = intent.cue === 'audio' || intent.skill === 'listening';
  const speaking = intent.response === 'speak';
  const meaning = intent.answer === 'meaning';
  const title =
    intent.skill === 'writing'
      ? languageLabel(learningText.write, languages.targetLanguage.name)
      : intent.response === 'build'
        ? learningText.build
        : intent.answer === 'choice'
          ? learningText.choose
          : meaning
            ? learningText.meaning
            : '';
  const stimulus = activity.stimulus
    ? {
        targetText: activity.stimulus.telugu,
        romanization: languages.targetLanguage.hasRomanization
          ? activity.stimulus.romanization
          : undefined,
      }
    : null;
  const dialogueTurns = activity.dialogueCues?.map((turn) => ({
    speaker: turn.speaker,
    targetText: turn.telugu,
    romanization: languages.targetLanguage.hasRomanization
      ? turn.romanization
      : undefined,
    localizedMeaning: turn.meaning[languages.baseLanguage.code] ?? '',
    meanings: turn.meaning,
  }));
  return {
    listening,
    speaking,
    meaning,
    stimulus,
    dialogueTurns,
    intent,
    title,
  };
}
