import {
  learningText,
  languageLabel,
} from '../../course/services/learning-copy';
import type { AnswerClassification } from '@vaani/learning-core';
import { LearningIcon } from '../../course/components/LearningIcon';

export function AudioControl({
  languageName,
  onPlay,
  disabled,
  heard = false,
}: {
  languageName: string;
  onPlay: (slow?: boolean) => void;
  disabled?: boolean;
  heard?: boolean;
}) {
  return (
    <div className="audio-control">
      <button
        type="button"
        className="audio-button"
        aria-label={languageLabel(learningText.play, languageName)}
        disabled={disabled}
        onClick={() => onPlay()}
      >
        <LearningIcon name="sound" />
      </button>
      <div>
        <span className="audio-label">
          {heard ? learningText.listenAgain : learningText.listen}
        </span>
        <button
          type="button"
          className="audio-slower"
          aria-label={languageLabel(learningText.playSlow, languageName)}
          disabled={disabled}
          onClick={() => onPlay(true)}
        >
          {learningText.slower}
        </button>
      </div>
    </div>
  );
}

export type SpeakingState = 'ready' | 'listening' | 'processing';
export function SpeakPrompt({
  languageName,
  state,
  onSpeak,
  disabled,
}: {
  languageName: string;
  state: SpeakingState;
  onSpeak: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="microphone-area">
      <button
        type="button"
        className="microphone-button"
        aria-label={
          state === 'listening'
            ? learningText.stop
            : languageLabel(learningText.speak, languageName)
        }
        aria-pressed={state === 'listening'}
        disabled={disabled || state === 'processing'}
        onClick={onSpeak}
      >
        <LearningIcon name={state === 'listening' ? 'pause' : 'mic'} />
      </button>
      <p className="microphone-label" role="status">
        {state === 'listening'
          ? learningText.listening
          : state === 'processing'
            ? learningText.processing
            : learningText.say}
        {state === 'listening' && (
          <span className="speech-status" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        )}
      </p>
    </div>
  );
}

export function RecallInput({
  value,
  onChange,
  disabled,
  language,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  language?: string;
  onSubmit: () => void;
}) {
  return (
    <div>
      <label htmlFor="learning-response" className="answer-label">
        {learningText.response}
      </label>
      <textarea
        id="learning-response"
        className="recall-field"
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key === 'Enter' &&
            value.trim() &&
            !disabled
          ) {
            event.preventDefault();
            onSubmit();
          }
        }}
        disabled={disabled}
        maxLength={4000}
        placeholder={learningText.placeholder}
        lang={language}
        dir="auto"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

export function LearningFeedback({
  message,
  outcome,
}: {
  message: string;
  outcome?: AnswerClassification;
}) {
  return (
    <div className="learning-feedback" role="status" data-outcome={outcome}>
      <LearningIcon
        name={
          outcome === 'incorrect' || outcome === 'nearly_correct'
            ? 'refresh'
            : 'check'
        }
      />
      <span>{message}</span>
    </div>
  );
}
