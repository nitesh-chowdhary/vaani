import { mediaForConcept } from './media.js';
import { transliterateTelugu } from './romanize.js';
import { validateMaster } from './validate.js';
import { expandAuthoredAlternatives } from '../assessment/answer-matcher.js';
import {
  normalizeAnswer,
  type Catalog,
  type ContentItem,
  type Gloss,
  type Json,
  type Level,
  type Meaning,
  type RecordData,
  type SourceRecord,
} from './types.js';

const obj = (x: Json | undefined): RecordData =>
  x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const str = (x: Json | undefined) => (typeof x === 'string' ? x : '');
const meaning = (x: Json | undefined): Meaning =>
  Object.fromEntries(
    Object.entries(obj(x)).filter(
      (pair): pair is [string, string] => typeof pair[1] === 'string',
    ),
  );
const contains = (text: string, part: string) =>
  (' ' + normalizeAnswer(text) + ' ').includes(
    ' ' + normalizeAnswer(part) + ' ',
  );
const unique = (values: string[]) => [...new Set(values)];
const strings = (value: Json | undefined): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
function meaningAliases(
  record: SourceRecord,
  baseLanguage: string,
): Record<string, string[]> {
  const aliases: Record<string, string[]> = {};
  const add = (language: string, values: string[]) => {
    aliases[language] = unique([...(aliases[language] ?? []), ...values]);
  };
  for (const field of [record.acceptedMeanings, record.meaningAliases])
    for (const [language, value] of Object.entries(obj(field)))
      add(language, strings(value));
  for (const variant of Array.isArray(record.variants) ? record.variants : []) {
    const value = obj(variant).meaning;
    if (typeof value === 'string') add(baseLanguage, [value]);
    else
      for (const [language, text] of Object.entries(meaning(value)))
        add(language, [text]);
  }
  return aliases;
}

function templateSlot(text: string, pattern: string): string | undefined {
  const [before, after, ...rest] = pattern.split('___');
  if (rest.length || after === undefined) return undefined;
  const normalized = normalizeAnswer(text);
  const prefix = normalizeAnswer(before ?? '');
  const suffix = normalizeAnswer(after);
  if (!normalized.startsWith(prefix) || !normalized.endsWith(suffix))
    return undefined;
  const end = suffix ? normalized.length - suffix.length : normalized.length;
  return normalized.slice(prefix.length, end).trim() || undefined;
}

export function buildCatalog(raw: unknown): Catalog {
  const master = validateMaster(raw);
  const items: Record<string, ContentItem> = {};
  const counts: Record<string, number> = {};
  const warnings: string[] = [];
  for (const [family, value] of Object.entries(master)) {
    if (!Array.isArray(value)) continue;
    counts[family] = value.length;
    for (const record of value) {
      const r = obj(record) as SourceRecord;
      if (!r.id) continue;
      const turns = Array.isArray(r.turns) ? r.turns.map(obj) : [];
      const text =
        str(
          r.spokenTelugu ??
            r.telugu ??
            r.teluguPattern ??
            r.exampleTelugu ??
            r.pattern ??
            r.transcriptTelugu ??
            r.everydayOrCasual,
        ) || turns.map((t) => str(t.telugu)).join(' ');
      const gloss = meaning(
        r.meaning ??
          r.meaningPattern ??
          r.exampleMeaning ??
          r.summary ??
          r.interpretationGuide,
      );
      if (!gloss.en && turns.length)
        gloss.en = turns.map((t) => str(obj(t.meaning).en)).join(' ');
      const roman =
        (r.exampleTelugu
          ? transliterateTelugu(text)
          : str(r.romanization ?? r.romanizationPattern)) ||
        turns.map((t) => str(t.romanization)).join(' ') ||
        (text ? transliterateTelugu(text) : '');
      const prompt = meaning(r.instruction ?? r.prompt ?? r.topic ?? r.task);
      if (!prompt.en)
        prompt.en =
          str(
            r.title ??
              r.name ??
              r.goal ??
              r.rule ??
              r.teachingNote ??
              r.usageNote ??
              r.stimulus,
          ) ||
          gloss.en ||
          '';
      const imageUrl = str(r.imageUrl ?? r.image);
      items[r.id] = {
        id: r.id,
        family,
        level: (r.level ?? 'A1') as Level,
        telugu: text,
        romanization: roman,
        meaning: gloss,
        prompt,
        glosses: [],
        dependencies: Array.isArray(r.dependencies)
          ? r.dependencies.filter((d): d is string => typeof d === 'string')
          : [],
        acceptedAnswers: unique(
          [
            text,
            roman,
            ...strings(r.acceptedAnswers),
            ...strings(r.aliases),
            ...strings(obj(r.acceptedAnswers).te),
            ...strings(obj(r.acceptedAnswers).romanization),
            ...(Array.isArray(r.variants)
              ? r.variants
                  .flatMap((v) =>
                    typeof v === 'string'
                      ? [v]
                      : [str(obj(v).form), str(obj(v).romanization)],
                  )
                  .filter(Boolean)
              : []),
          ].filter(Boolean),
        ),
        acceptedMeanings: meaningAliases(
          r,
          str(obj(master.baseLanguage).default) || 'en',
        ),
        register: str(r.register) || 'context-dependent',
        reviewStatus: str(r.reviewStatus) || 'native_review_required',
        audioSpeed: str(r.audioSpeed) || 'clear',
        productionReady:
          !!text && !!gloss.en && !!roman && !text.includes('___'),
        explicitInference: r.allowUnknownInference === true,
        unseen: r.unseen === true,
        openResponse:
          r.noSingleScriptedAnswer === true ||
          [
            'situationBasedTasks',
            'abstractTopicModules',
            'impliedMeaningAndHumour',
            'narrativeStorytelling',
            'argumentationAndReasoning',
            'mediationAndSynthesis',
          ].includes(family),
        ...(family === 'lexicalConcepts'
          ? {
              media: mediaForConcept({
                id: r.id,
                topic: str(r.topic),
                english: gloss.en,
                imageUrl,
              }),
            }
          : {}),
        dependencyComplete: family === 'lexicalConcepts',
        raw: r,
      };
    }
  }
  const lexical = Object.values(items).filter(
    (i) => i.family === 'lexicalConcepts',
  );
  for (const item of Object.values(items))
    if (item.family !== 'lexicalConcepts')
      for (const [language, display] of Object.entries(item.meaning)) {
        const authoredGroups = lexical
          .map((lex) => lex.meaning[language] ?? '')
          .filter((value) => value.includes('/'));
        item.acceptedMeanings ??= {};
        item.acceptedMeanings[language] = unique([
          ...(item.acceptedMeanings[language] ?? []),
          ...expandAuthoredAlternatives(display, authoredGroups),
        ]);
      }
  const patterns = Object.values(items).filter(
    (i) => i.family === 'grammarInUse' && str(i.raw.pattern).includes('___'),
  );
  const contexts = Object.values(items).filter(
    (i) =>
      [
        'sentenceBank',
        'dialogues',
        'listeningScripts',
        'collocations',
      ].includes(i.family) && i.productionReady,
  );
  const makeGloss = (i: ContentItem): Gloss => ({
    id: i.id,
    text: i.telugu,
    romanization: i.romanization,
    meaning: i.meaning,
    kind: i.family === 'lexicalConcepts' ? 'lexical' : 'chunk',
  });
  for (const item of Object.values(items)) {
    if (item.telugu && item.meaning.en) {
      item.glosses.push(makeGloss(item));
      for (const lex of lexical) {
        if (
          lex.id !== item.id &&
          normalizeAnswer(lex.telugu).length > 1 &&
          contains(item.telugu, lex.telugu)
        ) {
          item.glosses.push(makeGloss(lex));
          item.dependencies.push(lex.id);
        }
      }
    }
    if (item.family === 'lexicalConcepts') {
      const context = contexts.find((candidate) =>
        contains(candidate.telugu, item.telugu),
      );
      if (context) item.context = makeGloss(context);
      else {
        item.productionReady = false;
        warnings.push(
          `${item.id}: no authored contextual example; visual/word teaching remains available`,
        );
      }
    }
    if (item.family === 'grammarInUse') {
      const pattern = str(item.raw.pattern);
      const example = contexts.find((candidate) =>
        templateSlot(candidate.telugu, pattern),
      );
      if (example) item.context = makeGloss(example);
      item.dependencyComplete = true;
    }
  }
  for (const item of Object.values(items)) {
    if (item.family === 'sentenceBank') {
      const matched = patterns.find(
        (pattern) =>
          templateSlot(item.telugu, str(pattern.raw.pattern)) !== undefined,
      );
      if (matched) {
        const slot = templateSlot(item.telugu, str(matched.raw.pattern));
        const slotConcept = lexical.find(
          (candidate) => normalizeAnswer(candidate.telugu) === slot,
        );
        item.dependencies = unique([
          ...item.dependencies,
          matched.id,
          ...(slotConcept ? [slotConcept.id] : []),
        ]);
        item.dependencyComplete = Boolean(slotConcept);
      }
    }
    if (item.family === 'exerciseInstances') {
      const source =
        items[
          str(
            item.raw.sourceSentenceId ??
              item.raw.sourceDialogueId ??
              item.raw.sourceListeningId,
          )
        ];
      if (source) {
        item.dependencies = [source.id];
        item.productionReady = source.productionReady;
        item.dependencyComplete = source.dependencyComplete;
      }
    }
    item.dependencies = unique(item.dependencies);
  }
  return {
    master,
    items,
    order: Object.keys(items),
    sections: master,
    counts,
    warnings,
  };
}

export function resolveConcept(catalog: Catalog, id: string): ContentItem {
  const item = catalog.items[id];
  if (!item) throw new Error(`Unknown content ID: ${id}`);
  return item;
}
export function resolveGloss(
  catalog: Catalog,
  id: string,
  text?: string,
): Gloss | undefined {
  const item = catalog.items[id];
  return item?.glosses.find(
    (g) => !text || normalizeAnswer(g.text) === normalizeAnswer(text),
  );
}
