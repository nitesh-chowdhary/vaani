import { learningText } from '../../course/services/learning-copy';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConceptMediaView } from '../../course/components/ConceptMedia';
import { LearningButton } from '../../course/components/LearningButton';
import { LearningIcon } from '../../course/components/LearningIcon';
import { courseService } from '../../course/services/course.service';
import {
  currentCoursePresentation,
  presentActivity,
  presentTarget,
} from '../../course/services/presentation';
import type { ActionResult, Session } from '../../course/types/course.types';
import { browserAudio } from '../../listening/services/audio';
import { browserSpeech } from '../../speaking/services/speech';
import { ActivityOptions } from '../components/ActivityOptions';
import { ConversationActivity } from '../components/ConversationActivity';
import {
  AudioControl,
  LearningFeedback,
  RecallInput,
  SpeakPrompt,
  type SpeakingState,
} from '../components/LearningControls';
import { LearningShell } from '../components/LearningShell';
import { SentenceBuilder } from '../components/SentenceBuilder';
import {
  TargetPresentation,
  MeaningReveal,
} from '../components/TargetPresentation';

export function SessionPage() {
  const { id = '' } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [answer, setAnswer] = useState('');
  const [mode, setMode] = useState<'text' | 'speech'>('text');
  const [feedback, setFeedback] = useState<ActionResult | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string>();
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);
  const [useTyping, setUseTyping] = useState(false);
  const [useTiles, setUseTiles] = useState(false);
  const [speechFallback, setSpeechFallback] = useState(false);
  const [preferWordChoices, setPreferWordChoices] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakingState, setSpeakingState] = useState<SpeakingState>('ready');
  const [audioMessage, setAudioMessage] = useState('');
  const [heard, setHeard] = useState(false);
  const stopSpeech = useRef<((cancel?: boolean) => void) | null>(null);
  const began = useRef(Date.now());
  useEffect(() => {
    void courseService
      .session(id)
      .then(setSession)
      .catch(() =>
        setError('We could not load your session. Please try again.'),
      );
    return () => {
      stopSpeech.current?.(true);
      browserAudio.stop();
    };
  }, [id]);
  const activity = session?.activity;
  const languages = session?.presentation ?? currentCoursePresentation;
  const view = activity ? presentActivity(activity, languages) : null;
  const needsRetry =
    feedback?.classification === 'incorrect' ||
    feedback?.classification === 'nearly_correct';
  const authoredTarget = needsRetry
    ? activity?.target
    : feedback?.target || activity?.target;
  const target = authoredTarget
    ? presentTarget(authoredTarget, languages)
    : null;
  const choices =
    activity?.choices?.map((choice) => presentTarget(choice, languages)) ?? [];
  const romanizationDefault = activity?.support?.romanizationDefault ?? true;
  const tiles = activity?.tiles ?? [];
  const tileAnswer = selectedTiles
    .map((tileId) => tiles.find((tile) => tile.id === tileId)?.text ?? '')
    .join(' ');
  const showTiles =
    !!tiles.length && !useTyping && (!view?.speaking || useTiles);
  const response = showTiles ? tileAnswer : answer;

  function mediaUnavailable() {
    if (!activity) return;
    const failedActivity = activity.id;
    setPreferWordChoices(true);
    void courseService
      .session(id, true)
      .then((updated) => {
        setSession((current) =>
          current?.activity?.id === failedActivity &&
          updated.activity?.id === failedActivity &&
          current.version === updated.version
            ? updated
            : current,
        );
      })
      .catch(() => setError('Please try again.'));
  }
  function resetInteraction(clearAnswer = true) {
    stopSpeech.current?.(true);
    browserAudio.stop();
    setSpeakingState('ready');
    setFeedback(null);
    setSelectedChoice(undefined);
    setHeard(false);
    setAudioMessage('');
    if (clearAnswer) {
      setAnswer('');
      setMode('text');
      setSelectedTiles([]);
      setUseTyping(false);
      setUseTiles(false);
      setSpeechFallback(false);
    }
    began.current = Date.now();
  }
  async function act(
    action: 'expose' | 'answer' | 'hint' | 'audio',
    rating?: 'again' | 'good',
    responseOverride?: string,
    inputModeOverride?: 'speech' | 'text',
  ) {
    if (!activity || !session || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await courseService.act(id, {
        eventId: crypto.randomUUID(),
        activityId: activity.id,
        action,
        response: responseOverride ?? response,
        inputMode: rating ? 'self' : (inputModeOverride ?? mode),
        selfRating: rating,
        latencyMs: Date.now() - began.current,
      });
      if (action === 'answer') setFeedback(result);
      else {
        setSession(result.session);
        if (action === 'hint') setFeedback(null);
        if (action === 'audio')
          setFeedback((previous) =>
            previous ? { ...previous, session: result.session } : null,
          );
        if (action === 'expose') resetInteraction();
      }
    } catch {
      setError('We could not save that yet. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function play(slow = false, text?: string) {
    const request = text
      ? { text, language: languages.targetLanguage.speechLocale }
      : (activity?.audio ??
        (target
          ? {
              text: target.targetText,
              language: languages.targetLanguage.speechLocale,
            }
          : null));
    if (!request) return;
    setAudioMessage('');
    try {
      await browserAudio.play(
        { ...request, speed: slow ? 'clear' : 'natural' },
        () => {
          setHeard(true);
          if (!feedback || needsRetry) void act('audio');
        },
      );
    } catch {
      setAudioMessage(
        'Audio is not available here yet. You can keep practising with the text.',
      );
    }
  }
  function speak() {
    if (speakingState === 'listening') {
      stopSpeech.current?.();
      setSpeakingState('ready');
      return;
    }
    browserAudio.stop();
    setAudioMessage('');
    setSpeakingState('listening');
    try {
      stopSpeech.current = browserSpeech.start(
        (text) => {
          setAnswer(text);
          setMode('speech');
          setSpeakingState('processing');
          void act('answer', undefined, text, 'speech');
        },
        (message) => {
          setSpeechFallback(true);
          setAudioMessage(message);
          setSpeakingState('ready');
        },
        () => setSpeakingState('ready'),
        languages.targetLanguage.speechLocale,
      );
    } catch {
      setSpeechFallback(true);
      setAudioMessage('Try again, or listen and repeat.');
      setSpeakingState('ready');
    }
  }
  async function finish() {
    setBusy(true);
    try {
      setSession(await courseService.finish(id));
      resetInteraction();
    } catch {
      setError('We could not finish your session yet. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const audio = (
    <AudioControl
      languageName={languages.targetLanguage.name}
      onPlay={(slow) => void play(slow)}
      disabled={busy}
      heard={heard}
    />
  );
  if (!session)
    return (
      <LearningShell languages={languages}>
        <div className="loading-layout" role="status">
          <LearningIcon name="voice" />
          <div className="loading-photo" />
          <p>{error || 'Making room for your next words…'}</p>
          {error && (
            <LearningButton
              tone="secondary"
              onClick={() =>
                void courseService
                  .session(id)
                  .then(setSession)
                  .catch(() => {})
              }
            >
              Try again
            </LearningButton>
          )}
        </div>
      </LearningShell>
    );
  if (session.status === 'completed')
    return (
      <LearningShell
        languages={languages}
        completed={session.total}
        total={session.total}
      >
        <div className="session-summary">
          <div className="summary-emblem">
            <LearningIcon name="check" />
          </div>
          <p className="eyebrow">A little more familiar</p>
          <h1>Session summary</h1>
          <p className="target-meaning">
            Your practice is saved. Come back whenever you’re ready.
          </p>
          <div className="summary-stats">
            <div>
              <strong>{session.summary.introduced}</strong>
              <span>Words & phrases met</span>
            </div>
            <div>
              <strong>{session.summary.attempts}</strong>
              <span>Practice moments</span>
            </div>
            <div>
              <strong>{session.summary.minutes}</strong>
              <span>Minutes together</span>
            </div>
          </div>
          <LearningButton asChild>
            <Link to="/app">
              Continue {languages.targetLanguage.name}
              <LearningIcon name="arrow" />
            </Link>
          </LearningButton>
        </div>
      </LearningShell>
    );

  return (
    <LearningShell
      languages={languages}
      completed={session.cursor}
      total={session.total}
      onExit={() => void finish()}
      busy={busy}
    >
      {!activity || !view ? (
        <div className="session-summary">
          <p className="eyebrow">Nicely done</p>
          <h1>Ready to finish</h1>
          <p className="target-meaning">Your progress is saved.</p>
          <div className="learning-actions">
            <LearningButton onClick={() => void finish()}>
              View session summary
            </LearningButton>
          </div>
        </div>
      ) : (
        <>
          {view.title && (
            <header className="activity-heading">
              <h1>{view.title}</h1>
            </header>
          )}
          {view.listening && <div className="listening-audio">{audio}</div>}
          {activity.contextCue &&
            (activity.phase === 'exposure' || !target || !!choices.length) && (
              <div className="recall-layout">
                {activity.contextCue.text ? (
                  <p
                    className="target-text"
                    lang={languages.targetLanguage.code}
                  >
                    {activity.contextCue.text}
                  </p>
                ) : null}
                {romanizationDefault &&
                  languages.targetLanguage.hasRomanization &&
                  activity.contextCue.romanization && (
                    <p className="target-romanization">
                      {activity.contextCue.romanization}
                    </p>
                  )}
                <MeaningReveal
                  meaning={activity.contextCue.meaning}
                  language={languages.baseLanguage.code}
                  initiallyVisible={activity.contextCue.meaningVisible ?? true}
                />
              </div>
            )}
          {target &&
            !choices.length &&
            (target.turns?.length ? (
              <ConversationActivity
                turns={target.turns}
                languages={languages}
                showRomanization={romanizationDefault}
                onAudio={(text) => void play(false, text)}
              />
            ) : (
              <TargetPresentation
                key={target.id}
                target={target}
                languages={languages}
                onMediaUnavailable={mediaUnavailable}
                teaching={activity.phase === 'exposure'}
                romanizationDefault={romanizationDefault}
                audio={
                  !view.listening && activity.phase === 'exposure'
                    ? audio
                    : undefined
                }
                answerMeaning={view.meaning && activity.phase !== 'exposure'}
              />
            ))}
          {activity.mediaCue &&
            activity.choiceMode !== 'media' &&
            (!target || !!choices.length) && (
              <div className="recall-layout">
                <ConceptMediaView
                  media={activity.mediaCue}
                  hideMeaning
                  eager
                  onUnavailable={mediaUnavailable}
                />
              </div>
            )}
          {!target &&
            !view.listening &&
            !choices.length &&
            !activity.contextCue &&
            activity.recallCue && (
              <div className="recall-layout">
                <p
                  className="target-meaning"
                  lang={languages.baseLanguage.code}
                  dir="auto"
                >
                  {activity.recallCue}
                </p>
              </div>
            )}
          {!target && view.stimulus && !view.listening && (
            <div className="recall-layout">
              <div
                className="target-text"
                lang={languages.targetLanguage.code}
                dir="auto"
              >
                <button
                  type="button"
                  onClick={() => void act('hint')}
                  disabled={busy}
                  aria-label="Show meaning"
                >
                  {view.stimulus.targetText}
                </button>
              </div>
              {romanizationDefault && view.stimulus.romanization && (
                <p className="target-romanization">
                  {view.stimulus.romanization}
                </p>
              )}
            </div>
          )}
          {!view.listening &&
            activity.phase !== 'exposure' &&
            !!activity.audio && <div className="listening-audio">{audio}</div>}
          {!!view.dialogueTurns?.length && !target && (
            <ConversationActivity
              turns={view.dialogueTurns}
              languages={languages}
              showRomanization={romanizationDefault}
              onAudio={(text) => void play(false, text)}
            />
          )}
          {!!choices.length && (
            <ActivityOptions
              options={choices}
              onUnavailable={mediaUnavailable}
              images={activity.choiceMode === 'media' && !preferWordChoices}
              languages={languages}
              selected={selectedChoice}
              outcome={feedback?.classification}
              disabled={busy || !!feedback}
              romanizationDefault={romanizationDefault}
              onChoose={(choiceId) => {
                setSelectedChoice(choiceId);
                void act('answer', undefined, choiceId);
              }}
            />
          )}
          {!!choices.length && (
            <section
              className="choice-action-region"
              aria-label="Answer and continue"
            >
              <div className="choice-result" aria-live="polite">
                {feedback ? (
                  <LearningFeedback
                    message={feedback.feedback}
                    outcome={feedback.classification}
                  />
                ) : null}
                {target && (activity.hinted || (feedback && !needsRetry)) && (
                  <div className="choice-reinforcement">
                    <span
                      className="target-text"
                      lang={languages.targetLanguage.code}
                    >
                      {target.targetText}
                    </span>
                    {romanizationDefault && target.romanization && (
                      <span className="target-romanization">
                        {target.romanization}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="learning-actions">
                {feedback ? (
                  <LearningButton
                    disabled={busy}
                    onClick={() => {
                      setSession(feedback.session);
                      resetInteraction(!needsRetry);
                    }}
                  >
                    {needsRetry ? learningText.retry : learningText.continue}
                    <LearningIcon name={needsRetry ? 'refresh' : 'arrow'} />
                  </LearningButton>
                ) : (
                  <LearningButton
                    disabled
                    aria-hidden="true"
                    tabIndex={-1}
                    className="choice-action-placeholder"
                  >
                    {learningText.continue}
                  </LearningButton>
                )}
              </div>
              <div className="choice-support">
                {!feedback && activity.choiceMode === 'media' && (
                  <button
                    type="button"
                    className="support-button"
                    aria-label={
                      preferWordChoices
                        ? 'Use photograph choices'
                        : 'Use word choices'
                    }
                    aria-pressed={preferWordChoices}
                    disabled={busy}
                    onClick={() => setPreferWordChoices((value) => !value)}
                  >
                    {preferWordChoices
                      ? 'Use photographs'
                      : 'Use words instead'}
                  </button>
                )}
                {activity.canReveal &&
                  !activity.hinted &&
                  (!feedback || needsRetry) && (
                    <LearningButton
                      tone="quiet"
                      disabled={busy}
                      onClick={() => void act('hint')}
                    >
                      {learningText.help}
                    </LearningButton>
                  )}
              </div>
            </section>
          )}
          {!choices.length &&
            (feedback ? (
              <>
                <LearningFeedback
                  message={feedback.feedback}
                  outcome={feedback.classification}
                />
                <div className="learning-actions">
                  {needsRetry && activity.canReveal && !activity.hinted && (
                    <LearningButton
                      tone="quiet"
                      disabled={busy}
                      onClick={() => void act('hint')}
                    >
                      {learningText.help}
                    </LearningButton>
                  )}
                  <LearningButton
                    disabled={busy}
                    onClick={() => {
                      setSession(feedback.session);
                      resetInteraction(!needsRetry);
                    }}
                  >
                    {needsRetry ? learningText.retry : learningText.continue}
                    <LearningIcon name={needsRetry ? 'refresh' : 'arrow'} />
                  </LearningButton>
                </div>
              </>
            ) : activity.phase === 'exposure' ? (
              <div className="learning-actions">
                <LearningButton
                  disabled={busy}
                  aria-label="I understand — continue"
                  onClick={() => void act('expose')}
                >
                  {learningText.continue}
                  <LearningIcon name="arrow" />
                </LearningButton>
              </div>
            ) : !choices.length ? (
              <div className="recall-layout">
                {view.speaking && (
                  <SpeakPrompt
                    languageName={languages.targetLanguage.name}
                    state={speakingState}
                    onSpeak={speak}
                    disabled={busy}
                  />
                )}
                {showTiles ? (
                  <>
                    <SentenceBuilder
                      tiles={tiles}
                      selected={selectedTiles}
                      onChange={setSelectedTiles}
                      disabled={busy}
                      language={languages.targetLanguage.code}
                    />
                    <button
                      type="button"
                      className="support-button"
                      onClick={() => setUseTyping(true)}
                    >
                      {learningText.type}
                    </button>
                  </>
                ) : !view.speaking || useTyping ? (
                  <RecallInput
                    value={answer}
                    onChange={(value) => {
                      setAnswer(value);
                      setMode('text');
                    }}
                    disabled={busy}
                    language={
                      view.meaning
                        ? languages.baseLanguage.code
                        : languages.targetLanguage.code
                    }
                    onSubmit={() => void act('answer')}
                  />
                ) : null}
                <div className="learning-actions">
                  {(!view.speaking || useTyping || showTiles) && (
                    <LearningButton
                      disabled={busy || !response.trim()}
                      onClick={() => void act('answer')}
                    >
                      {learningText.check}
                      <LearningIcon name="arrow" />
                    </LearningButton>
                  )}
                  {activity.canReveal && (
                    <LearningButton
                      tone="quiet"
                      aria-label="Reveal meaning / romanization"
                      disabled={busy}
                      onClick={() => void act('hint')}
                    >
                      {learningText.help}
                    </LearningButton>
                  )}
                </div>
                {view.intent.skill === 'writing' && (
                  <button
                    type="button"
                    className="support-button"
                    disabled={busy}
                    onClick={() => void act('answer', 'good')}
                  >
                    {learningText.later}
                  </button>
                )}
                {view.speaking && !useTyping && !showTiles && (
                  <div className="support-controls">
                    <button
                      type="button"
                      className="support-button"
                      disabled={busy}
                      onClick={() => {
                        setSpeechFallback(true);
                        if (!activity.hinted) void act('hint');
                      }}
                    >
                      {learningText.repeat}
                    </button>
                    {!!tiles.length && (
                      <button
                        type="button"
                        className="support-button"
                        onClick={() => setUseTiles(true)}
                      >
                        {learningText.words}
                      </button>
                    )}
                    <button
                      type="button"
                      className="support-button"
                      onClick={() => setUseTyping(true)}
                    >
                      {learningText.type}
                    </button>
                  </div>
                )}
                {view.speaking && speechFallback && activity.hinted && (
                  <div className="support-controls">
                    <button
                      type="button"
                      className="support-button"
                      disabled={busy}
                      onClick={() => void act('answer', 'again')}
                    >
                      {learningText.retry}
                    </button>
                    <button
                      type="button"
                      className="support-button"
                      disabled={busy}
                      onClick={() => void act('answer', 'good')}
                    >
                      {learningText.said}
                    </button>
                  </div>
                )}
              </div>
            ) : null)}
          {audioMessage && (
            <p role="status" className="learning-notice">
              {audioMessage}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="learning-notice">
          {error}
          <button
            type="button"
            className="support-button ml-3"
            onClick={() =>
              void courseService
                .session(id)
                .then((value) => {
                  setSession(value);
                  setError('');
                })
                .catch(() => {})
            }
          >
            Reload progress
          </button>
        </p>
      )}
    </LearningShell>
  );
}
