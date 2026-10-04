import type { AnswerClassification } from '@vaani/learning-core';
import { ConceptMediaView } from '../../course/components/ConceptMedia';
import { LearningIcon } from '../../course/components/LearningIcon';
import type { LearningTarget } from '../../course/services/presentation';
import type { CoursePresentation } from '../../course/types/course.types';

export function ActivityOptions({
  options,
  images,
  languages,
  selected,
  outcome,
  disabled,
  onChoose,
  romanizationDefault = true,
}: {
  options: LearningTarget[];
  images: boolean;
  languages: CoursePresentation;
  selected?: string;
  outcome?: AnswerClassification;
  disabled?: boolean;
  onChoose: (id: string) => void;
  romanizationDefault?: boolean;
}) {
  return (
    <div
      className={`choice-grid ${images ? '' : 'words'}`}
      role="group"
      aria-label={images ? 'Choose a photograph' : 'Choose a phrase'}
    >
      {options.map((option, index) =>
        images && option.media ? (
          <ConceptMediaView
            key={option.id}
            media={option.media}
            eager
            hideMeaning
            fallbackLabel={`${option.targetText}${option.romanization ? ` · ${option.romanization}` : ''}`}
            selection={{
              label: `Image option ${index + 1}`,
              onSelect: () => onChoose(option.id),
              disabled,
              selected: selected === option.id,
              outcome,
            }}
          />
        ) : (
          <button
            key={option.id}
            type="button"
            className="word-choice"
            aria-pressed={selected === option.id}
            disabled={disabled}
            onClick={() => onChoose(option.id)}
            data-feedback={selected === option.id ? outcome : undefined}
          >
            <span
              lang={languages.targetLanguage.code}
              dir="auto"
              className="target-text"
            >
              {option.targetText}
            </span>
            {romanizationDefault && option.romanization && (
              <span className="target-romanization block">
                {option.romanization}
              </span>
            )}
            {selected === option.id && outcome === 'correct' && (
              <span className="choice-mark">
                <LearningIcon name="check" />
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
