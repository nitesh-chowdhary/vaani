import { useEffect, useRef, useState } from 'react';
import { courseService } from '../../course/services/course.service';
import { currentCoursePresentation } from '../../course/services/presentation';
import type {
  CoursePresentation,
  Target,
} from '../../course/types/course.types';
import { LearningButton } from '../../course/components/LearningButton';
import { browserSpeech } from '../../speaking/services/speech';
import { LearningShell } from '../../session/components/LearningShell';
import {
  RecallInput,
  SpeakPrompt,
  type SpeakingState,
} from '../../session/components/LearningControls';

export function CheckpointPage() {
  const [item, setItem] = useState<Target | null>(null);
  const [languages, setLanguages] = useState<CoursePresentation>(
    currentCoursePresentation,
  );
  const [response, setResponse] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speechState, setSpeechState] = useState<SpeakingState>('ready');
  const stop = useRef<((cancel?: boolean) => void) | null>(null);
  useEffect(() => {
    void Promise.all([courseService.home(), courseService.assessment()])
      .then(([course, result]) => {
        setLanguages(course.presentation ?? currentCoursePresentation);
        setItem(result.assessment);
        if (!result.assessment)
          setMessage('No new check-in is available right now.');
      })
      .catch(() =>
        setMessage('We could not load your check-in. Please try again.'),
      );
    return () => stop.current?.(true);
  }, []);
  async function save() {
    if (!item || busy) return;
    setBusy(true);
    try {
      const result = await courseService.submitAssessment(item.id, response);
      setMessage(result.message);
      setSaved(true);
    } catch {
      setMessage('We could not save your response yet. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  function speak() {
    if (speechState === 'listening') {
      stop.current?.();
      setSpeechState('ready');
      return;
    }
    setSpeechState('listening');
    try {
      stop.current = browserSpeech.start(
        (text) => {
          setResponse(text);
          setSpeechState('processing');
        },
        (text) => {
          setMessage(text);
          setSpeechState('ready');
        },
        () => setSpeechState('ready'),
        languages.targetLanguage.speechLocale,
      );
    } catch {
      setMessage('We could not hear you. You can type your response instead.');
      setSpeechState('ready');
    }
  }
  return (
    <LearningShell languages={languages}>
      <header className="activity-heading">
        <p className="activity-kicker">Make it your own</p>
        <h1>Speaking check-in</h1>
      </header>
      <div className="recall-layout">
        {item && !saved && (
          <>
            <p className="target-meaning" lang={languages.baseLanguage.code}>
              {item.prompt[languages.baseLanguage.code]}
            </p>
            <p className="learning-notice">
              Speak in your own words. Take your time.
            </p>
            <SpeakPrompt
              languageName={languages.targetLanguage.name}
              state={speechState}
              onSpeak={speak}
              disabled={busy}
            />
            <RecallInput
              value={response}
              onChange={setResponse}
              language={languages.targetLanguage.code}
              onSubmit={() => void save()}
              disabled={busy}
            />
            <div className="learning-actions">
              <LearningButton
                disabled={busy || !response.trim()}
                onClick={() => void save()}
              >
                Save response
              </LearningButton>
            </div>
          </>
        )}
        {message && (
          <p role="status" className="learning-notice">
            {message}
          </p>
        )}
      </div>
    </LearningShell>
  );
}
