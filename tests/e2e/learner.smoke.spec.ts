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

test('fresh learner completes 30 adaptive activities with stable photographic feedback', async ({
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
  const modalities: Record<string, number> = {};
  const visited: { index: number; type: string; concept: string }[] = [];
  for (let attempts = 0; session.cursor < 30 && attempts < 60; attempts++) {
    const activity = session.activity;
    expect(activity, 'Session ended before 30 activities').toBeTruthy();
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
    const shouldMiss =
      !wrongAnswered &&
      activity!.choiceMode === 'media' &&
      (activity!.choices?.length ?? 0) > 1;
    const priorCursor = session.cursor;
    session = await answer(page, info, session, shouldMiss);
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
  expect(session.cursor).toBeGreaterThanOrEqual(30);
  expect(wrongAnswered).toBe(true);
  expect(modalities.speak ?? 0).toBeGreaterThan(0);
  expect(
    (modalities.choose_media ?? 0) + (modalities.choose_target ?? 0),
  ).toBeGreaterThan(0);
  expect(modalities.type_base ?? 0).toBe(0);
  await info.attach('activities-and-modalities', {
    body: JSON.stringify({ visited, modalities }, null, 2),
    contentType: 'application/json',
  });
  await screenshot(page, info, 'session-after-30');
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
