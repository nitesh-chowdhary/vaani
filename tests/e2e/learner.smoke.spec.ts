import { test, expect } from '@playwright/test';
import {
  signup,
  start,
  answer,
  audit,
  screenshot,
  monitor,
  syntheticSpeech,
  eventAction,
} from './helpers/learner';

test('fresh learner completes 50 adaptive activities with stable photographic feedback', async ({
  page,
}, info) => {
  const diagnostics = monitor(page);
  await syntheticSpeech(page);
  const credentials = await signup(page);
  diagnostics.signedIn();
  await audit(page);
  await screenshot(page, info, 'course-home');
  let session = await start(page);
  await screenshot(page, info, 'session-entry');
  let wrongAnswered = false;
  let romanizedAccepted = false;
  const modalities: Record<string, number> = {};
  const visited: { index: number; type: string; concept: string }[] = [];
  for (let attempts = 0; session.cursor < 50 && attempts < 100; attempts++) {
    const activity = session.activity;
    expect(activity, 'Session ended before 50 activities').toBeTruthy();
    await audit(page);
    const modality = activity!.intent?.response ?? activity!.type;
    modalities[modality] = (modalities[modality] ?? 0) + 1;
    visited.push({
      index: session.cursor,
      type: activity!.type,
      concept: activity!.conceptId,
    });
    await screenshot(page, info, `${session.cursor}-${activity!.type}`);
    if (activity!.audio) {
      const audio = page.getByRole('button', {
        name: 'Play Telugu audio',
        exact: true,
      });
      if (await audio.count()) {
        await audio.click();
        // Playback callback can persist an audio event. Wait for the UI to unlock.
        await expect(audio).toBeEnabled();
      }
    }
    const shouldMiss = !wrongAnswered && (activity!.choices?.length ?? 0) > 1;
    const priorCursor = session.cursor;
    const oralText =
      !romanizedAccepted && activity!.intent?.response === 'speak'
        ? true
        : undefined;
    session = await answer(page, info, session, shouldMiss, oralText);
    if (oralText) romanizedAccepted = true;
    if (shouldMiss) wrongAnswered = true;
    else expect(session.cursor).toBeGreaterThan(priorCursor);
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(Math.round((session.cursor / session.total) * 100)),
    );
    if (session.cursor === 20) {
      await page.reload();
      await expect(page.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        String(Math.round((session.cursor / session.total) * 100)),
      );
      await screenshot(page, info, 'session-after-reload');
    }
  }
  expect(session.cursor).toBeGreaterThanOrEqual(50);
  expect(wrongAnswered).toBe(true);
  expect(romanizedAccepted).toBe(true);
  expect(modalities.speak ?? 0).toBeGreaterThan(0);
  expect(
    (modalities.choose_media ?? 0) + (modalities.choose_target ?? 0),
  ).toBeGreaterThan(0);
  expect(modalities.type_base ?? 0).toBe(0);
  await info.attach('activities-and-modalities', {
    body: JSON.stringify({ visited, modalities }, null, 2),
    contentType: 'application/json',
  });
  await audit(page);
  await screenshot(page, info, 'session-after-50');
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(
    page.getByRole('heading', { name: 'Session summary' }),
  ).toBeVisible();
  await screenshot(page, info, 'session-summary');
  await page.getByRole('link', { name: 'Continue Telugu' }).click();
  // Verify normal login using the account created through the UI.
  const loggedOut = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/logout'),
  );
  await page.getByRole('button', { name: 'Log out' }).click();
  expect((await loggedOut).ok()).toBe(true);
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  const next = await start(page);
  expect(next.id).not.toBe(session.id);
  await audit(page);
  expect(diagnostics.issues).toEqual([]);
});

test('unavailable microphone offers oral self-check instead of default typing', async ({
  page,
}, info) => {
  const diagnostics = monitor(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: undefined,
    });
  });
  await signup(page);
  diagnostics.signedIn();
  let session = await start(page);
  // Advance the generated activities, using the oral fallback at the first speech target.
  for (let step = 0; step < 20; step++) {
    if (session.activity?.intent?.response === 'speak') break;
    session = await answer(page, info, session);
  }
  expect(session.activity?.intent?.response).toBe('speak');
  await expect(page.getByLabel('Your response')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Listen and repeat', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'I said it', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Your response')).toHaveCount(0);
  await screenshot(page, info, 'speech-fallback');
  const result = await eventAction(page, () =>
    page.getByRole('button', { name: 'I said it', exact: true }).click(),
  );
  expect(result.evidence).not.toBe('independent');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await audit(page);
  expect(diagnostics.issues).toEqual([]);
});

test('image delivery failure keeps a real 30-activity session usable', async ({
  page,
}, info) => {
  const diagnostics = monitor(page);
  await syntheticSpeech(page);
  // Fault injection only at the image delivery boundary: real API, auth,
  // session planning, evaluation and persistence remain untouched.
  await page.route(/\.(jpg|jpeg|webp|png)(\?|$)/i, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: 'deliberately invalid image bytes',
    }),
  );
  await signup(page);
  diagnostics.signedIn();
  let session = await start(page);
  for (let attempts = 0; session.cursor < 30 && attempts < 50; attempts++) {
    await expect
      .poll(() => page.locator('.learning-photo img').count(), {
        timeout: 25000,
      })
      .toBe(0);
    await expect(
      page.getByText(/image unavailable|photograph unavailable/i),
    ).toHaveCount(0);
    await audit(page);
    if (session.activity?.choices?.length)
      await expect(page.locator('.word-choice').first()).toBeVisible();
    session = await answer(page, info, session);
  }
  expect(session.cursor).toBeGreaterThanOrEqual(30);
  await screenshot(page, info, 'session-after-image-outage');
  expect(diagnostics.issues).toEqual([]);
});

test('P0 ASR errors never block 30 activities completed with typed oral recall', async ({
  page,
}, info) => {
  const diagnostics = monitor(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: undefined,
    });
  });
  await signup(page);
  diagnostics.signedIn();
  let session = await start(page);
  let fallbackCount = 0;
  for (let i = 0; i < 40 && session.cursor < 30; i++) {
    const a = session.activity!;
    await audit(page);
    if (a.intent?.response === 'speak') {
      const result = await eventAction(
        page,
        () => page.getByRole('button', { name: /^Speak / }).click(),
        'recognition_problem',
      );
      expect(result.session.activity?.id).toBe(a.id);
      await expect(
        page.getByRole('button', { name: 'Type instead', exact: true }),
      ).toBeEnabled();
      session = await answer(page, info, session, false, true);
      fallbackCount++;
    } else session = await answer(page, info, session);
  }
  expect(session.cursor).toBeGreaterThanOrEqual(30);
  expect(fallbackCount).toBeGreaterThan(3);
  await screenshot(page, info, 'p0-after-30-typed');
  expect(diagnostics.issues).toEqual([]);
});
test('P0 a stalled microphone always has Skip for now', async ({ page }) => {
  await syntheticSpeech(page);
  await signup(page);
  let session = await start(page);
  for (let i = 0; i < 12 && session.activity?.intent?.response !== 'speak'; i++)
    session = await answer(page, test.info(), session);
  const current = session.activity!.id;
  await page.getByRole('button', { name: /^Speak / }).click();
  const result = await eventAction(
    page,
    () => page.getByRole('button', { name: 'Skip for now' }).click(),
    'skip',
  );
  expect(result.session.activity?.id).not.toBe(current);
  expect(result.evidence).toBeUndefined();
});
