import { readFileSync, writeFileSync } from 'node:fs';
import {
  buildCatalog,
  buildPlan,
  replay,
  allowedActivity,
  evaluate,
  shouldSuppressActivity,
} from '../packages/learning-core/dist/index.js';
const catalog = buildCatalog(
  JSON.parse(
    readFileSync(
      new URL('../VAANI_TELUGU_A0_C2_FINAL_MASTER.json', import.meta.url),
    ),
  ),
);
const now = 1700000000000;
let state = replay(catalog, []),
  sequence = 0;
const trace = [];
for (let session = 0; session < 6 && trace.length < 100; session++) {
  const plan = buildPlan(catalog, state, now + session * 60000);
  for (const activity of plan.activities) {
    if (trace.length >= 100) break;
    if (
      !allowedActivity(catalog, state, activity, now + session * 60000) ||
      shouldSuppressActivity(catalog, state, activity)
    )
      continue;
    const item = catalog.items[activity.conceptId];
    const turn = activity.type.startsWith('roleplay')
      ? item.raw.turns?.find(
          (t) => t.speaker === (activity.type === 'roleplay_b' ? 'B' : 'A'),
        )
      : undefined;
    const result =
      activity.phase === 'exposure'
        ? undefined
        : evaluate(
            item,
            activity.type,
            {
              response: activity.choiceIds
                ? item.id
                : (turn?.telugu ?? item.telugu),
              inputMode:
                activity.intent?.response === 'speak' ? 'speech' : 'text',
              latencyMs: 1000,
            },
            false,
            { intent: activity.intent },
          );
    trace.push({
      index: trace.length + 1,
      id: item.id,
      family: item.family,
      type: activity.type,
      response: activity.intent?.response,
      target: item.telugu,
    });
    const event = {
      id: `trace-${++sequence}`,
      sessionId: `trace-${session}`,
      sequence,
      at: now + session * 60000 + sequence,
      type:
        activity.phase === 'exposure' ? 'concept_exposed' : 'activity_answered',
      conceptId: item.id,
      activityId: activity.id,
      dimension: result?.recallOnly ? 'independent_recall' : activity.dimension,
      evidence: result?.evidence,
      inputMode: activity.intent?.response === 'speak' ? 'speech' : 'text',
      evaluationSkill: activity.intent?.skill,
    };
    state = replay(catalog, [...state.events, event]);
  }
}
function metrics(rows) {
  const lexical = rows.filter((x) => x.family === 'lexicalConcepts'),
    sentence = rows.filter((x) => x.family === 'sentenceBank');
  const repeats = Object.fromEntries(
    [...new Set(lexical.map((x) => x.id))].map((id) => [
      id,
      lexical.filter((x) => x.id === id).length,
    ]),
  );
  return {
    activities: rows.length,
    isolatedVocabulary: lexical.length,
    uniqueVocabulary: new Set(lexical.map((x) => x.id)).size,
    sentences: sentence.length,
    uniqueSentences: new Set(sentence.map((x) => x.id)).size,
    spokenWords: lexical.filter((x) => x.response === 'speak').length,
    spokenSentences: sentence.filter((x) => x.response === 'speak').length,
    contextualOrDialogue: rows.filter(
      (x) => x.type === 'contextual_recall' || x.type.startsWith('roleplay'),
    ).length,
    dialogueTurns: rows.filter((x) => x.type.startsWith('roleplay')).length,
    highestIsolatedRepeat: Math.max(0, ...Object.values(repeats)),
    averageIsolatedRepeats:
      lexical.length / Math.max(1, Object.keys(repeats).length),
    identicalAdjacent: rows.filter(
      (x, i) => i && x.id === rows[i - 1].id && x.type === rows[i - 1].type,
    ).length,
    firstSpokenWord: lexical.find((x) => x.response === 'speak')?.index ?? null,
    firstSpokenSentence:
      sentence.find((x) => x.response === 'speak')?.index ?? null,
    firstQuestionResponse:
      rows.find((x) => x.type.startsWith('roleplay') && /[?？]/u.test(x.target))
        ?.index ?? null,
    firstDialogue:
      rows.find((x) => x.type.startsWith('roleplay'))?.index ?? null,
  };
}
const output = {
  first100: metrics(trace),
  first50: metrics(trace.slice(0, 50)),
  activities: trace,
};
writeFileSync(
  process.argv[2] ?? 'docs/learner-traces/after.json',
  JSON.stringify(output, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    { first100: output.first100, first50: output.first50 },
    null,
    2,
  ),
);
