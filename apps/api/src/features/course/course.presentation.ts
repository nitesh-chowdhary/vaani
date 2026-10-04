import type { Catalog, LearnerState, Activity } from '@vaani/learning-core';

// Authored content keeps its language-specific fields. Clients receive an
// explicit language contract for presentation and platform audio adapters.
export function coursePresentation(catalog: Catalog) {
  const target = catalog.master.targetLanguage as {
    code: string;
    name: string;
    nativeName?: string;
  };
  const base = catalog.master.baseLanguage as { default: string; name: string };
  const languageOptions: Record<
    string,
    { speechLocale: string; hasRomanization: boolean }
  > = {
    te: { speechLocale: 'te-IN', hasRomanization: true },
  };
  return {
    targetLanguage: {
      ...target,
      ...(languageOptions[target.code] ?? {
        speechLocale: target.code,
        hasRomanization: false,
      }),
    },
    baseLanguage: { code: base.default, name: base.name },
  };
}

export function activitySupport(
  activity: Activity | null,
  state?: LearnerState,
) {
  const dimensions = activity
    ? state?.concepts[activity.conceptId]?.dimensions
    : undefined;
  const confident =
    (dimensions?.independent_recall ?? 0) >= 4 &&
    (dimensions?.spoken_production ?? 0) >= 3 &&
    (dimensions?.delayed_recall ?? 0) >= 2;
  const recent =
    state?.events
      .filter(
        (event) =>
          event.conceptId === activity?.conceptId &&
          event.type === 'activity_answered',
      )
      .slice(-3) ?? [];
  const needsSupport = recent.some(
    (event) => event.evidence === 'incorrect' || event.evidence === 'hinted',
  );
  return {
    romanizationDefault:
      activity?.phase === 'exposure' || !confident || needsSupport,
  };
}
