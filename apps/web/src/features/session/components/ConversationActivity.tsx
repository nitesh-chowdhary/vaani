import { GlossText } from '../../course/components/GlossText';
import { LearningIcon } from '../../course/components/LearningIcon';
import type { LearningTarget } from '../../course/services/presentation';
import type { CoursePresentation } from '../../course/types/course.types';
import { MeaningReveal } from './TargetPresentation';

export function ConversationActivity({
  turns,
  languages,
  showRomanization,
  onAudio,
}: {
  turns: NonNullable<LearningTarget['turns']>;
  languages: CoursePresentation;
  showRomanization: boolean;
  onAudio: (text: string) => void;
}) {
  const firstSpeaker = turns[0]?.speaker;
  return (
    <div className="conversation">
      {turns.map((turn, index) => (
        <article
          key={index}
          className={`conversation-turn ${turn.speaker === firstSpeaker ? '' : 'other'}`}
        >
          <p className="conversation-speaker">
            <span>{turn.speaker}</span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Listen to turn ${index + 1}`}
              onClick={() => onAudio(turn.targetText)}
            >
              <LearningIcon name="sound" />
            </button>
          </p>
          <div
            className="target-text"
            lang={languages.targetLanguage.code}
            dir="auto"
          >
            <GlossText
              text={turn.targetText}
              meaning={turn.meanings}
              romanization={turn.romanization}
              language={languages.baseLanguage.code}
            />
          </div>
          {showRomanization && turn.romanization && (
            <p className="target-romanization">{turn.romanization}</p>
          )}
          <MeaningReveal
            meaning={turn.localizedMeaning}
            language={languages.baseLanguage.code}
          />
        </article>
      ))}
    </div>
  );
}
