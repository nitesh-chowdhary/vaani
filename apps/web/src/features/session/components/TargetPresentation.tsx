import { learningText } from '../../course/services/learning-copy';
import { useState, type ReactNode } from 'react';
import { ConceptMediaView } from '../../course/components/ConceptMedia';
import { GlossText } from '../../course/components/GlossText';
import type { LearningTarget } from '../../course/services/presentation';
import type { CoursePresentation } from '../../course/types/course.types';
import { LearningIcon } from '../../course/components/LearningIcon';

export function MeaningReveal({
  meaning,
  language,
  initiallyVisible = false,
  answer = false,
}: {
  meaning: string;
  language: string;
  initiallyVisible?: boolean;
  answer?: boolean;
}) {
  const [revealed, setRevealed] = useState(initiallyVisible);
  if (!meaning) return null;
  return revealed || initiallyVisible ? (
    <p lang={language} dir="auto" className="target-meaning">
      {answer ? `${learningText.answer} ` : ''}
      {meaning}
    </p>
  ) : (
    <button
      type="button"
      className="support-button"
      aria-expanded={false}
      onClick={() => setRevealed(true)}
    >
      <LearningIcon name="help" />
      {learningText.meaning}
    </button>
  );
}

export function TargetPresentation({
  target,
  languages,
  teaching = false,
  romanizationDefault = true,
  audio,
  compact = false,
  answerMeaning = false,
  showMedia = true,
  onMediaUnavailable,
}: {
  target: LearningTarget;
  languages: CoursePresentation;
  teaching?: boolean;
  romanizationDefault?: boolean;
  audio?: ReactNode;
  compact?: boolean;
  answerMeaning?: boolean;
  showMedia?: boolean;
  onMediaUnavailable?: () => void;
}) {
  const [romanizationRevealed, setRomanizationRevealed] =
    useState(romanizationDefault);
  const content = (
    <div className="target-copy">
      {audio}
      <div
        className="target-text"
        lang={languages.targetLanguage.code}
        dir="auto"
      >
        <GlossText
          text={target.targetText}
          meaning={target.meanings}
          romanization={target.romanization}
          glosses={target.glosses}
          language={languages.baseLanguage.code}
        />
      </div>
      {target.romanization &&
        (romanizationRevealed || teaching ? (
          <p className="target-romanization">{target.romanization}</p>
        ) : (
          <button
            type="button"
            className="support-button"
            aria-expanded={false}
            onClick={() => setRomanizationRevealed(true)}
          >
            {learningText.pronunciation}
          </button>
        ))}
      <MeaningReveal
        key={target.id}
        meaning={target.localizedMeaning}
        language={languages.baseLanguage.code}
        initiallyVisible={teaching || answerMeaning}
        answer={answerMeaning}
      />
      {target.context && (
        <div className="phrase-context">
          <div
            className="target-text"
            lang={languages.targetLanguage.code}
            dir="auto"
          >
            <GlossText
              text={target.context.targetText}
              meaning={target.context.meanings}
              romanization={target.context.romanization}
              language={languages.baseLanguage.code}
            />
          </div>
          {target.context.romanization &&
            (teaching || romanizationRevealed) && (
              <p className="target-romanization">
                {target.context.romanization}
              </p>
            )}
          <MeaningReveal
            meaning={target.context.localizedMeaning}
            language={languages.baseLanguage.code}
          />
        </div>
      )}
    </div>
  );
  return compact ? (
    content
  ) : (
    <div
      className={`concept-layout ${target.media && showMedia ? '' : 'no-photo'}`}
    >
      {target.media && showMedia && (
        <ConceptMediaView
          media={target.media}
          onUnavailable={onMediaUnavailable}
          eager
        />
      )}
      {content}
    </div>
  );
}
