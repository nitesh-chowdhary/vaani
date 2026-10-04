import { intentFor } from '@vaani/learning-core';
import { sessionView } from '../sessions/sessions.service.js';
import { loadContent } from './content.service.js';
import { mediaResolver } from './media.resolver.js';
import type { ConceptMedia } from '@vaani/learning-core';
export type SessionView = ReturnType<typeof sessionView>;
// Transport/presentation adaptation keeps IDs, dependencies and learner events.
// SRS timing and the underlying answer identities are unchanged.
export async function prepareSessionMedia(
  session: SessionView,
  withoutMedia = false,
  resolve = mediaResolver.resolve,
): Promise<SessionView> {
  const activity = session.activity;
  if (!activity) return session;
  const usable = async (media?: ConceptMedia | null) =>
    !media || withoutMedia ? undefined : (await resolve(media)).media;
  const [cue, targetMedia, choices] = await Promise.all([
    usable(activity.mediaCue),
    usable(activity.target?.media),
    Promise.all(
      (activity.choices ?? []).map(async (choice) => ({
        ...choice,
        media: await usable(choice.media),
      })),
    ),
  ]);
  const failedChoices =
    activity.choiceMode === 'media' && choices.some((c) => !c.media);
  const failedCue = activity.intent?.cue === 'media' && !cue;
  const fallback = failedChoices || failedCue;
  const item = loadContent().catalog.items[activity.conceptId];
  const type = fallback
    ? choices.length
      ? 'audio_target_recognition'
      : 'contextual_recall'
    : activity.type;
  // A word recall with missing photography still has context/meaning + speech.
  return {
    ...session,
    activity: {
      ...activity,
      type,
      intent: fallback
        ? { ...intentFor(type), skill: activity.intent?.skill ?? 'listening' }
        : activity.intent,
      choiceMode: failedChoices ? 'telugu' : activity.choiceMode,
      mediaCue: cue ?? null,
      target: activity.target
        ? { ...activity.target, media: targetMedia }
        : null,
      choices,
      audio: fallback
        ? {
            text: item.telugu,
            language: session.presentation.targetLanguage.speechLocale,
            speed: item.audioSpeed,
            url: item.audio ?? null,
          }
        : activity.audio,
    },
  };
}

export async function prepareTargetMedia<T extends { media?: ConceptMedia }>(
  target: T | null,
): Promise<T | null> {
  if (!target?.media) return target;
  const result = await mediaResolver.resolve(target.media);
  return { ...target, media: result.media };
}
