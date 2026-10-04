import { evaluationFeedback } from './feedback.js';
import type { ContentItem } from '../content/types.js';
import { intentFor, type ActivityIntent } from '../session-planner/modality.js';
import type { Evidence } from '../events/types.js';
import {
  matchAnswer,
  type AnswerClassification,
  type AnswerSpec,
} from './answer-matcher.js';

export interface Answer {
  response: string;
  inputMode: 'text' | 'speech' | 'self';
  selfRating?: 'again' | 'good';
  latencyMs: number;
}
export interface Evaluation {
  evidence: Evidence;
  feedback: string;
  classification?: AnswerClassification;
}
export interface EvaluationOptions {
  baseLanguage?: string;
  knownAnswers?: ReadonlySet<string>;
  intent?: ActivityIntent;
  interfaceLanguage?: string;
}

export function meaningAnswerSpec(
  item: ContentItem,
  language = 'en',
): AnswerSpec {
  return {
    canonical: item.meaning[language] ?? '',
    aliases: item.acceptedMeanings?.[language] ?? [],
    alternatives: item.family === 'lexicalConcepts',
    commaAlternatives: item.family === 'lexicalConcepts',
    parentheticalContext: item.family === 'lexicalConcepts',
  };
}

export function evaluate(
  item: ContentItem,
  type: string,
  answer: Answer,
  hinted: boolean,
  options: EvaluationOptions = {},
): Evaluation {
  const intent = options.intent ?? intentFor(type);
  const copy = evaluationFeedback(options.interfaceLanguage);
  if (
    item.openResponse ||
    [
      'context_response',
      'unscripted_transfer',
      'oral_summary',
      'inference',
      'detail',
      'roleplay_a',
      'roleplay_b',
    ].includes(type)
  ) {
    return {
      evidence: 'unverified',
      feedback: copy.saved,
    };
  }
  if (answer.inputMode === 'self') {
    return {
      classification: answer.selfRating === 'again' ? 'incorrect' : 'correct',
      evidence:
        intent.skill === 'writing'
          ? 'unverified'
          : answer.selfRating === 'again'
            ? 'incorrect'
            : 'self_reported',
      feedback: answer.selfRating === 'again' ? copy.repeat : copy.continue,
    };
  }
  const choiceTask = intent.answer === 'choice';
  const meaningTask = intent.answer === 'meaning';
  const accepted =
    item.raw.scriptedAnswerRequired === true
      ? [item.telugu, item.romanization]
      : item.acceptedAnswers;
  const spec: AnswerSpec = choiceTask
    ? { canonical: item.id, aliases: [] }
    : meaningTask
      ? meaningAnswerSpec(item, options.baseLanguage)
      : {
          canonical: item.telugu,
          aliases: intent.spellingMatters
            ? Array.isArray(item.raw.acceptedWrittenAnswers)
              ? item.raw.acceptedWrittenAnswers.filter(
                  (value): value is string => typeof value === 'string',
                )
              : accepted.filter(
                  (value) =>
                    value !== item.romanization ||
                    item.romanization === item.telugu,
                )
            : accepted,
        };
  // Choice IDs are identities, not free text. Never fuzzy-match another choice.
  let classification = choiceTask
    ? answer.response === item.id
      ? 'correct'
      : 'incorrect'
    : matchAnswer(answer.response, spec, {
        allowTypos:
          answer.inputMode === 'text' &&
          (intent.answer === 'meaning' || intent.spellingMatters),
        orthography: intent.spellingMatters,
        knownAnswers: meaningTask ? options.knownAnswers : undefined,
      });
  // A support-language typo is not evidence of weak target-language understanding.
  if (classification === 'nearly_correct' && !intent.spellingMatters)
    classification = 'correct';
  if (classification === 'incorrect')
    return {
      classification,
      evidence:
        intent.response === 'speak' && answer.inputMode === 'text'
          ? 'unverified'
          : 'incorrect',
      feedback: copy.incorrect,
    };
  if (classification === 'nearly_correct')
    return {
      classification,
      evidence: hinted ? 'hinted' : 'hesitant',
      feedback: copy.writingNear,
    };
  const speaking = intent.response === 'speak';
  if (speaking && answer.inputMode !== 'speech')
    return {
      classification,
      evidence: 'unverified',
      feedback: copy.say,
    };
  return {
    classification,
    evidence:
      intent.skill === 'writing' && answer.inputMode !== 'text'
        ? 'unverified'
        : hinted
          ? 'hinted'
          : answer.latencyMs > 15000
            ? 'hesitant'
            : 'independent',
    feedback: copy.correct,
  };
}
