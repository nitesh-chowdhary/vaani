import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  replay,
  intentFor,
  type Master,
} from '@vaani/learning-core';
import { buildCatalog } from '@vaani/learning-core';
import { sessionView } from './sessions.service.js';
import type { SessionRecord } from './sessions.model.js';

const master = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../VAANI_TELUGU_A0_C2_FINAL_MASTER.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Master;
const catalog = buildCatalog(master);
const plan = buildPlan(catalog, replay(catalog, []), Date.now(), 60);
const record = (index: number): SessionRecord => ({
  userId: 'test-user',
  status: 'active',
  sourceHash: 'test-hash',
  plan,
  cursor: index,
  current: plan.activities[index] ?? null,
  events: [],
  version: 0,
  startedAt: new Date(),
});

describe('beginner session presentation', () => {
  it('returns a photographed, fully explained word without its sentence context on first exposure', () => {
    const view = sessionView('test-session', record(0), catalog);
    const target = view.activity?.target;
    expect(target?.id).toBe('te.lex.water');
    expect(target?.telugu).toBe('నీళ్లు');
    expect(target?.romanization).toBe('neellu');
    expect(target?.meaning.en).toBe('water');
    expect(target?.media?.url).toBe('/media/telugu/beginner/water.jpg');
    expect(target?.media?.attribution?.sourceUrl).toContain(
      'unsplash.com/photos/',
    );
    expect(target?.context).toBeUndefined();
    expect(view.activity?.audio?.text).toBe('నీళ్లు');
  });
  it('returns only already introduced word choices with their photographs', () => {
    const view = sessionView('test-session', record(2), catalog);
    expect(view.activity?.type).toBe('image_word_recognition');
    expect(view.activity?.target).toBeNull();
    expect(view.activity?.choices.map((choice) => choice.id)).toEqual([
      'te.lex.water',
      'te.lex.tea',
    ]);
    expect(
      view.activity?.choices.every((choice) =>
        choice.media?.url?.endsWith('.jpg'),
      ),
    ).toBe(true);
    expect(view.activity?.mediaCue?.url).toBe(
      '/media/telugu/beginner/water.jpg',
    );
  });
});

describe('hidden-answer recall cues', () => {
  it.each([
    ['te.lex.water', 'water'],
    ['te.lex.want-need', 'want / need'],
  ])(
    'provides a visible meaning cue for due recall of %s',
    (conceptId, meaning) => {
      const s = record(0);
      s.current = {
        id: 'due-review',
        conceptId,
        type: 'delayed_recall',
        phase: 'review',
        dimension: 'delayed_recall',
        prompt: 'Recall this again after other material.',
      };
      const activity = sessionView('test-session', s, catalog).activity!;
      expect(activity.target).toBeNull();
      expect(activity.stimulus).toBeNull();
      expect(activity.recallCue).toBe(meaning);
      if (conceptId === 'te.lex.water')
        expect(activity.mediaCue?.url).toBe('/media/telugu/beginner/water.jpg');
    },
  );
  it('does not reveal the meaning during a meaning recall test', () => {
    const s = record(0);
    s.current = {
      id: 'meaning-review',
      conceptId: 'te.lex.water',
      type: 'meaning_recall',
      intent: intentFor('meaning_recall'),
      phase: 'review',
      dimension: 'meaning_recognition',
      prompt: 'What does it mean?',
    };
    const activity = sessionView('test-session', s, catalog).activity!;
    expect(activity.recallCue).toBeNull();
    expect(activity.mediaCue).toBeNull();
    expect(activity.stimulus?.telugu).toBe('నీళ్లు');
  });
});

it('uses taught target-language context with the answer blanked and meaning available as support', () => {
  const s = record(0);
  s.current = {
    id: 'context-recall',
    conceptId: 'te.lex.want-need',
    type: 'contextual_recall',
    phase: 'practice',
    dimension: 'contextual_response',
    prompt: '',
    intent: intentFor('contextual_recall'),
  };
  const state = replay(
    catalog,
    ['te.lex.want-need', 'te.lex.water', 'g01', 'te.sent.00001'].map(
      (conceptId, i) => ({
        id: `known-${i}`,
        sessionId: 's',
        sequence: i,
        at: Date.now(),
        type: 'concept_exposed' as const,
        conceptId,
      }),
    ),
  );
  state.concepts['te.sent.00001']!.dimensions = {
    listening_recognition: 2,
    spoken_production: 2,
  };
  const a = sessionView('test-session', s, catalog, state).activity!;
  expect(a.target).toBeNull();
  expect(a.contextCue?.text).toBe('నాకు నీళ్లు ___.');
  expect(a.contextCue?.romanization).toBe('naaku neellu ___.');
  expect(a.contextCue?.meaningVisible).toBe(false);
});
