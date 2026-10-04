import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  buildPlan,
  allowance,
  replay,
  evaluate,
  normalizeAnswer,
  acceptedVariants,
  meaningAnswerSpec,
  allowedActivity,
  nextReinforcement,
  type AnswerClassification,
  type LearnerState,
  type LearningEvent,
  type Catalog,
  type ContentItem,
  type Activity,
  intentFor,
  dimensionForIntent,
  selectRetrievalActivity,
  contextSupport,
} from '@vaani/learning-core';
import {
  coursePresentation,
  activitySupport,
} from '../course/course.presentation.js';
import { ApiError } from '../../infrastructure/errors/api-error.js';
import { loadContent } from '../content/content.service.js';
import { learnerEvents } from '../learning-events/learning-events.service.js';
import { LearningSession, type SessionRecord } from './sessions.model.js';
import type { Action } from './sessions.validation.js';
const missing = () =>
  new ApiError(404, 'session_not_found', 'Session not found.');
export function publicItem(
  item: ContentItem,
  includeContext = item.family !== 'lexicalConcepts',
) {
  return {
    id: item.id,
    family: item.family,
    level: item.level,
    telugu: item.telugu,
    romanization: item.romanization,
    meaning: item.meaning,
    prompt: item.prompt,
    ...(includeContext ? { context: item.context } : {}),
    glosses: item.glosses,
    media: item.media,
    register: item.register,
    reviewStatus: item.reviewStatus,
    audioSpeed: item.audioSpeed,
    openResponse: item.openResponse,
    notes:
      item.raw.usage ??
      item.raw.usageNote ??
      item.raw.interpretationGuide ??
      item.raw.teachingNote,
    turns: item.raw.turns,
    questions: item.raw.comprehensionQuestions,
    rubric:
      item.raw.requiredMoves ??
      item.raw.moves ??
      item.raw.speakingSequence ??
      item.raw.scoringDimensions ??
      item.raw.focus,
    gradingRule: item.raw.gradingRule,
  };
}
export function sessionSummary(s: SessionRecord) {
  const answers = s.events.filter((e) => e.type === 'activity_answered');
  return {
    introduced: s.events.filter((e) => e.type === 'concept_exposed').length,
    attempts: answers.length,
    independent: answers.filter((e) => e.evidence === 'independent').length,
    speaking: answers.filter((e) => e.dimension === 'spoken_production').length,
    listening: answers.filter((e) => e.dimension === 'listening_recognition')
      .length,
    reviews: answers.filter(
      (e) => e.reviewPurpose || e.dimension === 'delayed_recall',
    ).length,
    minutes: Math.round(
      ((s.completedAt?.getTime() ?? Date.now()) - s.startedAt.getTime()) /
        60000,
    ),
  };
}
function presentedActivity(
  catalog: Catalog,
  state: LearnerState,
  activity: Activity,
): Activity {
  // Resume older saved sessions using the corrected modality without losing IDs/events.
  if (
    !activity.intent &&
    [
      'meaning_recall',
      'meaning_recognition',
      'delayed_recall',
      'pattern_discovery',
    ].includes(activity.type)
  ) {
    const item = catalog.items[activity.conceptId];
    const selected = selectRetrievalActivity(
      catalog,
      item,
      state,
      activity.phase === 'review' ? 'due' : 'recognize',
    );
    return {
      ...activity,
      ...selected,
      id: activity.id,
      conceptId: activity.conceptId,
    };
  }
  const intent = activity.intent ?? intentFor(activity.type);
  return {
    ...activity,
    intent,
    dimension: activity.intent
      ? activity.dimension
      : dimensionForIntent(intent),
  };
}
export function sessionView(
  id: string,
  s: SessionRecord,
  catalog: Catalog,
  state: LearnerState = replay(catalog, s.events),
) {
  const a = s.current ? presentedActivity(catalog, state, s.current) : null;
  const item = a ? catalog.items[a.conceptId] : undefined;
  const hinted =
    !!a &&
    s.events.some((e) => e.activityId === a.id && e.type === 'hint_used');
  const presentation = coursePresentation(catalog);
  const visible = a?.phase === 'exposure' || hinted;
  const learnerRole =
    a?.type === 'roleplay_a' ? 'A' : a?.type === 'roleplay_b' ? 'B' : null;
  const dialogueCues =
    learnerRole && Array.isArray(item?.raw.turns)
      ? (
          item.raw.turns as {
            speaker: string;
            telugu: string;
            romanization: string;
            meaning: Record<string, string>;
          }[]
        ).filter((t) => t.speaker !== learnerRole)
      : [];
  const intent = a?.intent;
  const meaningTask = intent?.answer === 'meaning';
  const listening = intent?.skill === 'listening' || intent?.cue === 'audio';
  const audioPractice = intent?.response === 'speak';
  const recallTask =
    !!a &&
    a.phase !== 'exposure' &&
    !meaningTask &&
    !listening &&
    intent?.answer !== 'choice' &&
    !item?.openResponse &&
    !learnerRole;
  // A hidden answer still needs a visible retrieval cue, including due reviews
  // and sessions created before mediaCueId was attached to activities.
  const mediaCue = a?.mediaCueId
    ? catalog.items[a.mediaCueId]?.media
    : recallTask
      ? (item?.media ??
        item?.dependencies
          .map((id) => catalog.items[id]?.media)
          .find(Boolean) ??
        null)
      : null;
  const recallCue = recallTask
    ? (item?.meaning[presentation.baseLanguage.code] ?? null)
    : null;
  const context = item?.context ? catalog.items[item.context.id] : undefined;
  const contextCue =
    item &&
    (intent?.cue === 'context' || (!item.media && a?.phase === 'exposure'))
      ? {
          meaning: contextSupport(item)[presentation.baseLanguage.code] ?? '',
          meaningVisible:
            a?.phase === 'exposure' ||
            !context ||
            (state.concepts[context.id]?.dimensions.listening_recognition ??
              0) < 2 ||
            (state.concepts[context.id]?.dimensions.spoken_production ?? 0) < 2,
          ...(context &&
          !!state.concepts[context.id] &&
          context.dependencies.every((id) => !!state.concepts[id])
            ? {
                text: context.telugu.replaceAll(item.telugu, '___'),
                romanization: context.romanization.replaceAll(
                  item.romanization,
                  '___',
                ),
              }
            : {}),
        }
      : null;
  const choices =
    a?.choiceIds
      ?.map((choiceId) => catalog.items[choiceId])
      .filter((choice): choice is ContentItem => !!choice)
      .map((choice) => publicItem(choice, false)) ?? [];
  const targetAudio = item
    ? a?.type === 'pattern_discovery' && item.context
      ? item.context.text
      : item.telugu
    : undefined;
  const parts = item?.telugu.trim().split(/\s+/).filter(Boolean) ?? [];
  const tiles =
    a &&
    item &&
    a.phase !== 'assessment' &&
    item.dependencyComplete &&
    ['combination_recall', 'sentence_construction', 'word_order'].includes(
      a.type,
    ) &&
    parts.length >= 2 &&
    allowedActivity(catalog, state, a)
      ? parts
          .map((text, index) => ({
            id: `${item.id}:part-${index}`,
            text: text.replace(/[\p{P}]+$/gu, ''),
          }))
          .reverse()
      : undefined;
  return {
    id,
    status: s.status,
    version: s.version,
    cursor: s.cursor,
    total: s.plan.activities.length,
    allowance: s.plan.allowance,
    level: s.plan.level,
    presentation,
    summary: sessionSummary(s),
    activity:
      a && item
        ? {
            ...a,
            support: activitySupport(a, state),
            tiles,
            dialogueCues,
            learnerRole,
            target: visible ? publicItem(item) : null,
            prompt:
              a.type === 'pattern_discovery'
                ? 'What does this familiar pattern express?'
                : meaningTask
                  ? 'What does this expression mean?'
                  : a.prompt,
            stimulus:
              meaningTask || intent?.cue === 'target_text'
                ? { telugu: item.telugu, romanization: item.romanization }
                : null,
            mediaCue,
            recallCue,
            contextCue,
            audio:
              listening || audioPractice || visible
                ? {
                    text: targetAudio!,
                    language: presentation.targetLanguage.speechLocale,
                    speed: item.audioSpeed,
                    url: item.audio ?? null,
                  }
                : null,
            choices,
            openResponse: item.openResponse,
            canReveal: a.phase !== 'assessment',
            hinted,
          }
        : null,
  };
}
export function createSessionService(content = loadContent()) {
  const { catalog, hash } = content;
  const baseLanguage =
    (catalog.master.baseLanguage as { default?: string } | null)?.default ??
    'en';
  const knownAnswers = new Set(
    Object.values(catalog.items)
      .filter((item) => item.family === 'lexicalConcepts')
      .flatMap((item) =>
        acceptedVariants(meaningAnswerSpec(item, baseLanguage)),
      ),
  );
  function nextSafe(
    plan: SessionRecord['plan'],
    start: number,
    state: ReturnType<typeof replay>,
  ) {
    let cursor = start;
    while (
      cursor < plan.activities.length &&
      !allowedActivity(catalog, state, plan.activities[cursor]!)
    )
      cursor++;
    return { cursor, current: plan.activities[cursor] ?? null };
  }
  async function owned(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw missing();
    const s = await LearningSession.findOne({ _id: id, userId });
    if (!s) throw missing();
    if (s.sourceHash !== hash)
      throw new ApiError(
        409,
        'content_changed',
        'Course content changed. Finish this session and start another.',
      );
    return s;
  }
  return {
    async start(userId: string, minutes = 60) {
      const existing = await LearningSession.findOne({
        userId,
        status: 'active',
      });
      if (existing)
        return sessionView(
          existing.id,
          existing,
          catalog,
          replay(catalog, await learnerEvents(userId)),
        );
      const events = await learnerEvents(userId);
      const state = replay(catalog, events);
      const plan = buildPlan(catalog, state, Date.now(), minutes);
      const first = nextSafe(plan, 0, state);
      try {
        const s = await LearningSession.create({
          userId,
          status: 'active',
          sourceHash: hash,
          plan,
          cursor: first.cursor,
          current: first.current,
          events: [],
          version: 0,
          startedAt: new Date(),
        });
        return sessionView(s.id, s, catalog);
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          const s = await LearningSession.findOne({ userId, status: 'active' });
          if (s) return sessionView(s.id, s, catalog);
        }
        throw error;
      }
    },
    async get(userId: string, id: string) {
      const s = await owned(userId, id);
      return sessionView(
        s.id,
        s,
        catalog,
        replay(catalog, await learnerEvents(userId)),
      );
    },
    async active(userId: string) {
      const s = await LearningSession.findOne({ userId, status: 'active' });
      return s
        ? sessionView(
            s.id,
            s,
            catalog,
            replay(catalog, await learnerEvents(userId)),
          )
        : null;
    },
    async act(userId: string, id: string, input: Action) {
      const s = await owned(userId, id);
      const duplicate = s.events.find((e) => e.id === input.eventId);
      if (duplicate) {
        const item = catalog.items[duplicate.conceptId ?? ''];
        const activity =
          s.plan.activities.find((a) => a.id === duplicate.activityId) ??
          s.current;
        const result =
          duplicate.type === 'activity_answered' && item && activity
            ? evaluate(
                item,
                activity.type,
                {
                  response: duplicate.response ?? '',
                  inputMode: duplicate.inputMode ?? 'text',
                  latencyMs: duplicate.latencyMs ?? 0,
                  selfRating: duplicate.selfRating,
                },
                false,
                {
                  baseLanguage,
                  knownAnswers,
                  intent: activity.intent ?? intentFor(activity.type),
                },
              )
            : null;
        return {
          session: sessionView(s.id, s, catalog),
          feedback: result?.feedback ?? 'Your progress is saved.',
          classification: result?.classification,
          target: item ? publicItem(item) : null,
          evidence: duplicate.evidence,
        };
      }
      if (
        s.status !== 'active' ||
        !s.current ||
        s.current.id !== input.activityId
      )
        throw new ApiError(
          409,
          'activity_changed',
          'Reload the session to continue.',
        );
      if (s.events.length >= 3000)
        throw new ApiError(
          409,
          'session_full',
          'Finish this session and continue in a new one.',
        );
      const all = await learnerEvents(userId);
      const state = replay(catalog, all);
      const a = presentedActivity(catalog, state, s.current);
      const item = catalog.items[a.conceptId];
      const at = Date.now();
      const event: LearningEvent = {
        id: input.eventId,
        sessionId: s.id,
        sequence: Math.max(at * 1000, (all.at(-1)?.sequence ?? 0) + 1),
        at,
        type: 'activity_answered',
        conceptId: item.id,
        activityId: a.id,
        dimension: a.dimension,
        evaluationSkill: a.intent?.skill,
        reviewPurpose:
          a.reviewPurpose ?? (a.phase === 'review' ? 'due' : undefined),
        contextId: item.context?.id ?? item.id,
      };
      let feedback = '';
      let advance = false;
      let classification: AnswerClassification | undefined;
      if (input.action === 'hint') {
        if (a.phase === 'assessment')
          throw new ApiError(
            400,
            'support_restricted',
            'Assessment support is restricted.',
          );
        event.type = 'hint_used';
      } else if (input.action === 'audio') {
        event.type = 'audio_played';
      } else if (input.action === 'expose') {
        if (a.phase !== 'exposure')
          throw new ApiError(
            400,
            'invalid_activity',
            'This is not an introduction.',
          );
        event.type = 'concept_exposed';
        advance = true;
      } else {
        if (a.phase === 'exposure' || !allowedActivity(catalog, state, a))
          throw new ApiError(
            409,
            'explanation_required',
            'Learn the expression before attempting recall.',
          );
        const hinted = s.events.some(
          (e) => e.activityId === a.id && e.type === 'hint_used',
        );
        const heard = s.events.some(
          (e) => e.activityId === a.id && e.type === 'audio_played',
        );
        const result = evaluate(
          item,
          a.type,
          input,
          hinted || (heard && a.dimension !== 'listening_recognition'),
          { baseLanguage, knownAnswers, intent: a.intent },
        );
        if (a.dimension === 'listening_recognition' && !heard)
          result.evidence = 'unverified';
        event.evidence = result.evidence;
        event.response = input.response;
        event.inputMode = input.inputMode;
        event.latencyMs = input.latencyMs;
        event.selfRating = input.selfRating;
        feedback = result.feedback;
        classification = result.classification;
        advance = !classification || classification === 'correct';
      }
      let cursor = s.cursor;
      let current: Activity | null = a;
      if (advance) {
        if (!a.id.startsWith('reinforce-') && !a.id.startsWith('recover-'))
          cursor++;
        const updatedState = replay(catalog, [...all, event]);
        const completed = new Set(
          [...s.events, event]
            .filter((e) => e.type === 'activity_answered')
            .map((e) => e.activityId!),
        );
        const reinforcement = nextReinforcement(
          catalog,
          updatedState,
          at,
          s.id,
          completed,
        );
        if (
          reinforcement &&
          allowedActivity(catalog, updatedState, reinforcement)
        )
          current = reinforcement;
        else {
          const next = nextSafe(s.plan, cursor, updatedState);
          cursor = next.cursor;
          current = next.current;
        }
        if (a.id.startsWith('recover-') && a.phase === 'exposure') {
          const selected = selectRetrievalActivity(
            catalog,
            item,
            updatedState,
            'listen',
          );
          current = {
            ...a,
            ...selected,
            id: `recover-retrieval-${s.version}`,
            phase: 'practice',
          };
        }
        const lexicalCount = [...s.events, event].filter(
          (e) =>
            e.type === 'concept_exposed' &&
            catalog.items[e.conceptId ?? '']?.family === 'lexicalConcepts',
        ).length;
        if (
          current?.phase === 'exposure' &&
          catalog.items[current.conceptId]?.family === 'lexicalConcepts' &&
          lexicalCount >= allowance(updatedState, at, s.plan.nominalMinutes)
        ) {
          const remaining = s.plan.activities
            .slice(cursor)
            .findIndex(
              (a) =>
                a.phase === 'review' && !!updatedState.concepts[a.conceptId],
            );
          if (remaining >= 0) {
            cursor += remaining;
            current = s.plan.activities[cursor];
          } else current = null;
        }
      }
      if (
        !advance &&
        input.action === 'answer' &&
        classification === 'incorrect'
      ) {
        const failures = [...s.events, event].filter(
          (e) => e.activityId === a.id && e.evidence === 'incorrect',
        ).length;
        if (failures >= 2 && a.intent?.skill !== 'writing') {
          current = {
            ...a,
            id: `recover-${a.id}-${s.version}`,
            type: 'concept_introduction',
            phase: 'exposure',
            intent: intentFor('concept_introduction'),
            dimension: 'meaning_recognition',
            choiceIds: undefined,
            mediaCueId: undefined,
          };
        }
      }
      const updated = await LearningSession.findOneAndUpdate(
        { _id: s.id, userId, version: s.version },
        {
          $push: { events: event },
          $set: { cursor, current },
          $inc: { version: 1 },
        },
        { new: true },
      );
      if (!updated)
        throw new ApiError(
          409,
          'concurrent_update',
          'Progress changed in another tab; reload to continue.',
        );
      return {
        session: sessionView(
          updated.id,
          updated,
          catalog,
          replay(catalog, [...all, event]),
        ),
        feedback,
        classification,
        target: input.action === 'audio' ? null : publicItem(item),
        evidence: event.evidence,
      };
    },
    async finish(userId: string, id: string, eventId: string) {
      const s = await owned(userId, id);
      if (s.status === 'completed') return sessionView(s.id, s, catalog);
      const at = Date.now();
      const event: LearningEvent = {
        id: eventId,
        sessionId: s.id,
        sequence: at * 1000,
        at,
        type: 'session_completed',
      };
      const updated = await LearningSession.findOneAndUpdate(
        { _id: id, userId, status: 'active', version: s.version },
        {
          $set: { status: 'completed', completedAt: new Date(), current: null },
          $push: { events: event },
          $inc: { version: 1 },
        },
        { new: true },
      );
      if (!updated)
        throw new ApiError(
          409,
          'concurrent_update',
          'Reload to finish this session.',
        );
      return sessionView(updated.id, updated, catalog);
    },
    async assessment(userId: string) {
      const events = await learnerEvents(userId);
      const state = replay(catalog, events);
      const used = new Set(
        events
          .map((e) =>
            normalizeAnswer(
              catalog.items[e.assessmentId ?? e.conceptId ?? '']?.prompt.en ??
                '',
            ),
          )
          .filter(Boolean),
      );
      const item = Object.values(catalog.items).find(
        (i) =>
          i.family === 'unseenSpeakingAssessments' &&
          i.level === state.level &&
          !used.has(normalizeAnswer(i.prompt.en)),
      );
      return item ? publicItem(item) : null;
    },
    async submitAssessment(userId: string, id: string, response: string) {
      const events = await learnerEvents(userId);
      const state = replay(catalog, events);
      const item = catalog.items[id];
      if (
        !item ||
        !item.unseen ||
        item.level !== state.level ||
        events.some(
          (e) =>
            normalizeAnswer(
              catalog.items[e.assessmentId ?? e.conceptId ?? '']?.prompt.en ??
                '',
            ) === normalizeAnswer(item.prompt.en),
        )
      )
        throw new ApiError(
          409,
          'assessment_unavailable',
          'This assessment is unavailable or has already been attempted.',
        );
      const session = await this.start(userId, 60);
      const s = await owned(userId, session.id);
      const at = Date.now();
      const event: LearningEvent = {
        id: randomUUID(),
        sessionId: s.id,
        sequence: at * 1000,
        at,
        type: 'assessment_attempted',
        assessmentId: id,
        level: item.level,
        response,
        unseen: true,
        evidence: 'unverified',
      };
      const updated = await LearningSession.updateOne(
        { _id: s.id, version: s.version },
        { $push: { events: event }, $inc: { version: 1 } },
      );
      if (!updated.modifiedCount)
        throw new ApiError(409, 'concurrent_update', 'Reload and try again.');
      return {
        attemptId: event.id,
        message: 'Your response is saved. Keep practising!',
      };
    },
  };
}
