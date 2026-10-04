import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../app/app.js';
import { loadConfig } from '../../infrastructure/config/config.js';
import { createAuthService } from '../auth/auth.service.js';
import { User } from '../auth/auth.model.js';
import { AuthSession } from '../auth/auth-session.model.js';
import { LearningSession } from '../sessions/sessions.model.js';
import { ContentSection } from '../content/content.model.js';
import { importContent } from '../content/content.import.js';
import { loadContent } from '../content/content.service.js';
import { learnerEvents } from '../learning-events/learning-events.service.js';
import { reviewAssessment } from '../assessments/assessments.service.js';
import { replay } from '@vaani/learning-core';
const config = loadConfig({
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://test',
  ACCESS_TOKEN_SECRET: 'a'.repeat(48),
  REFRESH_TOKEN_PEPPER: 'b'.repeat(48),
  WEB_ORIGINS: 'http://localhost:5173',
  AUTH_RATE_MAX: '1000',
});
const auth = createAuthService(config);
const app = createApp(config, auth);
let mongo: MongoMemoryServer;
let token: string;
let userId: string;
const get = (path: string) =>
  request(app)
    .get('/api/v1' + path)
    .auth(token, { type: 'bearer' });
const post = (path: string, body: object = {}) =>
  request(app)
    .post('/api/v1' + path)
    .auth(token, { type: 'bearer' })
    .send(body);
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.init(),
    AuthSession.init(),
    LearningSession.init(),
    ContentSection.init(),
  ]);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([
    LearningSession.deleteMany({}),
    User.deleteMany({}),
    AuthSession.deleteMany({}),
  ]);
  const result = await auth.signup('learner@example.com', 'abcdefgh');
  token = result.accessToken;
  userId = result.user.id;
});
describe('content import and API ownership', () => {
  it('imports every section idempotently, preserving source and review flags', async () => {
    const one = await importContent();
    const two = await importContent();
    expect(one.hash).toBe(two.hash);
    expect(await ContentSection.countDocuments()).toBe(67);
    const lexical = await ContentSection.findOne({
      section: 'lexicalConcepts',
    });
    expect(lexical!.payload).toEqual(
      loadContent().catalog.master.lexicalConcepts,
    );
    expect(one.counts.lexicalConcepts).toBe(622);
  });
  it('requires auth and returns one course, not selectable level courses', async () => {
    expect((await request(app).get('/api/v1/course')).status).toBe(401);
    const res = await get('/course');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Telugu Course');
    expect(res.body).not.toHaveProperty('courses');
    expect(res.body.progress.level).toBe('A0');
  });
  it('reuses the active session and rejects access by a different user', async () => {
    const first = await post('/sessions', { minutes: 5 });
    const second = await post('/sessions', { minutes: 5 });
    expect(first.body.id).toBe(second.body.id);
    const other = await auth.signup('other@example.com', 'abcdefgh');
    expect(
      (
        await request(app)
          .get('/api/v1/sessions/' + first.body.id)
          .auth(other.accessToken, { type: 'bearer' })
      ).status,
    ).toBe(404);
  });
});
describe('persisted learning journey', () => {
  it('runs a fresh learner through contextual choices, spoken recall and safe sentence tiles', async () => {
    let { body: s } = await post('/sessions', { minutes: 60 });
    expect(s.presentation.targetLanguage).toMatchObject({
      code: 'te',
      speechLocale: 'te-IN',
      hasRomanization: true,
    });
    expect(s.presentation.baseLanguage.code).toBe('en');
    const submit = async (action: string, response = '') => {
      const result = await post(`/sessions/${s.id}/events`, {
        eventId: randomUUID(),
        activityId: s.activity.id,
        action,
        response,
        inputMode: 'speech',
        latencyMs: 1000,
      });
      expect(result.status).toBe(200);
      s = result.body.session;
      return result.body;
    };
    const advance = async () => {
      const a = s.activity;
      const item = loadContent().catalog.items[a.conceptId];
      if (a.phase === 'exposure') return submit('expose');
      if (a.dimension === 'listening_recognition') await submit('audio');
      return submit(
        'answer',
        a.choices?.length
          ? item.id
          : [
                'meaning_recall',
                'meaning_recognition',
                'audio_to_meaning',
                'gist',
                'audio_recognition',
                'pattern_discovery',
              ].includes(a.type)
            ? item.meaning.en
            : item.telugu,
      );
    };
    for (
      let step = 0;
      step < 30 && s.activity?.type !== 'context_recognition';
      step++
    )
      await advance();
    expect(s.activity.conceptId).toBe('g01');
    expect(s.activity.intent.response).toBe('choose_target');
    expect(s.activity.contextCue.meaning).toBeTruthy();
    const current = s.activity.id;
    await submit('audio');
    const wrong = await submit('answer', 'te.lex.water');
    expect(wrong.classification).toBe('incorrect');
    expect(wrong.feedback).toBe('Try again');
    expect(s.activity.id).toBe(current);
    const accepted = await submit('answer', 'g01');
    expect(accepted.classification).toBe('correct');
    expect(accepted.feedback).toBe('Correct');
    for (
      let step = 0;
      step < 40 && s.activity?.type !== 'sentence_construction';
      step++
    )
      await advance();
    expect(s.activity.type).toBe('sentence_construction');
    expect(s.activity.target).toBeNull();
    expect(
      s.activity.tiles.map((tile: { text: string }) => tile.text).sort(),
    ).toEqual(['నాకు', 'నీళ్లు', 'కావాలి'].sort());
    const done = await submit('answer', 'నాకు నీళ్లు కావాలి');
    expect(done.classification).toBe('correct');
    const reloaded = await get(`/sessions/${s.id}`);
    expect(reloaded.body.activity.id).toBe(s.activity.id);
  });
  it('rebuilds prerequisites after repeated oral failure and keeps self-check evidence modest', async () => {
    let { body: s } = await post('/sessions', { minutes: 5 });
    const act = async (
      action: string,
      response = '',
      inputMode = 'speech',
      selfRating?: string,
    ) => {
      const result = await post(`/sessions/${s.id}/events`, {
        eventId: randomUUID(),
        activityId: s.activity.id,
        action,
        response,
        inputMode,
        selfRating,
        latencyMs: 1000,
      });
      expect(result.status).toBe(200);
      s = result.body.session;
      return result.body;
    };
    for (let i = 0; i < 15 && s.activity.intent.response !== 'speak'; i++) {
      if (s.activity.phase === 'exposure') await act('expose');
      else {
        if (s.activity.intent.skill === 'listening') await act('audio');
        await act('answer', s.activity.conceptId);
      }
    }
    expect(s.activity.intent.response).toBe('speak');
    const failedId = s.activity.id;
    await act('answer', 'unrelated');
    await act('answer', 'unrelated');
    expect(s.activity.phase).toBe('exposure');
    expect(s.activity.target.telugu).toBe('నీళ్లు');
    await act('expose');
    expect(['choose_media', 'choose_target']).toContain(
      s.activity.intent.response,
    );
    await act('audio');
    await act('answer', s.activity.conceptId);
    expect(s.activity.id).toBe(failedId);
    await act('hint');
    const fallback = await act('answer', '', 'self', 'good');
    expect(fallback.evidence).toBe('self_reported');
    const state = replay(loadContent().catalog, await learnerEvents(userId));
    expect(
      state.concepts['te.lex.water']!.dimensions.spoken_production ?? 0,
    ).toBeLessThan(1);
  });
  it('shows explained first exposure, hides recall answers, saves events idempotently, and resumes', async () => {
    const started = await post('/sessions', { minutes: 5 });
    expect(started.status).toBe(201);
    let session = started.body;
    expect(session.activity.phase).toBe('exposure');
    expect(session.activity.target.meaning.en).toBeTruthy();
    expect(session.activity.target.romanization).toBeTruthy();
    expect(session.activity.target.media.url).toBe(
      '/media/telugu/beginner/water.jpg',
    );
    expect(session.activity.target.context).toBeUndefined();
    const eventId = randomUUID();
    const body = { eventId, activityId: session.activity.id, action: 'expose' };
    const saved = await post(`/sessions/${session.id}/events`, body);
    expect(saved.status).toBe(200);
    const count = (await learnerEvents(userId)).length;
    await post(`/sessions/${session.id}/events`, body);
    expect((await learnerEvents(userId)).length).toBe(count);
    session = saved.body.session;
    while (session.activity.phase === 'exposure') {
      const r = await post(`/sessions/${session.id}/events`, {
        eventId: randomUUID(),
        activityId: session.activity.id,
        action: 'expose',
      });
      expect(r.status).toBe(200);
      session = r.body.session;
    }
    expect(session.activity.target).toBeNull();
    const reloaded = await get(`/sessions/${session.id}`);
    expect(reloaded.body.activity.id).toBe(session.activity.id);
    const hint = await post(`/sessions/${session.id}/events`, {
      eventId: randomUUID(),
      activityId: session.activity.id,
      action: 'hint',
    });
    expect(hint.body.session.activity.target.meaning.en).toBeTruthy();
    const result = await post(`/sessions/${session.id}/events`, {
      eventId: randomUUID(),
      activityId: session.activity.id,
      action: 'answer',
      response: hint.body.target.meaning.en,
      latencyMs: 1000,
    });
    expect(result.status).toBe(200);
    expect(result.body.evidence).not.toBe('independent');
    const state = replay(loadContent().catalog, await learnerEvents(userId));
    expect(Object.keys(state.concepts).length).toBeGreaterThan(0);
  });
  it('rejects fabricated/out-of-order answers and prevents simultaneous duplicate progress', async () => {
    const { body: s } = await post('/sessions', { minutes: 5 });
    expect(
      (
        await post(`/sessions/${s.id}/events`, {
          eventId: randomUUID(),
          activityId: 'fake',
          action: 'answer',
          response: 'test',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(`/sessions/${s.id}/events`, {
          eventId: randomUUID(),
          activityId: s.activity.id,
          action: 'answer',
          response: 'test',
        })
      ).status,
    ).toBe(409);
    const input = {
      eventId: randomUUID(),
      activityId: s.activity.id,
      action: 'expose',
    };
    const results = await Promise.all([
      post(`/sessions/${s.id}/events`, input),
      post(`/sessions/${s.id}/events`, input),
    ]);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect(
      (await learnerEvents(userId)).filter((e) => e.id === input.eventId),
    ).toHaveLength(1);
  });
  it('finishes with a summary and introduces more content in second and third sessions', async () => {
    const exposed = new Set<string>();
    for (let round = 0; round < 3; round++) {
      let { body: s } = await post('/sessions', { minutes: 5 });
      let newExposures = 0;
      let steps = 0;
      while (s.activity && steps++ < 100) {
        const a = s.activity;
        if (a.phase === 'exposure') {
          if (!exposed.has(a.conceptId)) {
            newExposures++;
            exposed.add(a.conceptId);
          }
          const r = await post(`/sessions/${s.id}/events`, {
            eventId: randomUUID(),
            activityId: a.id,
            action: 'expose',
          });
          expect(r.status).toBe(200);
          s = r.body.session;
          if (newExposures >= 3) break;
        } else {
          const { catalog } = loadContent();
          const item = catalog.items[a.conceptId];
          const r = await post(`/sessions/${s.id}/events`, {
            eventId: randomUUID(),
            activityId: a.id,
            action: 'answer',
            response: a.choices?.length
              ? item.id
              : a.dimension === 'meaning_recognition' ||
                  a.dimension === 'listening_recognition'
                ? item.meaning.en
                : item.telugu,
            inputMode: 'speech',
            latencyMs: 1000,
          });
          expect(r.status).toBe(200);
          s = r.body.session;
        }
      }
      expect(newExposures).toBeGreaterThan(0);
      const finished = await post(`/sessions/${s.id}/finish`, {
        eventId: randomUUID(),
      });
      expect(finished.status).toBe(200);
      expect(finished.body.status).toBe('completed');
      expect(finished.body.summary.introduced).toBeGreaterThan(0);
      expect((await get(`/sessions/${s.id}`)).body.status).toBe('completed');
    }
  });
  it('open assessment attempts stay unverified until trusted rubric review', async () => {
    const next = await get('/assessments/next');
    expect(next.body.assessment).toBeTruthy();
    const attempt = await post(
      `/assessments/${next.body.assessment.id}/attempts`,
      { response: 'నా పేరు అనూ. మీ పేరు ఏంటి?' },
    );
    expect(attempt.status).toBe(201);
    expect((await get('/progress')).body.level).toBe('A0');
    const caps = loadContent().catalog.master.levelExitCapabilities
      .A0 as string[];
    await reviewAssessment({
      reviewId: randomUUID(),
      userId,
      attemptId: attempt.body.attemptId,
      reviewer: 'test reviewer',
      passed: true,
      capabilities: caps,
    });
    expect((await get('/progress')).body.level).toBe('A0');
    await expect(
      reviewAssessment({
        reviewId: randomUUID(),
        userId,
        attemptId: attempt.body.attemptId,
        reviewer: 'test reviewer',
        passed: true,
        capabilities: caps,
      }),
    ).rejects.toMatchObject({ code: 'already_reviewed' });
  });
});
